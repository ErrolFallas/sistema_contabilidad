/**
 * Servicio Excel - secciones 10 y 11 del Plan Maestro v2.1.
 *
 * Reglas:
 *   - Reutiliza machote existente. Si no existe -> detener (NO crear alternativa).
 *   - Excel es REPORTE (MySQL -> Excel). Nunca fuente.
 *   - Para cada celda escrita se persiste excel_mapping (archivo, hoja, fila, columna, celda, template_type).
 *
 * Modo REINTEGRO (Reintegro de Caja Chica):
 *   Archivo: backend/templates/Reintegro.xlsx
 *   Hoja:    "Reintegro de Viaticos"
 *   Encabezados en fila 13 (columnas C..L):
 *     C13 Fecha | D13 Proveedor | E13 Cedula | F13 No. Factura | G13 Descripcion
 *     H13 Moneda | I13 Monto factura | J13 Monto Gravado | K13 % IVA | L13 Monto IVA
 *   Filas de datos: 14..31  (totales en 32-33, no se tocan).
 *
 * Estrategia idempotente:
 *   Antes de escribir, leer excel_mapping para identificar las filas ocupadas
 *   por este machote y elegir la siguiente disponible.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { pool } = require('../db/pool');
const { config } = require('../config/env');
const { processedExcelPath } = require('./storageService');

const TEMPLATE_TYPE = 'REINTEGRO';
const SHEET_NAME = 'Reintegro de Viáticos';
const DATA_ROW_FIRST = 14;
const DATA_ROW_LAST = 31;

const COLS = {
  fecha: 'C',
  proveedor: 'D',
  cedula: 'E',
  numero_factura: 'F',
  descripcion: 'G',
  moneda: 'H',
  total: 'I',
  base_gravable: 'J',
  porcentaje_iva: 'K',
  monto_iva: 'L',
};

function ensureTemplateExists() {
  const p = config.storage.excelTemplateReintegro;
  if (!fs.existsSync(p)) {
    const e = new Error(`Machote Excel no encontrado en ${p}. Proceso detenido (seccion 10 del plan).`);
    e.status = 422;
    throw e;
  }
  return p;
}

/**
 * Identidad estable del workbook activo:
 *   - El archivo en disco es Reintegro_actualizado.xlsx (siempre).
 *   - Junto a el hay un sidecar Reintegro_actualizado.session con un UUID.
 *   - Ese UUID se concatena al file_path que persistimos en excel_mapping:
 *       storage/processed/Reintegro_actualizado.xlsx#<uuid>
 *   - findNextFreeRow filtra por ese file_path con UUID.
 *
 * Cuando el usuario reinicia el Reintegro (borra el .xlsx), tambien se borra
 * el sidecar; el siguiente upload genera UUID nuevo y las filas viejas en
 * excel_mapping quedan asociadas al UUID anterior (auditoria preservada).
 *
 * Esto evita el bug del birthtime: ExcelJS al escribir reescribe el archivo
 * (unlink+create), lo que mueve birthtime y rompe filtros temporales.
 */
function sessionSidecarPath(livePath) {
  return livePath.replace(/\.xlsx$/i, '.session');
}

async function getWorkbookInfo() {
  const templatePath = ensureTemplateExists();
  const livePath = processedExcelPath();
  const sidecar = sessionSidecarPath(livePath);

  let sessionId;
  const xlsxExists = fs.existsSync(livePath);
  const sidecarExists = fs.existsSync(sidecar);

  if (xlsxExists && sidecarExists) {
    sessionId = fs.readFileSync(sidecar, 'utf8').trim();
  } else {
    // (Re)inicializar workbook + sidecar.
    fs.copyFileSync(templatePath, livePath);
    sessionId = crypto.randomUUID();
    fs.writeFileSync(sidecar, sessionId, 'utf8');
  }
  const pathWithSession = `${livePath}#${sessionId}`;
  return { filePath: livePath, pathWithSession, sessionId };
}

async function findNextFreeRow(pathWithSession) {
  const [rows] = await pool.query(
    `SELECT MAX(row_num) AS used_row
       FROM excel_mapping
      WHERE template_type = ? AND file_path = ?`,
    [TEMPLATE_TYPE, pathWithSession]
  );
  const used = rows[0]?.used_row;
  const next = used ? used + 1 : DATA_ROW_FIRST;
  if (next > DATA_ROW_LAST) {
    const e = new Error(
      `Machote REINTEGRO sin filas libres (14..31 ocupadas). Genere un nuevo reintegro.`
    );
    e.status = 422;
    throw e;
  }
  return next;
}

function pctIvaFromTarifa(tarifa) {
  switch (String(tarifa)) {
    case '0': return 0;
    case '1': return 1;
    case '2': return 2;
    case '4': return 4;
    case '13': return 13;
    case 'EXENTO': return 0;
    default: return null;
  }
}

