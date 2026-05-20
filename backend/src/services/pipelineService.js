/**
 * Pipeline orquestador (seccion 3 del Plan Maestro v2.1).
 *
 * Flujo: archivo -> hash -> dedup -> documents -> OCR -> raw_ocr -> Gemini
 *        -> ai_extractions + invoices + invoice_lines -> Excel -> excel_mapping.
 *
 * Cada etapa registra en processing_trace via traceService.withStage().
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const { fileSha256 } = require('./hashService');
const { runOcrForDocument, classifyKind } = require('./ocrService');
const { extractInvoiceFromOcr } = require('./geminiService');
const { appendToReintegro } = require('./excelService');
const { traceInstant, withStage } = require('./traceService');
const currencyService = require('./currencyService');
const validationService = require('./validationService');

const NUMERIC_INVOICE_FIELDS = ['subtotal', 'descuento', 'impuesto_total', 'total'];
const NUMERIC_LINE_FIELDS = [
  'cantidad', 'precio_unitario', 'base_gravable', 'porcentaje_iva',
  'monto_iva', 'subtotal', 'total', 'clasificacion_confianza',
];

function asNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function asDateOrNull(v) {
  if (!v || typeof v !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

/**
 * Recibe un archivo ya en disco y arranca el pipeline.
 *  - filePath: ruta absoluta del archivo en /storage/uploads/...
 *  - originalFilename, mimeType, fileSize
 *  - source_type: 'MANUAL' | 'DRIVE' | 'GMAIL'
 *  - uploaded_by_user_id (opcional)
 *  - drive_file_id, gmail_message_id, gmail_attachment_id (opcionales)
 *
 * Devuelve { document_id, status, invoice_id, lines_count, duplicate_of, excel: {...} }.
 */
