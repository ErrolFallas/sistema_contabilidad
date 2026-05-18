const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../db/pool');
const { signToken } = require('../middleware/auth');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'BadRequest', issues: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const [rows] = await pool.query(
      'SELECT id, email, password_hash, role, activo, full_name FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales invalidas' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales invalidas' });
    }
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
}

async function me(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, full_name, role, activo, created_at, last_login_at FROM users WHERE id = ? LIMIT 1',
      [req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'NotFound' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
}

module.exports = { login, me };
