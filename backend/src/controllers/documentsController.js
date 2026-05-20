const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { processFile } = require('../services/pipelineService');
const { traceList } = require('../services/traceService');
const { processedExcelPath } = require('../services/storageService');
const { logger } = require('../lib/logger');

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (e) {
    logger.warn({ path: p, err: e.message }, 'safeUnlink failed');
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

const STATUS_VALUES = ['PENDING','PROCESSING','OCR_DONE','EXTRACTED','VALIDATED','PERSISTED','EXCEL_DONE','COMPLETED','DUPLICATE','REVIEW','ERROR'];
const SOURCE_VALUES = ['DRIVE','GMAIL','MANUAL'];

function parseFilterList(value, allowed) {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter((v) => allowed.includes(v));
}

function parseFilterDate(value) {
  if (!value) return null;
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function list(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const statuses = parseFilterList(req.query.status, STATUS_VALUES);
    const sources = parseFilterList(req.query.source, SOURCE_VALUES);
    const from = parseFilterDate(req.query.from);
    const to = parseFilterDate(req.query.to);
    const search = (req.query.search || '').toString().trim().slice(0, 100);

    const wheres = [];
    const args = [];
    if (statuses.length) {
      wheres.push(`d.status IN (${statuses.map(() => '?').join(',')})`);
      args.push(...statuses);
    }
    if (sources.length) {
      wheres.push(`d.source_type IN (${sources.map(() => '?').join(',')})`);
      args.push(...sources);
    }
    if (from) { wheres.push('d.received_at >= ?'); args.push(`${from} 00:00:00`); }
    if (to)   { wheres.push('d.received_at <= ?'); args.push(`${to} 23:59:59`); }
    if (search) {
      wheres.push('(d.original_filename LIKE ? OR i.proveedor_nombre LIKE ? OR i.numero_factura LIKE ?)');
      const term = `%${search}%`;
      args.push(term, term, term);
    }
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
      `SELECT COUNT(DISTINCT d.id) AS total
         FROM documents d
         LEFT JOIN invoices i ON i.document_id = d.id
         ${where}`,
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
    const [validationRows] = await pool.query(
      `SELECT id, response_raw, response_json, created_at
         FROM ai_extractions
        WHERE document_id = ? AND purpose = 'VALIDATION'
        ORDER BY id DESC
        LIMIT 1`,
      [id]
    );
    let validation = null;
    if (validationRows[0]) {
      const raw = validationRows[0].response_json;
      const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
      validation = {
        summary: validationRows[0].response_raw,
        result: parsed,
        created_at: validationRows[0].created_at,
      };
    }
    res.json({
      document: docs[0],
      ocr: ocr || null,
      invoices,
      lines,
      excel_mapping: excelMap,
      validation,
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
/**
 * Reprocesa un documento existente: limpia raw_ocr, ai_extractions,
 * processing_trace, excel_mapping, invoices, invoice_lines del documento,
 * resetea documents row a PROCESSING y vuelve a correr el pipeline contra
 * el mismo storage_path. El document_hash queda igual; se preserva el id.
 *
 * Util para:
 *  - Errores transitorios (timeout de Gemini, red).
 *  - Cambios en el prompt o pipeline (probar el archivo con la nueva logica).
 *  - REVIEW dudoso (Gemini puede clasificar distinto al re-evaluar).
 *
 * Si la fila Excel del documento existe en excel_mapping, se elimina la
 * referencia. La fila fisica del Excel NO se borra (puede quedar duplicada
 * tras reprocesar). Para limpieza completa del Excel: "Nuevo Reintegro".
 */
async function reprocess(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'BadRequest', message: 'Id invalido' });
    }
    const [rows] = await pool.query(
      'SELECT id, storage_path, original_filename, mime_type, file_size, source_type FROM documents WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'NotFound', message: `Documento #${id} no encontrado` });
    const doc = rows[0];
    if (!doc.storage_path || !fs.existsSync(doc.storage_path)) {
      return res.status(412).json({
        error: 'PreconditionFailed',
        message: 'El archivo fisico no existe en disco. No se puede reprocesar; vuelva a subirlo.',
      });
    }

    // Limpieza de rastros previos. ON DELETE CASCADE no se dispara porque NO
    // borramos documents (mantenemos el id). Limpiamos cada tabla hija manual.
    await pool.query('DELETE FROM excel_mapping WHERE document_id = ?', [id]);
    await pool.query('DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE document_id = ?)', [id]);
    await pool.query('DELETE FROM invoices WHERE document_id = ?', [id]);
    await pool.query('DELETE FROM ai_extractions WHERE document_id = ?', [id]);
    await pool.query('DELETE FROM raw_ocr WHERE document_id = ?', [id]);
    await pool.query('DELETE FROM raw_xml WHERE document_id = ?', [id]);
    await pool.query('DELETE FROM processing_trace WHERE document_id = ?', [id]);

    await pool.query(
      `UPDATE documents
          SET status = 'PROCESSING',
              error_message = NULL,
              completed_at = NULL,
              duplicate_document_id = NULL,
              doc_kind = 'UNKNOWN'
        WHERE id = ?`,
      [id]
    );

    req.log.info({ document_id: id, user_id: req.user.sub }, 'document reprocess requested');

    const out = await processFile({
      filePath: doc.storage_path,
      originalFilename: doc.original_filename,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      source_type: doc.source_type,
      uploaded_by_user_id: req.user.sub,
      reprocessExistingDocId: id,
    });

    res.json({ reprocessed: true, ...out });
  } catch (e) {
    next(e);
  }
}

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

module.exports = { upload, list, detail, trace, downloadReintegro, remove, resetReintegro, bulkRemove, reprocess };
