/**
 * Validaciones cruzadas aritmeticas de facturas extraidas.
 *
 * Filosofia: la IA solo extrae lo visible. Si el numero no cuadra, NO inferimos
 * ni corregimos - se reporta la discrepancia y se marca la invoice como
 * REVISION para revision humana. Las validaciones NUNCA modifican subtotal,
 * impuesto_total ni total - solo flagean.
 */
const { pool } = require('../db/pool');

const DEFAULT_TOLERANCE_CRC = 1;

function num(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Ejecuta tres chequeos sobre la invoice + sus lineas:
 *   1. subtotal - descuento + impuesto_total = total
 *   2. SUM(line.total) = invoice.total       (tolerancia mayor por rounding por linea)
 *   3. base_gravable * porcentaje_iva / 100 = monto_iva (por linea)
 *
 * Solo se evalua un chequeo cuando los campos relevantes NO son null.
 * Devuelve { ok, issues: [...], summary, checks_run }.
 */
async function runArithmeticValidation({ invoiceId, tolerance = DEFAULT_TOLERANCE_CRC } = {}) {
  const [invRows] = await pool.query(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
  const inv = invRows[0];
  if (!inv) return { ok: true, issues: [], summary: 'Invoice no encontrada', checks_run: 0 };

  const [lines] = await pool.query(
    `SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id ASC`,
    [invoiceId]
  );

  const issues = [];
  let checksRun = 0;

  const subtotal = num(inv.subtotal);
  const descuento = num(inv.descuento) || 0;
  const impuesto  = num(inv.impuesto_total) || 0;
  const total     = num(inv.total);

  // 1. Invoice: subtotal - descuento + impuesto ≈ total
  if (subtotal !== null && total !== null) {
    checksRun++;
    const expected = subtotal - descuento + impuesto;
    const diff = expected - total;
    if (Math.abs(diff) > tolerance) {
      issues.push({
        scope: 'invoice',
        check: 'subtotal_descuento_impuesto_total',
        field: 'total',
        expected: round2(expected),
        actual: total,
        diff: round2(diff),
        message: `Subtotal ${subtotal} - Descuento ${descuento} + Impuesto ${impuesto} = ${round2(expected)}, pero total declarado es ${total}. Diferencia: ${round2(diff)} CRC.`,
      });
    }
  }

  // 2. SUM(line.total) ≈ invoice.total (tolerancia escala con cantidad de lineas)
  const lineTotals = lines.map((l) => num(l.total)).filter((v) => v !== null);
  if (lineTotals.length > 0 && total !== null) {
    checksRun++;
    const sum = lineTotals.reduce((a, b) => a + b, 0);
    const diff = sum - total;
    const lineTolerance = Math.max(tolerance, lines.length * tolerance);
    if (Math.abs(diff) > lineTolerance) {
      issues.push({
        scope: 'invoice',
        check: 'sum_lineas_vs_total',
        field: 'total',
        expected: round2(sum),
        actual: total,
        diff: round2(diff),
        message: `Suma de totales de lineas (${round2(sum)}) no cuadra con el total declarado (${total}). Diferencia: ${round2(diff)} CRC (tolerancia ${lineTolerance}).`,
      });
    }
  }

  // 3. Por linea: base * pct / 100 ≈ monto_iva
  for (const l of lines) {
    const base = num(l.base_gravable);
    const pct  = num(l.porcentaje_iva);
    const iva  = num(l.monto_iva);
    if (base === null || pct === null || iva === null) continue;
    checksRun++;
    const expected = base * pct / 100;
    const diff = expected - iva;
    if (Math.abs(diff) > tolerance) {
      issues.push({
        scope: 'line',
        line_id: l.id,
        line_num: l.linea_num,
        check: 'base_por_porcentaje_vs_iva',
        field: 'monto_iva',
        expected: round2(expected),
        actual: iva,
        diff: round2(diff),
        message: `Linea ${l.linea_num || `#${l.id}`}: Base ${base} * ${pct}% = ${round2(expected)}, pero monto IVA declarado es ${iva}. Diferencia: ${round2(diff)} CRC.`,
      });
    }
  }

  const ok = issues.length === 0;
  return {
    ok,
    issues,
    checks_run: checksRun,
    summary: ok
      ? `Validacion aritmetica OK (${checksRun} chequeo${checksRun === 1 ? '' : 's'})`
      : `${issues.length} discrepancia${issues.length === 1 ? '' : 's'} sobre ${checksRun} chequeo${checksRun === 1 ? '' : 's'}`,
  };
}

async function persistValidation({ documentId, invoiceId, result, tolerance }) {
  await pool.query(
    `INSERT INTO ai_extractions
       (document_id, purpose, model, prompt, request_payload, response_raw, response_json, duration_ms)
     VALUES (?, 'VALIDATION', 'arithmetic-check', ?, ?, ?, ?, 0)`,
    [
      documentId,
      `Tolerancia: ${tolerance} CRC. Chequeos: 1) subtotal-descuento+impuesto=total, 2) SUM(lineas.total)=total, 3) base*pct/100=monto_iva por linea.`,
      JSON.stringify({ invoice_id: invoiceId, tolerance }),
      result.summary,
      JSON.stringify(result),
    ]
  );
}

module.exports = { runArithmeticValidation, persistValidation, DEFAULT_TOLERANCE_CRC };
