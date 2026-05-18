const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { processFile } = require('../services/pipelineService');
const { traceList } = require('../services/traceService');
const { processedExcelPath } = require('../services/storageService');

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (e) {
    console.warn('[safeUnlink]', p, e.message);
    return false;
  }
}

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

/**
 * Elimina un documento: cascade en BD borra raw_ocr, ai_extractions,
 * processing_trace, excel_mapping, invoices, invoice_lines del documento.
 * Tambien elimina el archivo fisico de storage/uploads.
 *
 * Importante (politica de auditoria, plan v2.1 seccion 14.1 "no eliminar
 * historial"): este endpoint es para uso ADMIN durante desarrollo o cuando
 * el documento fue cargado por error. Las celdas del Excel ya escritas NO
 * se borran del archivo (se eliminan de excel_mapping, pero el .xlsx
 * mantiene los datos hasta que se reinicie el Reintegro).
 */
async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.query(
      'SELECT id, storage_path, original_filename FROM documents WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'NotFound' });
    const doc = rows[0];

    // Borrar referencia como duplicate_document_id de OTROS documentos primero
    await pool.query(
      'UPDATE documents SET duplicate_document_id = NULL WHERE duplicate_document_id = ?',
      [id]
    );
    await pool.query('DELETE FROM documents WHERE id = ?', [id]);

    const unlinked = safeUnlink(doc.storage_path);

    res.json({
      deleted: true,
      document_id: id,
      filename: doc.original_filename,
      physical_file_removed: unlinked,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Borra TODOS los documentos: cascade en BD limpia raw_ocr, raw_xml,
 * ai_extractions, processing_trace, excel_mapping, invoices, invoice_lines.
 * Tambien elimina los archivos fisicos en storage/uploads y resetea el
 * Reintegro vivo (xlsx + sidecar).
 *
 * Operacion irreversible. El frontend exige doble confirmacion.
 */
async function bulkRemove(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, storage_path FROM documents');
    const [[cnt]] = await pool.query('SELECT COUNT(*) AS n FROM documents');

    if (rows.length > 0) {
      // Cortar referencias self-fk antes del DELETE masivo.
      await pool.query('UPDATE documents SET duplicate_document_id = NULL');
      await pool.query('DELETE FROM documents');
    }

    let physicalRemoved = 0;
    for (const r of rows) {
      if (safeUnlink(r.storage_path)) physicalRemoved++;
    }

    // Reset Reintegro tambien (no tendria sentido dejar datos huerfanos en el Excel).
    const xlsx = processedExcelPath();
    const sidecar = xlsx.replace(/\.xlsx$/i, '.session');
    const xlsxRemoved = safeUnlink(xlsx);
    const sidecarRemoved = safeUnlink(sidecar);

    res.json({
      deleted: true,
      documents_deleted: cnt.n,
      physical_files_removed: physicalRemoved,
      reintegro_reset: { xlsx: xlsxRemoved, sidecar: sidecarRemoved },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Reinicia el archivo Reintegro vivo: borra .xlsx + sidecar .session.
 * El proximo upload empieza fresco (fila 14) con sesion UUID nueva.
 * NO toca la base de datos: la auditoria de Reintegros anteriores se
 * preserva en excel_mapping (asociada al UUID antiguo).
 */
async function resetReintegro(req, res, next) {
  try {
    const xlsx = processedExcelPath();
    const sidecar = xlsx.replace(/\.xlsx$/i, '.session');
    const removedXlsx = safeUnlink(xlsx);
    const removedSidecar = safeUnlink(sidecar);
    res.json({
      reset: true,
      removed: { xlsx: removedXlsx, sidecar: removedSidecar },
      message: 'Reintegro reiniciado. El proximo upload empezara en fila 14.',
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { upload, list, detail, trace, downloadReintegro, remove, resetReintegro, bulkRemove };
