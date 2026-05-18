/**
 * Gestion de usuarios - solo rol ADMIN.
 * Regla del proyecto: maximo 3 usuarios con rol ADMIN simultaneamente.
 *  - Al crear un usuario ADMIN, se valida que no haya ya 3 ADMIN activos+inactivos.
 *  - Al promover un USUARIO a ADMIN, misma validacion.
 *  - Al degradar el ULTIMO admin activo se prohibe (mantener al menos un admin operativo).
 *  - No se expone password_hash en ninguna respuesta.
 */
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../db/pool');

const MAX_ADMINS = 3;

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(190),
  password: z.string().min(8).max(200),
  role: z.enum(['ADMIN', 'USUARIO']).default('USUARIO'),
});

const updateSchema = z.object({
  full_name: z.string().min(1).max(190).optional(),
  role: z.enum(['ADMIN', 'USUARIO']).optional(),
  activo: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

async function countAdmins({ excludeId } = {}) {
  const args = [];
  let where = "role = 'ADMIN'";
  if (excludeId) { where += ' AND id <> ?'; args.push(excludeId); }
  const [[r]] = await pool.query(`SELECT COUNT(*) AS n FROM users WHERE ${where}`, args);
  return r.n;
}

async function countActiveAdmins({ excludeId } = {}) {
  const args = [];
  let where = "role = 'ADMIN' AND activo = 1";
  if (excludeId) { where += ' AND id <> ?'; args.push(excludeId); }
  const [[r]] = await pool.query(`SELECT COUNT(*) AS n FROM users WHERE ${where}`, args);
  return r.n;
}

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, full_name, role, activo, last_login_at, created_at, updated_at
         FROM users
         ORDER BY id ASC`
    );
    const admins = await countAdmins();
    res.json({ items: rows, admin_count: admins, admin_limit: MAX_ADMINS });
  } catch (e) {
    next(e);
  }
}

async function create(req, res, next) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'BadRequest', issues: parsed.error.flatten() });
    }
    const { email, full_name, password, role } = parsed.data;

    const [exists] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (exists.length > 0) {
      return res.status(409).json({ error: 'Conflict', message: 'Ya existe un usuario con ese correo.' });
    }

    if (role === 'ADMIN') {
      const total = await countAdmins();
      if (total >= MAX_ADMINS) {
        return res.status(409).json({
          error: 'AdminLimitReached',
          message: `Solo se permiten ${MAX_ADMINS} administradores en el sistema. Actualmente hay ${total}.`,
        });
      }
    }

    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, activo)
       VALUES (?, ?, ?, ?, 1)`,
      [email, hash, full_name, role]
    );
    const [rows] = await pool.query(
      `SELECT id, email, full_name, role, activo, created_at FROM users WHERE id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'BadRequest', issues: parsed.error.flatten() });
    }
    const { full_name, role, activo, password } = parsed.data;

    const [rows] = await pool.query(
      'SELECT id, email, role, activo FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    const current = rows[0];
    if (!current) return res.status(404).json({ error: 'NotFound' });

    // Regla 1: promover a ADMIN si actualmente no lo es -> validar limite.
    if (role === 'ADMIN' && current.role !== 'ADMIN') {
      const total = await countAdmins();
      if (total >= MAX_ADMINS) {
        return res.status(409).json({
          error: 'AdminLimitReached',
          message: `Solo se permiten ${MAX_ADMINS} administradores. Actualmente hay ${total}.`,
        });
      }
    }

    // Regla 2: degradar ADMIN actualmente activo -> verificar que quede al menos 1 admin activo.
    if ((role === 'USUARIO' && current.role === 'ADMIN') ||
        (current.role === 'ADMIN' && current.activo && activo === false)) {
      const remaining = await countActiveAdmins({ excludeId: id });
      if (remaining < 1) {
        return res.status(409).json({
          error: 'LastAdmin',
          message: 'No se puede degradar/desactivar al ultimo administrador activo.',
        });
      }
    }

    // Regla 3: nadie puede auto-degradarse o auto-desactivarse (UX defensiva).
    if (req.user?.sub === id) {
      if (role && role !== current.role) {
        return res.status(409).json({ error: 'SelfDemote', message: 'No puede cambiar su propio rol.' });
      }
      if (activo === false) {
        return res.status(409).json({ error: 'SelfDeactivate', message: 'No puede desactivar su propia cuenta.' });
      }
    }

    const sets = [];
    const args = [];
    if (full_name !== undefined) { sets.push('full_name = ?'); args.push(full_name); }
    if (role !== undefined) { sets.push('role = ?'); args.push(role); }
    if (activo !== undefined) { sets.push('activo = ?'); args.push(activo ? 1 : 0); }
    if (password !== undefined) {
      const hash = await bcrypt.hash(password, 12);
      sets.push('password_hash = ?'); args.push(hash);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'BadRequest', message: 'Nada que actualizar.' });
    }
    args.push(id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args);

    const [out] = await pool.query(
      `SELECT id, email, full_name, role, activo, last_login_at, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.json(out[0]);
  } catch (e) {
    next(e);
  }
}

module.exports = { list, create, update, MAX_ADMINS };
