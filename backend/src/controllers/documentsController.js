const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { processFile } = require('../services/pipelineService');
const { traceList } = require('../services/traceService');
const { processedExcelPath } = require('../services/storageService');

async function upload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'Archivo requerido (campo "file")' });
    }
    const out = await processFile({
      filePath: req.file.path,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      source_type: 'MANUAL',
      uploaded_by_user_id: req.user?.sub || null,
    });
    res.status(201).json(out);
  } catch (e) {
    next(e);
  }
}

async function list(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const status = req.query.status;
    const source = req.query.source;

    const wheres = [];
    const args = [];
    if (status) { wheres.push('d.status = ?'); args.push(status); }
    if (source) { wheres.push('d.source_type = ?'); args.push(source); }
    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    const [items] = await pool.query(
      `SELECT d.id, d.original_filename, d.source_type, d.mime_type, d.status, d.doc_kind,
              d.received_at, d.completed_at, d.duplicate_document_id,
              i.id AS invoice_id, i.proveedor_nombre, i.numero_factura,
              i.fecha_emision, i.moneda, i.total
         FROM documents d
         LEFT JOIN invoices i ON i.document_id = d.id
         ${where}
         ORDER BY d.id DESC
         LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS total FROM documents d ${where}`,
      args
    );
    res.json({ items, total: count.total, limit, offset });
  } catch (e) {
    next(e);
  }
}

async function detail(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const [docs] = await pool.query(`SELECT * FROM documents WHERE id = ? LIMIT 1`, [id]);
    if (!docs[0]) return res.status(404).json({ error: 'NotFound' });
    const [[ocr]] = await pool.query(
      `SELECT id, engine, language, ocr_text, page_count, confidence, duration_ms, created_at
         FROM raw_ocr WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
      [id]
    );
    const [invoices] = await pool.query(`SELECT * FROM invoices WHERE document_id = ?`, [id]);
    const invoiceIds = invoices.map((i) => i.id);
    let lines = [];
    if (invoiceIds.length) {
      const [rows] = await pool.query(
        `SELECT * FROM invoice_lines WHERE invoice_id IN (?) ORDER BY id ASC`,
        [invoiceIds]
      );
      lines = rows;
    }
    const [excelMap] = await pool.query(
      `SELECT id, template_type, sheet_name, row_num, col_letter, cell_ref, field_name, value_written, written_at
         FROM excel_mapping WHERE document_id = ? ORDER BY id ASC`,
      [id]
    );
    res.json({
      document: docs[0],
      ocr: ocr || null,
      invoices,
      lines,
      excel_mapping: excelMap,
    });
  } catch (e) {
    next(e);
  }
}

async function trace(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = await traceList(id);
    res.json({ document_id: id, trace: rows });
  } catch (e) {
    next(e);
  }
}

async function downloadReintegro(req, res, next) {
  try {
    const live = processedExcelPath();
    if (!fs.existsSync(live)) {
      return res.status(404).json({ error: 'NotFound', message: 'Aun no hay Reintegro generado.' });
    }
    res.download(live, 'Reintegro_actualizado.xlsx');
  } catch (e) {
    next(e);
  }
}

module.exports = { upload, list, detail, trace, downloadReintegro };