async function processFile(input) {
  const {
    filePath,
    originalFilename,
    mimeType,
    fileSize,
    source_type,
    uploaded_by_user_id = null,
    drive_file_id = null,
    gmail_message_id = null,
    gmail_attachment_id = null,
  } = input;

  // 1. Hash del archivo
  const fileHash = await fileSha256(filePath);

  // 2. Dedup
  const [dups] = await pool.query(
    `SELECT id, status FROM documents WHERE document_hash = ? LIMIT 1`,
    [fileHash]
  );
  if (dups.length > 0) {
    const existing = dups[0];
    // Registramos el intento como duplicado.
    const [r] = await pool.query(
      `INSERT INTO documents
         (document_hash, source_type, original_filename, mime_type, file_size,
          drive_file_id, gmail_message_id, gmail_attachment_id, storage_path,
          duplicate_document_id, status, doc_kind, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DUPLICATE', 'UNKNOWN', ?)`,
      [
        fileHash + '#dup-' + Date.now(),
        source_type,
        originalFilename,
        mimeType,
        fileSize,
        drive_file_id,
        gmail_message_id,
        gmail_attachment_id,
        filePath,
        existing.id,
        uploaded_by_user_id,
      ]
    );
    const dupDocId = r.insertId;
    await traceInstant(dupDocId, 'HASH_CHECK', 'SKIPPED', `Hash duplicado de documento #${existing.id}`);
    return {
      document_id: dupDocId,
      status: 'DUPLICATE',
      duplicate_of: existing.id,
      invoice_id: null,
      lines_count: 0,
      excel: null,
    };
  }

  // 3. Insertar documents PROCESSING
  const kindGuess = classifyKind(originalFilename, mimeType);
  const docKindInitial = kindGuess === 'PDF' ? 'UNKNOWN' : kindGuess === 'IMAGE' ? 'IMAGE' : kindGuess === 'XML' ? 'XML_HACIENDA' : 'UNKNOWN';

  const [insDoc] = await pool.query(
    `INSERT INTO documents
       (document_hash, source_type, original_filename, mime_type, file_size,
        drive_file_id, gmail_message_id, gmail_attachment_id, storage_path,
        status, doc_kind, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)`,
    [
      fileHash,
      source_type,
      originalFilename,
      mimeType,
      fileSize,
      drive_file_id,
      gmail_message_id,
      gmail_attachment_id,
      filePath,
      docKindInitial,
      uploaded_by_user_id,
    ]
  );
  const documentId = insDoc.insertId;
  await traceInstant(documentId, 'FILE_RECEIVED', 'OK');

  try {
    // 4. OCR
    const ocr = await withStage(documentId, 'OCR_START', () =>
      runOcrForDocument({ documentId, filePath, originalFilename, mimeType })
    );
    await traceInstant(documentId, 'OCR_DONE', 'OK', `chars=${ocr.text.length}, kind=${ocr.kind}`);

    if (ocr.kind && ocr.kind !== 'UNKNOWN') {
      await pool.query(`UPDATE documents SET doc_kind = ? WHERE id = ?`, [ocr.kind, documentId]);
    }

    // 5. Gemini extract
    let extracted = null;
    await withStage(documentId, 'GEMINI_START', async () => {
      extracted = await extractInvoiceFromOcr({ documentId, ocrText: ocr.text });
    });
    await traceInstant(documentId, 'GEMINI_DONE', 'OK');

    // 5.4 Clasificacion de tipo_documento.
    //   Gemini decide si lo que recibio es FACTURA individual, REPORTE
    //   consolidado (caja chica del mes, estado de cuenta, listado) u OTRO
    //   (contrato, identificacion, OCR ilegible). Solo FACTURA continua al
    //   pipeline de invoice + Excel. Lo demas se marca REVIEW con motivo
    //   explicito en error_message para que el usuario vea por que no llego
    //   al Excel sin tener que abrir trazabilidad. Si el campo viene ausente
    //   (compatibilidad con prompts viejos) asumimos FACTURA.
    const tipoDoc = ['FACTURA', 'REPORTE', 'OTRO'].includes(extracted?.tipo_documento)
      ? extracted.tipo_documento
      : 'FACTURA';
    if (tipoDoc !== 'FACTURA') {
      const motivo = (extracted?.clasificacion_motivo || `Documento clasificado por la IA como ${tipoDoc}.`).slice(0, 4000);
      await pool.query(
        `UPDATE documents
            SET status = 'REVIEW',
                error_message = ?,
                completed_at = NOW()
          WHERE id = ?`,
        [`[${tipoDoc}] ${motivo}`, documentId]
      );
      await traceInstant(
        documentId,
        'VALIDATION_DONE',
        'SKIPPED',
        `tipo_documento=${tipoDoc}: ${motivo}`
      );
      return {
        document_id: documentId,
        status: 'REVIEW',
        invoice_id: null,
        lines_count: 0,
        duplicate_of: null,
        excel: null,
        classification: { tipo: tipoDoc, motivo },
      };
    }

    // 5.5 Dedup por numero_factura + proveedor.
    //   Se aplica DESPUES de la extraccion IA: el dedup por SHA de archivo (paso 2)
    //   solo bloquea binarios identicos. Aqui bloqueamos casos donde el contador
    //   resubio el mismo comprobante con otra resolucion/escaneo (binario distinto,
    //   misma factura). El registro original queda intacto; el nuevo se marca como
    //   DUPLICATE y no llega al Excel. Si el documento original fue eliminado
    //   desde la UI, la invoice tambien desaparecio (FK CASCADE), por lo que esta
    //   verificacion no encuentra match y el archivo se procesa normalmente.
    const invoicePayload = sanitizeInvoice(extracted);
    const dupByInvoice = await findExistingInvoiceMatch(invoicePayload, documentId);
    if (dupByInvoice) {
      await pool.query(
        `UPDATE documents
            SET status = 'DUPLICATE',
                duplicate_document_id = ?,
                completed_at = NOW()
          WHERE id = ?`,
        [dupByInvoice.document_id, documentId]
      );
      await traceInstant(
        documentId,
        'HASH_CHECK',
        'SKIPPED',
        `Factura duplicada por numero=${invoicePayload.numero_factura} (doc original #${dupByInvoice.document_id}). No se inserta invoice ni se escribe Excel.`
      );
      return {
        document_id: documentId,
        status: 'DUPLICATE',
        duplicate_of: dupByInvoice.document_id,
        invoice_id: null,
        lines_count: 0,
        excel: null,
      };
    }

    // 6. Persistir invoice + lines
    let invoiceId = null;
    let linesCount = 0;
    await withStage(documentId, 'MYSQL_DONE', async () => {
      const [r] = await pool.query(
        `INSERT INTO invoices
           (document_id, proveedor_nombre, proveedor_cedula, proveedor_tipo_cedula,
            numero_factura, fecha_emision, moneda, subtotal, descuento, impuesto_total,
            total, descripcion, actividad_economica, estado_extraccion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          invoicePayload.proveedor_nombre,
          invoicePayload.proveedor_cedula,
          invoicePayload.proveedor_tipo_cedula,
          invoicePayload.numero_factura,
          invoicePayload.fecha_emision,
          invoicePayload.moneda,
          invoicePayload.subtotal,
          invoicePayload.descuento,
          invoicePayload.impuesto_total,
          invoicePayload.total,
          invoicePayload.descripcion,
          invoicePayload.actividad_economica,
          invoicePayload.estado_extraccion,
        ]
      );
      invoiceId = r.insertId;

      const lines = Array.isArray(extracted.lineas) ? extracted.lineas : [];
      for (const raw of lines) {
        const line = sanitizeLine(raw);
        await pool.query(
          `INSERT INTO invoice_lines
             (invoice_id, linea_num, producto, categoria_fiscal, cantidad, precio_unitario,
              base_gravable, tarifa_iva, porcentaje_iva, monto_iva, subtotal, total,
              clasificacion_confianza)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            line.linea_num,
            line.producto,
            line.categoria_fiscal,
            line.cantidad,
            line.precio_unitario,
            line.base_gravable,
            line.tarifa_iva,
            line.porcentaje_iva,
            line.monto_iva,
            line.subtotal,
            line.total,
            line.clasificacion_confianza,
          ]
        );
        linesCount++;
      }
    });

    await pool.query(`UPDATE documents SET status = 'PERSISTED' WHERE id = ?`, [documentId]);

    // 6.5 Conversion monetaria + validaciones cruzadas (seccion 9 + 16 del plan v2.1)
    //    Conversion:
    //      - CRC: no convertir.
    //      - USD/EUR: aplicar tipo de cambio VENTA de la fecha de emision (o del
    //        dia disponible mas reciente hacia atras). NUNCA recalcular historicos:
    //        lo que se persista aqui queda inmutable como snapshot.
    //    Validaciones aritmeticas:
    //      - subtotal - descuento + impuesto_total = total (tolerancia 1 CRC).
    //      - SUM(line.total) = invoice.total.
    //      - base * porcentaje/100 = monto_iva por linea.
    //      Si hay discrepancias: invoice.estado_extraccion = 'REVISION' y se
    //      persiste el reporte en ai_extractions (purpose=VALIDATION). NO se
    //      modifica ningun valor extraido (solo se flagea).
    let validationResult = null;
    await withStage(documentId, 'VALIDATION_DONE', async () => {
      const [[inv0]] = await pool.query(
        `SELECT moneda, total, fecha_emision FROM invoices WHERE id = ?`,
        [invoiceId]
      );
      const moneda = inv0?.moneda;
      const total = inv0?.total !== null ? Number(inv0.total) : null;
      if (moneda && moneda !== 'CRC' && total !== null) {
        const refDate = inv0.fecha_emision
          ? new Date(inv0.fecha_emision).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const rate = await currencyService.ensureRate(refDate, moneda, 'VENTA');
        if (rate) {
          const totalColones = Math.round(total * rate.valor * 100) / 100;
          await pool.query(
            `UPDATE invoices
                SET tipo_cambio = ?, tipo_cambio_fecha = ?, total_colones = ?
              WHERE id = ?`,
            [rate.valor, rate.fecha, totalColones, invoiceId]
          );
        }
      }

      validationResult = await validationService.runArithmeticValidation({
        invoiceId,
        tolerance: validationService.DEFAULT_TOLERANCE_CRC,
      });
      await validationService.persistValidation({
        documentId,
        invoiceId,
        result: validationResult,
        tolerance: validationService.DEFAULT_TOLERANCE_CRC,
      });
      if (!validationResult.ok) {
        await pool.query(
          `UPDATE invoices SET estado_extraccion = 'REVISION' WHERE id = ?`,
          [invoiceId]
        );
      }
    });
    if (validationResult && !validationResult.ok) {
      await traceInstant(
        documentId,
        'VALIDATION_DONE',
        'OK',
        `${validationResult.summary}. Primera: ${validationResult.issues[0].message}`
      );
    }

    // 7. Excel REINTEGRO (saltar si no hay datos extraibles)
    const [invoiceRow] = await pool.query(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
    const invSnapshot = invoiceRow[0];
    const minimumExtracted =
      invSnapshot.proveedor_nombre || invSnapshot.numero_factura || invSnapshot.total !== null;

    let excelOut = null;
    let finalStatus = 'COMPLETED';

    if (!minimumExtracted) {
      // El documento no aporta datos de factura (puede ser un reporte/consolidado).
      // No se escribe Excel: respetar el plan ("Excel es reporte, MySQL es fuente").
      await traceInstant(documentId, 'EXCEL_START', 'SKIPPED', 'Sin datos extraibles; documento marcado para revision.');
      finalStatus = 'REVIEW';
    } else {
      await withStage(documentId, 'EXCEL_START', async () => {
        const [lineRows] = await pool.query(`SELECT * FROM invoice_lines WHERE invoice_id = ?`, [invoiceId]);
        const linesForExcel = lineRows.map((l) => ({
          ...l,
          base_gravable: l.base_gravable !== null ? Number(l.base_gravable) : null,
          monto_iva: l.monto_iva !== null ? Number(l.monto_iva) : null,
          porcentaje_iva: l.porcentaje_iva !== null ? Number(l.porcentaje_iva) : null,
        }));
        const invForExcel = {
          ...invSnapshot,
          total: invSnapshot.total !== null ? Number(invSnapshot.total) : null,
          subtotal: invSnapshot.subtotal !== null ? Number(invSnapshot.subtotal) : null,
          impuesto_total: invSnapshot.impuesto_total !== null ? Number(invSnapshot.impuesto_total) : null,
          fecha_emision: invSnapshot.fecha_emision
            ? new Date(invSnapshot.fecha_emision).toISOString().slice(0, 10)
            : null,
        };
        excelOut = await appendToReintegro({ documentId, invoiceId, invoice: invForExcel, lines: linesForExcel });
      });
      await traceInstant(documentId, 'EXCEL_DONE', 'OK', `row=${excelOut.row_num}`);
    }

    await pool.query(
      `UPDATE documents SET status = ?, completed_at = NOW() WHERE id = ?`,
      [finalStatus, documentId]
    );

    return {
      document_id: documentId,
      status: finalStatus,
      invoice_id: invoiceId,
      lines_count: linesCount,
      duplicate_of: null,
      excel: excelOut,
    };
  } catch (err) {
    await pool.query(
      `UPDATE documents SET status = 'ERROR', error_message = ? WHERE id = ?`,
      [(err.message || String(err)).slice(0, 4000), documentId]
    );
    await traceInstant(documentId, 'ERROR', 'ERROR', (err.message || String(err)).slice(0, 4000));
    throw err;
  }
}

