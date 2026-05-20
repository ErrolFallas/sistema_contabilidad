const { pool } = require('../db/pool');

const PROCESSED_OK = ['COMPLETED', 'PERSISTED', 'EXCEL_DONE'];
const PENDING = ['PENDING', 'PROCESSING', 'OCR_DONE', 'EXTRACTED', 'VALIDATED'];

async function stats(_req, res, next) {
  try {
    const [
      [byStatus],
      [bySource],
      [byIva],
      [topProviders],
      [monthly],
      [currency],
      [errorsRecent],
    ] = await Promise.all([
      pool.query('SELECT status, COUNT(*) AS count FROM documents GROUP BY status'),
      pool.query('SELECT source_type, COUNT(*) AS count FROM documents GROUP BY source_type'),
      pool.query(
        `SELECT
            COALESCE(il.tarifa_iva, 'SIN_DATO') AS tarifa,
            COUNT(*)                            AS lineas,
            COALESCE(SUM(il.base_gravable), 0)  AS base_total,
            COALESCE(SUM(il.monto_iva), 0)      AS iva_total
         FROM invoice_lines il
         JOIN invoices i  ON i.id = il.invoice_id
         JOIN documents d ON d.id = i.document_id
         WHERE d.status IN (?, ?, ?)
         GROUP BY il.tarifa_iva
         ORDER BY iva_total DESC`,
        PROCESSED_OK
      ),
      pool.query(
        `SELECT
            COALESCE(NULLIF(TRIM(i.proveedor_nombre), ''), '(sin nombre)') AS proveedor,
            COUNT(*)                                                       AS facturas,
            COALESCE(SUM(COALESCE(i.total_colones, i.total)), 0)           AS total_crc
         FROM invoices i
         JOIN documents d ON d.id = i.document_id
         WHERE d.status IN (?, ?, ?)
         GROUP BY proveedor
         ORDER BY total_crc DESC
         LIMIT 5`,
        PROCESSED_OK
      ),
      pool.query(
        `SELECT
            DATE_FORMAT(d.received_at, '%Y-%m')                  AS mes,
            COUNT(DISTINCT d.id)                                  AS documentos,
            COALESCE(SUM(COALESCE(i.total_colones, i.total, 0)), 0) AS total_crc
         FROM documents d
         LEFT JOIN invoices i ON i.document_id = d.id
         WHERE d.received_at >= DATE_SUB(CURRENT_DATE, INTERVAL 5 MONTH)
         GROUP BY mes
         ORDER BY mes ASC`
      ),
      pool.query(
        `SELECT fecha, valor
           FROM currency_rates
          WHERE moneda = 'USD' AND tipo = 'VENTA'
          ORDER BY fecha DESC
          LIMIT 1`
      ),
      pool.query(
        `SELECT id, original_filename, error_message, received_at
           FROM documents
          WHERE status = 'ERROR'
          ORDER BY id DESC
          LIMIT 5`
      ),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)]));
    const sourceMap = Object.fromEntries(bySource.map((r) => [r.source_type, Number(r.count)]));

    const sumOver = (statuses) =>
      statuses.reduce((acc, s) => acc + (statusMap[s] || 0), 0);

    res.json({
      generated_at: new Date().toISOString(),
      totals: {
        all: Object.values(statusMap).reduce((a, b) => a + b, 0),
        procesadas: sumOver(PROCESSED_OK),
        pendientes: sumOver(PENDING),
        duplicadas: statusMap.DUPLICATE || 0,
        errores: statusMap.ERROR || 0,
        revision: statusMap.REVIEW || 0,
      },
      by_status: statusMap,
      by_source: {
        DRIVE: sourceMap.DRIVE || 0,
        GMAIL: sourceMap.GMAIL || 0,
        MANUAL: sourceMap.MANUAL || 0,
      },
      by_iva_rate: byIva.map((r) => ({
        tarifa: r.tarifa,
        lineas: Number(r.lineas),
        base_total: Number(r.base_total),
        iva_total: Number(r.iva_total),
      })),
      top_providers: topProviders.map((r) => ({
        proveedor: r.proveedor,
        facturas: Number(r.facturas),
        total_crc: Number(r.total_crc),
      })),
      monthly_evolution: monthly.map((r) => ({
        mes: r.mes,
        documentos: Number(r.documentos),
        total_crc: Number(r.total_crc),
      })),
      currency_usd: currency.length
        ? { fecha: currency[0].fecha, valor: Number(currency[0].valor) }
        : null,
      errors_recent: errorsRecent.map((r) => ({
        id: r.id,
        original_filename: r.original_filename,
        error_message: r.error_message,
        received_at: r.received_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { stats };
