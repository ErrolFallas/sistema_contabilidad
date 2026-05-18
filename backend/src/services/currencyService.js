/**
 * Conversion monetaria - seccion 9 del Plan Maestro v2.1.
 *
 * Reglas:
 *   - Si factura es CRC: no convertir.
 *   - Si factura es USD/EUR: convertir a CRC usando tipo de cambio VENTA del dia.
 *   - Persistir: monto original, tipo cambio, fecha cambio, monto convertido.
 *   - Nunca recalcular valores historicos.
 *
 * Fuente: API publica del Ministerio de Hacienda de Costa Rica
 *   GET https://api.hacienda.go.cr/indicadores/tc/dolar
 *
 * Respuesta (ejemplo):
 *   {
 *     "venta":  { "fecha": "2026-05-18T00:00:00-06:00", "valor": 510.5 },
 *     "compra": { "fecha": "2026-05-18T00:00:00-06:00", "valor": 504.0 }
 *   }
 *
 * (El BCCR es la fuente original; Hacienda republica el dato del dia sin token.)
 */
const axios = require('axios');
const { pool } = require('../db/pool');

const HACIENDA_URL = 'https://api.hacienda.go.cr/indicadores/tc/dolar';
const FUENTE = 'BCCR/Hacienda';

function toISODate(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Trae el tipo de cambio del DIA actual desde Hacienda y lo persiste.
 * Idempotente (UNIQUE en currency_rates).
 * Solo USD por ahora (Hacienda no expone EUR en este endpoint).
 */
async function fetchTodayFromHacienda() {
  const { data } = await axios.get(HACIENDA_URL, { timeout: 15000 });
  if (!data?.venta?.valor || !data?.compra?.valor) {
    throw new Error('Respuesta de Hacienda sin venta/compra');
  }
  const fechaIso = toISODate(data.venta.fecha) || toISODate(new Date());

  await upsertRate(fechaIso, 'USD', 'VENTA', Number(data.venta.valor));
  await upsertRate(fechaIso, 'USD', 'COMPRA', Number(data.compra.valor));

  return {
    fecha: fechaIso,
    moneda: 'USD',
    venta: Number(data.venta.valor),
    compra: Number(data.compra.valor),
    fuente: FUENTE,
  };
}

async function upsertRate(fechaIso, moneda, tipo, valor) {
  await pool.query(
    `INSERT INTO currency_rates (fecha, moneda, tipo, valor, fuente)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE valor = valor`, // INMUTABLE: si ya existe, no se sobreescribe.
    [fechaIso, moneda, tipo, valor, FUENTE]
  );
}

/**
 * Obtiene el tipo de cambio mas cercano (hacia atras) a una fecha.
 * Si la fecha exacta existe, la usa. Si no, busca la fecha anterior mas
 * reciente disponible (cubre fines de semana y feriados sin recalcular).
 *
 * Retorna { fecha, valor, moneda, tipo, fromCache } o null si no hay datos.
 */
async function getRateOnOrBefore(fecha, moneda = 'USD', tipo = 'VENTA') {
  const fechaIso = toISODate(fecha);
  if (!fechaIso) return null;
  const [rows] = await pool.query(
    `SELECT fecha, valor, moneda, tipo
       FROM currency_rates
      WHERE moneda = ? AND tipo = ? AND fecha <= ?
      ORDER BY fecha DESC
      LIMIT 1`,
    [moneda, tipo, fechaIso]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    fecha: toISODate(r.fecha),
    valor: Number(r.valor),
    moneda: r.moneda,
    tipo: r.tipo,
  };
}

/**
 * Asegura un tipo de cambio disponible para la fecha indicada. Si no existe en
 * BD ni hacia atras razonable (7 dias), fetcha hoy desde Hacienda y reintenta.
 */
async function ensureRate(fecha, moneda = 'USD', tipo = 'VENTA') {
  let r = await getRateOnOrBefore(fecha, moneda, tipo);
  if (r) return r;
  try {
    await fetchTodayFromHacienda();
  } catch (_e) {
    // Sigue sin tipo cambio: devolvera null abajo.
  }
  r = await getRateOnOrBefore(fecha, moneda, tipo);
  return r;
}

async function listRecent(limit = 30) {
  const [rows] = await pool.query(
    `SELECT fecha, moneda, tipo, valor, fuente, created_at
       FROM currency_rates
      ORDER BY fecha DESC, moneda, tipo
      LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ ...r, fecha: toISODate(r.fecha), valor: Number(r.valor) }));
}

module.exports = {
  fetchTodayFromHacienda,
  getRateOnOrBefore,
  ensureRate,
  listRecent,
  HACIENDA_URL,
  FUENTE,
};