function sanitizeInvoice(extracted = {}) {
  const tipo = ['FISICA', 'JURIDICA', 'DIMEX', 'NITE'].includes(extracted.proveedor_tipo_cedula)
    ? extracted.proveedor_tipo_cedula
    : null;
  const moneda = ['CRC', 'USD', 'EUR'].includes(extracted.moneda) ? extracted.moneda : null;

  const out = {
    proveedor_nombre: extracted.proveedor_nombre || null,
    proveedor_cedula: extracted.proveedor_cedula || null,
    proveedor_tipo_cedula: tipo,
    numero_factura: extracted.numero_factura || null,
    fecha_emision: asDateOrNull(extracted.fecha_emision),
    moneda,
    descripcion: extracted.descripcion || null,
    actividad_economica: extracted.actividad_economica || null,
  };
  for (const f of NUMERIC_INVOICE_FIELDS) out[f] = asNumber(extracted[f]);
  out.estado_extraccion = decideEstadoExtraccion(out);
  return out;
}

function decideEstadoExtraccion(inv) {
  const required = ['proveedor_nombre', 'numero_factura', 'fecha_emision', 'total'];
  const missing = required.filter((k) => inv[k] === null);
  if (missing.length === 0) return 'OK';
  if (missing.length >= 3) return 'REVISION';
  return 'FALTANTE';
}

