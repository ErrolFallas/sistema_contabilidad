const { pool } = require('../db/pool');

const STATUS_VALUES = ['PENDING', 'PROCESSING', 'OCR_DONE', 'EXTRACTED', 'VALIDATED', 'PERSISTED', 'EXCEL_DONE', 'COMPLETED', 'DUPLICATE', 'REVIEW', 'ERROR'];
const SOURCE_VALUES = ['DRIVE', 'GMAIL', 'MANUAL'];
const STAGE_VALUES = [
  'FILE_RECEIVED', 'HASH_CHECK', 'OCR_START', 'OCR_DONE',
  'XML_PARSE', 'GEMINI_START', 'GEMINI_DONE',
  'IVA_CLASSIFY', 'VALIDATION_DONE', 'MYSQL_DONE',
  'EXCEL_START', 'EXCEL_DONE', 'ERROR',
];

function parseList(value, allowed) {
  if (!value) return [];
  const arr = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  return arr.filter((v) => allowed.includes(v));
}

function parseDate(value) {
  if (!value) return null;
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

async function list(req, res, next) {
  try {
    const statuses = parseList(req.query.status, STATUS_VALUES);
    const sources = parseList(req.query.source, SOURCE_VALUES);
    const stages = parseList(req.query.current_stage, STAGE_VALUES);
    const dateFrom = parseDate(req.query.from);
    const dateTo = parseDate(req.query.to);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const filters = [];
    const params = [];
    if (statuses.length) { filters.push(`d.status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
    if (sources.length)  { filters.push(`d.source_type IN (${sources.map(() => '?').join(',')})`); params.push(...sources); }
    if (dateFrom)        { filters.push(`d.received_at >= ?`); params.push(`${dateFrom} 00:00:00`); }
    if (dateTo)          { filters.push(`d.received_at <= ?`); params.push(`${dateTo} 23:59:59`); }
    if (stages.length)   { filters.push(`lt.stage IN (${stages.map(() => '?').join(',')})`); params.push(...stages); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const listSql = `
      SELECT
        d.id, d.original_filename, d.source_type, d.status, d.doc_kind,
        d.received_at, d.completed_at, d.error_message,
        d.duplicate_document_id,
        lt.stage   AS current_stage,
        lt.status  AS current_stage_status,
        lt.message AS current_stage_message,
        lt.ended_at AS current_stage_at,
        agg.stages_total,
        agg.stages_ok,
        agg.total_duration_ms,
        i.proveedor_nombre,
        i.numero_factura,
        i.total AS invoice_total
      FROM documents d
      LEFT JOIN (
        SELECT t.document_id, t.stage, t.status, t.message, t.ended_at
          FROM processing_trace t
         INNER JOIN (
           SELECT document_id, MAX(id) AS max_id
             FROM processing_trace
            GROUP BY document_id
         ) m ON m.document_id = t.document_id AND m.max_id = t.id
      ) lt ON lt.document_id = d.id
      LEFT JOIN (
        SELECT document_id,
               COUNT(*) AS stages_total,
               SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) AS stages_ok,
               COALESCE(SUM(duration_ms), 0) AS total_duration_ms
          FROM processing_trace
         GROUP BY document_id
      ) agg ON agg.document_id = d.id
      LEFT JOIN invoices i ON i.document_id = d.id
      ${where}
      ORDER BY d.id DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
        FROM documents d
        LEFT JOIN (
          SELECT t.document_id, t.stage
            FROM processing_trace t
           INNER JOIN (
             SELECT document_id, MAX(id) AS max_id FROM processing_trace GROUP BY document_id
           ) m ON m.document_id = t.document_id AND m.max_id = t.id
        ) lt ON lt.document_id = d.id
      ${where}
    `;

    const [
      [items],
      [countRows],
      [byStatus],
      [byCurrentStage],
      [stageAvg],
    ] = await Promise.all([
      pool.query(listSql, [...params, limit, offset]),
      pool.query(countSql, params),
      pool.query(
        `SELECT d.status, COUNT(*) AS count
           FROM documents d
           LEFT JOIN (
             SELECT t.document_id, t.stage FROM processing_trace t
              INNER JOIN (SELECT document_id, MAX(id) AS max_id FROM processing_trace GROUP BY document_id) m
                ON m.document_id = t.document_id AND m.max_id = t.id
           ) lt ON lt.document_id = d.id
           ${where}
          GROUP BY d.status`,
        params
      ),
      pool.query(
        `SELECT lt.stage, COUNT(*) AS count
           FROM documents d
           LEFT JOIN (
             SELECT t.document_id, t.stage FROM processing_trace t
              INNER JOIN (SELECT document_id, MAX(id) AS max_id FROM processing_trace GROUP BY document_id) m
                ON m.document_id = t.document_id AND m.max_id = t.id
           ) lt ON lt.document_id = d.id
           ${where}
          GROUP BY lt.stage`,
        params
      ),
      pool.query(
        `SELECT stage,
                COUNT(*) AS occurrences,
                ROUND(AVG(duration_ms)) AS avg_duration_ms,
                MAX(duration_ms) AS max_duration_ms
           FROM processing_trace
          WHERE duration_ms IS NOT NULL
          GROUP BY stage
          ORDER BY avg_duration_ms DESC`
      ),
    ]);

    res.json({
      total: Number(countRows[0]?.total || 0),
      limit,
      offset,
      items: items.map((r) => ({
        id: r.id,
        original_filename: r.original_filename,
        source_type: r.source_type,
        status: r.status,
        doc_kind: r.doc_kind,
        received_at: r.received_at,
        completed_at: r.completed_at,
        error_message: r.error_message,
        duplicate_of: r.duplicate_document_id,
        current_stage: r.current_stage,
        current_stage_status: r.current_stage_status,
        current_stage_message: r.current_stage_message,
        current_stage_at: r.current_stage_at,
        stages_total: Number(r.stages_total || 0),
        stages_ok: Number(r.stages_ok || 0),
        total_duration_ms: Number(r.total_duration_ms || 0),
        proveedor_nombre: r.proveedor_nombre,
        numero_factura: r.numero_factura,
        invoice_total: r.invoice_total !== null ? Number(r.invoice_total) : null,
      })),
      stats: {
        by_status: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
        by_current_stage: Object.fromEntries(
          byCurrentStage
            .filter((r) => r.stage)
            .map((r) => [r.stage, Number(r.count)])
        ),
        stage_durations: stageAvg.map((r) => ({
          stage: r.stage,
          occurrences: Number(r.occurrences),
          avg_duration_ms: Number(r.avg_duration_ms || 0),
          max_duration_ms: Number(r.max_duration_ms || 0),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  STATUS_VALUES,
  SOURCE_VALUES,
  STAGE_VALUES,
};
