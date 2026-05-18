const { pool } = require('../db/pool');

/**
 * Trazabilidad por etapa segun seccion 11 del plan v2.1.
 * Cada etapa registra hora inicio, hora fin, duracion, resultado, error.
 *
 * Stages permitidos (ENUM processing_trace.stage):
 *   FILE_RECEIVED, HASH_CHECK, OCR_START, OCR_DONE, XML_PARSE,
 *   GEMINI_START, GEMINI_DONE, IVA_CLASSIFY, VALIDATION_DONE,
 *   MYSQL_DONE, EXCEL_START, EXCEL_DONE, ERROR
 */
async function traceStart(documentId, stage) {
  const [r] = await pool.query(
    `INSERT INTO processing_trace (document_id, stage, status, started_at)
     VALUES (?, ?, 'STARTED', CURRENT_TIMESTAMP(3))`,
    [documentId, stage]
  );
  return { traceId: r.insertId, startedAt: Date.now() };
}

async function traceEnd(traceId, startedAt, status = 'OK', message = null) {
  const ms = Date.now() - startedAt;
  await pool.query(
    `UPDATE processing_trace
       SET status = ?, message = ?, ended_at = CURRENT_TIMESTAMP(3), duration_ms = ?
     WHERE id = ?`,
    [status, message, ms, traceId]
  );
  return ms;
}

async function traceInstant(documentId, stage, status, message = null) {
  await pool.query(
    `INSERT INTO processing_trace (document_id, stage, status, message, started_at, ended_at, duration_ms)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), 0)`,
    [documentId, stage, status, message]
  );
}

async function traceList(documentId) {
  const [rows] = await pool.query(
    `SELECT id, stage, status, message, started_at, ended_at, duration_ms
       FROM processing_trace
      WHERE document_id = ?
      ORDER BY id ASC`,
    [documentId]
  );
  return rows;
}

/**
 * Ejecuta una etapa con trace automatico (start + end + error handling).
 */
async function withStage(documentId, stage, fn) {
  const { traceId, startedAt } = await traceStart(documentId, stage);
  try {
    const out = await fn();
    await traceEnd(traceId, startedAt, 'OK');
    return out;
  } catch (e) {
    await traceEnd(traceId, startedAt, 'ERROR', (e.message || String(e)).slice(0, 4000));
    throw e;
  }
}

module.exports = { traceStart, traceEnd, traceInstant, traceList, withStage };