function sumOrNull(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Calculo aritmetico defensivo (NO es inferencia: es matematica sobre datos visibles).
 * Si la IA extrajo base + %iva pero no monto_iva, lo calculamos.
 * Si extrajo total + %iva sin base, derivamos base = total/(1+%/100).
 */
function fillIvaArithmetic(line) {
  const out = { ...line };
  const pct = out.porcentaje_iva ?? pctIvaFromTarifa(out.tarifa_iva);
  if (pct === null || pct === undefined) return out;

  if (out.monto_iva == null && typeof out.base_gravable === 'number' && pct >= 0) {
    out.monto_iva = round2(out.base_gravable * (pct / 100));
  }

  if (out.base_gravable == null && typeof out.total === 'number' && pct > 0) {
    const base = out.total / (1 + pct / 100);
    out.base_gravable = round2(base);
    if (out.monto_iva == null) out.monto_iva = round2(out.total - base);
  }

  if (out.base_gravable == null && typeof out.subtotal === 'number') {
    out.base_gravable = round2(out.subtotal);
    if (out.monto_iva == null && pct >= 0) {
      out.monto_iva = round2(out.subtotal * (pct / 100));
    }
  }

  return out;
}

/**
 * Toma una invoice + lines extraidas y escribe UNA fila en el machote.
 * Si la invoice tiene varias lineas con tarifas distintas, registramos:
 *   - base_gravable: suma de bases (J)
 *   - monto_iva:    suma de IVAs (L)
 *   - porcentaje_iva: tarifa de la primera linea o null si mixto
 *
 * Devuelve { row_num, sheet_name, file_path, written: [{col, cell, value, field_name}, ...] }
 */
async function appendToReintegro({ documentId, invoiceId, invoice, lines }) {
  const { filePath, pathWithSession, sessionId } = await getWorkbookInfo();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath, {
    ignoreNodes: ['dataValidations'],
  });
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) {
    const e = new Error(`Hoja "${SHEET_NAME}" no existe en ${filePath}`);
    e.status = 422;
    throw e;
  }

  const rowNum = await findNextFreeRow(pathWithSession);

  // Calculo aritmetico defensivo sobre datos visibles (no inferencia).
  const linesFilled = (lines || []).map(fillIvaArithmetic);

  // Determinacion de tarifa unica.
  let pctIva = null;
  if (linesFilled.length === 1) {
    pctIva = linesFilled[0].porcentaje_iva ?? pctIvaFromTarifa(linesFilled[0].tarifa_iva);
  } else if (linesFilled.length > 1) {
    const unicos = new Set(
      linesFilled.map((l) => String(l.porcentaje_iva ?? pctIvaFromTarifa(l.tarifa_iva)))
    );
    if (unicos.size === 1) {
      pctIva = linesFilled[0].porcentaje_iva ?? pctIvaFromTarifa(linesFilled[0].tarifa_iva);
    }
  }

  // Agregados.
  let baseGravable = sumOrNull(linesFilled.map((l) => l.base_gravable));
  let montoIva = sumOrNull(linesFilled.map((l) => l.monto_iva));

  // Fallback final a nivel cabecera: si hay total + %iva pero sin lineas utiles.
  if ((baseGravable == null || montoIva == null) && pctIva != null && pctIva > 0
      && typeof invoice.total === 'number') {
    const base = invoice.total / (1 + pctIva / 100);
    if (baseGravable == null) baseGravable = round2(base);
    if (montoIva == null) montoIva = round2(invoice.total - base);
  }
  if (montoIva == null && pctIva != null && pctIva > 0 && typeof baseGravable === 'number') {
    montoIva = round2(baseGravable * (pctIva / 100));
  }
  // Si la factura es exenta o 0%, dejamos monto_iva en 0 explicitamente cuando la base existe.
  if (montoIva == null && pctIva === 0 && typeof baseGravable === 'number') {
    montoIva = 0;
  }

  const descripcion =
    invoice.descripcion ||
    (lines && lines.length
      ? lines.map((l) => l.producto).filter(Boolean).join('; ').slice(0, 250)
      : null);

  const valuesByField = {
    fecha: invoice.fecha_emision,
    proveedor: invoice.proveedor_nombre,
    cedula: invoice.proveedor_cedula,
    numero_factura: invoice.numero_factura,
    descripcion,
    moneda: invoice.moneda,
    total: invoice.total,
    base_gravable: baseGravable,
    porcentaje_iva: pctIva,
    monto_iva: montoIva,
  };

  const written = [];
  for (const [field, col] of Object.entries(COLS)) {
    const cellRef = `${col}${rowNum}`;
    const val = valuesByField[field];
    if (val === undefined || val === null || val === '') continue;
    sheet.getCell(cellRef).value = val;
    written.push({ col, cell: cellRef, value: val, field_name: field });
  }

  await wb.xlsx.writeFile(filePath);

  // Persistir excel_mapping (una fila por celda). file_path incluye sessionId
  // para distinguir Reintegros sucesivos sobre el mismo nombre de archivo.
  for (const w of written) {
    await pool.query(
      `INSERT INTO excel_mapping
         (document_id, invoice_id, template_type, file_path, sheet_name, row_num, col_letter, cell_ref, field_name, value_written)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        invoiceId,
        TEMPLATE_TYPE,
        pathWithSession,
        SHEET_NAME,
        rowNum,
        w.col,
        w.cell,
        w.field_name,
        String(w.value).slice(0, 4000),
      ]
    );
  }

  return {
    template_type: TEMPLATE_TYPE,
    file_path: filePath,
    session_id: sessionId,
    sheet_name: SHEET_NAME,
    row_num: rowNum,
    written,
  };
}

module.exports = { appendToReintegro, TEMPLATE_TYPE, SHEET_NAME };
