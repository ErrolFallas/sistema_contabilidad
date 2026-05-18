/**
 * Servicio OCR - seccion 6 del Plan Maestro v2.1.
 *
 * Reglas inmutables:
 *   - OCR NO realiza: correcciones, interpretaciones, resumenes, reordenamiento.
 *   - Debe preservarse: texto original, saltos, orden, estructura.
 *   - El resultado se almacena en raw_ocr (inmutable, nunca sobrescribir).
 *
 * Stack concreto (seccion 6.1):
 *   - tesseract.js  : motor OCR principal (JPG/PNG y paginas rasterizadas).
 *   - pdf-parse v2  : extraccion directa de texto en PDF nativos.
 *   - sharp         : preprocesamiento (grayscale + normalizacion) antes de Tesseract.
 *
 * Flujo (seccion 6.2):
 *   PDF -> intentar getText() ;
 *          si texto >= MIN_NATIVE_CHARS -> PDF nativo ;
 *          sino -> rasterizar paginas con getScreenshot -> sharp -> tesseract.
 *   IMG -> sharp (grayscale + normalize) -> tesseract.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFParse } = require('pdf-parse');
const tesseract = require('tesseract.js');
const { pool } = require('../db/pool');

const MIN_NATIVE_CHARS = 50;
const TESS_LANG = 'spa+eng';

async function recognizeImageBuffer(buffer) {
  // Preprocesamiento minimo: grayscale + normalize. NO corrige texto, solo
  // mejora contraste. Mantiene contenido visible 1:1.
  const pre = await sharp(buffer).grayscale().normalize().toBuffer();
  const worker = await tesseract.createWorker(TESS_LANG);
  try {
    const { data } = await worker.recognize(pre);
    return { text: data.text || '', confidence: data.confidence ?? null };
  } finally {
    await worker.terminate();
  }
}

async function extractPdfText(filePath) {
  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  return { text: (result.text || ''), pages: result.numpages || result.pages?.length || null };
}

async function rasterizePdfPages(filePath) {
  // pdf-parse v2: getScreenshot rinde paginas como PNG.
  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });
  const ss = await parser.getScreenshot();
  // ss.pages: [{ data: Uint8Array }] segun documentacion v2.
  if (!ss || !Array.isArray(ss.pages)) return [];
  return ss.pages.map((p) => Buffer.from(p.data));
}

/**
 * Determina tipo de documento por MIME / extension.
 */
function classifyKind(originalFilename, mimeType) {
  const ext = path.extname(originalFilename).toLowerCase();
  if (mimeType === 'application/pdf' || ext === '.pdf') return 'PDF';
  if (['image/jpeg', 'image/png', 'image/jpg'].includes(mimeType)) return 'IMAGE';
  if (['.jpg', '.jpeg', '.png'].includes(ext)) return 'IMAGE';
  if (mimeType === 'application/xml' || ext === '.xml' || mimeType === 'text/xml') return 'XML';
  return 'UNKNOWN';
}

/**
 * Ejecuta el OCR completo para un documento ya persistido en `documents`.
 * Decide PDF nativo vs escaneado segun cantidad de texto extraido.
 * Persiste raw_ocr (inmutable) y devuelve { text, kind, engine, confidence, page_count }.
 */
async function runOcrForDocument({ documentId, filePath, originalFilename, mimeType }) {
  const kind = classifyKind(originalFilename, mimeType);

  if (kind === 'XML') {
    // No es OCR, lo maneja parser XML aparte. Devolvemos vacio aqui.
    return { text: '', kind: 'XML_HACIENDA', engine: null, confidence: null, page_count: null };
  }

  let text = '';
  let engine = 'tesseract.js';
  let confidence = null;
  let pageCount = null;
  let docKind = 'UNKNOWN';

  if (kind === 'PDF') {
    const t0 = Date.now();
    const native = await extractPdfText(filePath);
    pageCount = native.pages;
    if ((native.text || '').trim().length >= MIN_NATIVE_CHARS) {
      text = native.text;
      engine = 'pdf-parse';
      docKind = 'PDF_NATIVO';
    } else {
      // Escaneado: rasterizar pagina por pagina y aplicar Tesseract.
      const pages = await rasterizePdfPages(filePath);
      const chunks = [];
      const confidences = [];
      for (let i = 0; i < pages.length; i++) {
        const r = await recognizeImageBuffer(pages[i]);
        chunks.push(`--- pagina ${i + 1} ---\n${r.text}`);
        if (typeof r.confidence === 'number') confidences.push(r.confidence);
      }
      text = chunks.join('\n');
      confidence = confidences.length
        ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 10000
        : null;
      docKind = 'PDF_ESCANEADO';
      pageCount = pages.length || pageCount;
    }
    const ms = Date.now() - t0;
    await persistRawOcr({ documentId, engine, text, pageCount, confidence, durationMs: ms });
  } else if (kind === 'IMAGE') {
    const t0 = Date.now();
    const buf = fs.readFileSync(filePath);
    const r = await recognizeImageBuffer(buf);
    text = r.text;
    confidence = typeof r.confidence === 'number' ? Math.round(r.confidence * 100) / 10000 : null;
    pageCount = 1;
    docKind = 'IMAGE';
    const ms = Date.now() - t0;
    await persistRawOcr({ documentId, engine, text, pageCount, confidence, durationMs: ms });
  } else {
    throw new Error(`Tipo de archivo no soportado para OCR: ${mimeType || originalFilename}`);
  }

  return { text, kind: docKind, engine, confidence, page_count: pageCount };
}

async function persistRawOcr({ documentId, engine, text, pageCount, confidence, durationMs }) {
  await pool.query(
    `INSERT INTO raw_ocr (document_id, engine, language, ocr_text, page_count, confidence, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [documentId, engine, TESS_LANG, text, pageCount, confidence, durationMs]
  );
}

module.exports = { runOcrForDocument, classifyKind };