/**
 * Busca si ya existe una invoice activa con el mismo numero_factura y proveedor.
 * - Preferimos comparar por proveedor_cedula (estable).
 * - Si no hay cedula, fallback por proveedor_nombre normalizado (UPPER + TRIM).
 * - Excluye el documento actual y cualquier doc en estado DUPLICATE o ERROR.
 * Devuelve { document_id, invoice_id } o null.
 */
async function findExistingInvoiceMatch(invoicePayload, currentDocumentId) {
  if (!invoicePayload.numero_factura) return null;

  if (invoicePayload.proveedor_cedula) {
    const [rows] = await pool.query(
      `SELECT i.id AS invoice_id, i.document_id
         FROM invoices i
         JOIN documents d ON d.id = i.document_id
        WHERE i.numero_factura = ?
          AND i.proveedor_cedula = ?
          AND d.id <> ?
          AND d.status NOT IN ('DUPLICATE','ERROR')
        ORDER BY i.id ASC
        LIMIT 1`,
      [invoicePayload.numero_factura, invoicePayload.proveedor_cedula, currentDocumentId]
    );
    return rows[0] || null;
  }

  if (invoicePayload.proveedor_nombre) {
    const normalized = invoicePayload.proveedor_nombre.trim().toUpperCase();
    const [rows] = await pool.query(
      `SELECT i.id AS invoice_id, i.document_id
         FROM invoices i
         JOIN documents d ON d.id = i.document_id
        WHERE i.numero_factura = ?
          AND UPPER(TRIM(i.proveedor_nombre)) = ?
          AND d.id <> ?
          AND d.status NOT IN ('DUPLICATE','ERROR')
        ORDER BY i.id ASC
        LIMIT 1`,
      [invoicePayload.numero_factura, normalized, currentDocumentId]
    );
    return rows[0] || null;
  }

  return null;
}

function sanitizeLine(raw = {}) {
  const tarifa = ['0', '1', '2', '4', '13', 'EXENTO', 'REVISION'].includes(String(raw.tarifa_iva))
    ? String(raw.tarifa_iva)
    : null;
  const out = {
    linea_num: raw.linea_num !== null && raw.linea_num !== undefined ? parseInt(raw.linea_num, 10) || null : null,
    producto: raw.producto || null,
    categoria_fiscal: raw.categoria_fiscal || null,
    tarifa_iva: tarifa,
  };
  for (const f of NUMERIC_LINE_FIELDS) out[f] = asNumber(raw[f]);
  return out;
}

module.exports = { processFile };
