const { pool } = require('../db/pool');

const INVOICE_EDITABLE_FIELDS = {
  proveedor_nombre:       { type: 'string', max: 255 },
  proveedor_cedula:       { type: 'string', max: 50 },
  proveedor_tipo_cedula:  { type: 'enum',   values: ['FISICA', 'JURIDICA', 'DIMEX', 'NITE'] },
  numero_factura:         { type: 'string', max: 80 },
  fecha_emision:          { type: 'date' },
  moneda:                 { type: 'enum',   values: ['CRC', 'USD', 'EUR'] },
  subtotal:               { type: 'decimal' },
  descuento:              { type: 'decimal' },
  impuesto_total:         { type: 'decimal' },
  total:                  { type: 'decimal' },
  descripcion:            { type: 'string', max: 5000 },
  actividad_economica:    { type: 'string', max: 190 },
  estado_extraccion:      { type: 'enum',   values: ['OK', 'FALTANTE', 'REVISION'] },
};

const LINE_EDITABLE_FIELDS = {
  linea_num:        { type: 'integer' },
  producto:         { type: 'string', max: 5000 },
  categoria_fiscal: { type: 'string', max: 190 },
  cantidad:         { type: 'decimal' },
  precio_unitario:  { type: 'decimal' },
  base_gravable:    { type: 'decimal' },
  tarifa_iva:       { type: 'enum', values: ['0', '1', '2', '4', '13', 'EXENTO', 'REVISION'] },
  porcentaje_iva:   { type: 'decimal' },
  monto_iva:        { type: 'decimal' },
  subtotal:         { type: 'decimal' },
  total:            { type: 'decimal' },
};

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function coerceValue(spec, value) {
  if (value === null || value === '' || value === undefined) return null;
  switch (spec.type) {
    case 'string': {
      const s = String(value);
      if (spec.max && s.length > spec.max) throw badRequest(`Valor excede ${spec.max} caracteres`);
      return s;
    }
    case 'integer': {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) throw badRequest('Valor no es un numero entero');
      return n;
    }
    case 'decimal': {
      const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
      if (!Number.isFinite(n)) throw badRequest('Valor no es un numero');
      return n;
    }
    case 'date': {
      const s = String(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest('Fecha debe ser YYYY-MM-DD');
      return s;
    }
    case 'enum': {
      const s = String(value);
      if (!spec.values.includes(s)) throw badRequest(`Valor invalido. Permitidos: ${spec.values.join(', ')}`);
      return s;
    }
    default:
      throw badRequest('Tipo de campo no soportado');
  }
}

function normalizeForCompare(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  return String(v);
}

async function applyEdits({ table, idValue, documentId, refIds, fieldsSpec, body, userId }) {
  const changes = body.changes || {};
  const reason = (body.reason || '').toString().slice(0, 1000);

  const unknown = Object.keys(changes).filter((k) => !fieldsSpec[k]);
  if (unknown.length) throw badRequest(`Campos no editables: ${unknown.join(', ')}`);

  const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [idValue]);
  const current = rows[0];
  if (!current) {
    const err = new Error(`Registro #${idValue} no encontrado`);
    err.status = 404;
    throw err;
  }

  const updates = [];
  for (const [field, rawValue] of Object.entries(changes)) {
    let coerced;
    try {
      coerced = coerceValue(fieldsSpec[field], rawValue);
    } catch (e) {
      throw badRequest(`${field}: ${e.message}`);
    }
    if (normalizeForCompare(current[field]) === normalizeForCompare(coerced)) continue;
    updates.push({ field, value: coerced, original: current[field] });
  }

  if (!updates.length) {
    return { row: current, applied: [] };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const setSql = updates.map((u) => `\`${u.field}\` = ?`).join(', ');
    const setParams = updates.map((u) => u.value);
    await conn.query(`UPDATE ${table} SET ${setSql} WHERE id = ?`, [...setParams, idValue]);
    for (const u of updates) {
      await conn.query(
        `INSERT INTO manual_edits
           (document_id, invoice_id, line_id, field_name, original_value, new_value, reason, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          refIds.invoice_id,
          refIds.line_id,
          u.field,
          u.original !== null && u.original !== undefined ? String(u.original) : null,
          u.value !== null && u.value !== undefined ? String(u.value) : null,
          reason || null,
          userId,
        ]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const [after] = await pool.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [idValue]);
  return { row: after[0], applied: updates.map((u) => u.field) };
}

async function editInvoice(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'BadRequest', message: 'Id invalido' });

    const [link] = await pool.query(`SELECT document_id FROM invoices WHERE id = ? LIMIT 1`, [id]);
    if (!link.length) return res.status(404).json({ error: 'NotFound', message: `Factura #${id} no encontrada` });

    const result = await applyEdits({
      table: 'invoices',
      idValue: id,
      documentId: link[0].document_id,
      refIds: { invoice_id: id, line_id: null },
      fieldsSpec: INVOICE_EDITABLE_FIELDS,
      body: req.body || {},
      userId: req.user.sub,
    });

    req.log.info({ invoice_id: id, fields: result.applied, user_id: req.user.sub }, 'invoice edited');
    res.json({ ok: true, invoice: result.row, applied: result.applied });
  } catch (err) {
    next(err);
  }
}

async function editLine(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'BadRequest', message: 'Id invalido' });

    const [link] = await pool.query(
      `SELECT i.document_id, l.invoice_id
         FROM invoice_lines l
         JOIN invoices i ON i.id = l.invoice_id
        WHERE l.id = ? LIMIT 1`,
      [id]
    );
    if (!link.length) return res.status(404).json({ error: 'NotFound', message: `Linea #${id} no encontrada` });

    const result = await applyEdits({
      table: 'invoice_lines',
      idValue: id,
      documentId: link[0].document_id,
      refIds: { invoice_id: link[0].invoice_id, line_id: id },
      fieldsSpec: LINE_EDITABLE_FIELDS,
      body: req.body || {},
      userId: req.user.sub,
    });

    req.log.info({ line_id: id, fields: result.applied, user_id: req.user.sub }, 'invoice line edited');
    res.json({ ok: true, line: result.row, applied: result.applied });
  } catch (err) {
    next(err);
  }
}

async function listEdits(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'BadRequest', message: 'Id invalido' });

    const [rows] = await pool.query(
      `SELECT me.id, me.field_name, me.original_value, me.new_value, me.reason,
              me.invoice_id, me.line_id, me.created_at,
              u.id AS user_id, u.email AS user_email, u.full_name AS user_name
         FROM manual_edits me
         LEFT JOIN users u ON u.id = me.user_id
        WHERE me.document_id = ?
        ORDER BY me.id DESC`,
      [id]
    );
    res.json({ edits: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  editInvoice,
  editLine,
  listEdits,
  INVOICE_EDITABLE_FIELDS,
  LINE_EDITABLE_FIELDS,
};
