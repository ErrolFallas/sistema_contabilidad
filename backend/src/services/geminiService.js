/**
 * Cliente Gemini - secciones 4 y 5 del Plan Maestro v2.1.
 *
 * Politica obligatoria (seccion 5.1):
 *   - La IA UNICAMENTE extrae informacion visible.
 *   - Prohibido inventar, inferir, estimar, completar o aproximar.
 *   - Campos ausentes => null.
 *
 * Prompt operativo (seccion 5.2): se incluye textual al modelo.
 *
 * Gemini se usa SOLO para: extraccion estructurada, clasificacion IVA, RAG,
 * chat documental y validaciones cruzadas. NUNCA como OCR (seccion 5.0).
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config/env');
const { pool } = require('../db/pool');

let _client = null;
function getModel() {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }
  if (!_client) _client = new GoogleGenerativeAI(config.gemini.apiKey);
  return _client.getGenerativeModel({
    model: config.gemini.model,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });
}

// === Prompt fijo de clasificacion + extraccion =============================
const PROMPT_EXTRACT_INVOICE = `Eres un clasificador y extractor estricto de documentos contables costarricenses. Recibiras TEXTO OCR.

PASO 1 (OBLIGATORIO) - Clasifica el documento en "tipo_documento":
  - "FACTURA":  Comprobante UNICO de UNA sola transaccion contra UN solo proveedor.
                Ejemplos: factura electronica, factura proforma, factura de venta,
                tiquete electronico, recibo de un proveedor especifico.
                Senales: un solo "Numero de factura", un solo "Proveedor", un solo
                "Total", lineas que son items de esa misma compra.
  - "REPORTE":  Documento que AGRUPA o LISTA varias transacciones en una sola hoja.
                Ejemplos: reporte de caja chica del mes, estado de cuenta bancario,
                listado de gastos, hoja de movimientos, planilla, cuadro mensual.
                Senales: varias fechas independientes, varios proveedores en filas,
                columnas tipo "Fecha | Detalle | Monto", encabezados como
                "Reintegro", "Caja chica", "Movimientos", "Periodo:", etc.
  - "OTRO":     Cualquier otra cosa que no es factura ni reporte contable.
                Ejemplos: contrato, certificado, identificacion, fotografia ajena,
                hoja en blanco, OCR ilegible, manual, captura aleatoria.

PASO 2 - Si "tipo_documento" es "FACTURA", llena los campos de factura.
         Si es "REPORTE" o "OTRO", deja TODOS los campos de factura en null
         y "lineas": []. NUNCA fabriques una factura ficticia para un reporte.

Politica inviolable:
- Extrae UNICAMENTE informacion visible literal.
- PROHIBIDO: inventar, inferir, estimar, completar, aproximar o corregir.
- Si un dato no aparece visible, su valor es null (en JSON null literal, NO string).
- No reescribas valores: copia exactamente lo que ves (preservando puntos/comas decimales).

Clasificacion fiscal IVA Costa Rica por linea (seccion 5.3):
  tarifa "0"        -> canasta basica
  tarifa "1"        -> medicamentos
  tarifa "2"        -> turismo
  tarifa "4"        -> salud privada
  tarifa "13"       -> general
  tarifa "EXENTO"   -> productos/servicios exentos
  tarifa "REVISION" -> NO se puede determinar con certeza (NO INFIERAS)

Devuelve ESTRICTAMENTE JSON con esta estructura (no agregues markdown ni texto):
{
  "tipo_documento": "FACTURA"|"REPORTE"|"OTRO",
  "clasificacion_motivo": string|null,
  "clasificacion_confianza": number|null,
  "proveedor_nombre": string|null,
  "proveedor_cedula": string|null,
  "proveedor_tipo_cedula": "FISICA"|"JURIDICA"|"DIMEX"|"NITE"|null,
  "numero_factura": string|null,
  "fecha_emision": "YYYY-MM-DD"|null,
  "moneda": "CRC"|"USD"|"EUR"|null,
  "subtotal": number|null,
  "descuento": number|null,
  "impuesto_total": number|null,
  "total": number|null,
  "descripcion": string|null,
  "actividad_economica": string|null,
  "lineas": [
    {
      "linea_num": number|null,
      "producto": string|null,
      "categoria_fiscal": string|null,
      "cantidad": number|null,
      "precio_unitario": number|null,
      "base_gravable": number|null,
      "tarifa_iva": "0"|"1"|"2"|"4"|"13"|"EXENTO"|"REVISION"|null,
      "porcentaje_iva": number|null,
      "monto_iva": number|null,
      "subtotal": number|null,
      "total": number|null,
      "clasificacion_confianza": number|null
    }
  ]
}

Reglas adicionales:
- "clasificacion_motivo": 1-2 frases explicando por que clasificaste asi. Para REPORTE u OTRO debe describir el tipo concreto (ej. "Hoja de caja chica con multiples movimientos del mes"). Para FACTURA puede ser null.
- "clasificacion_confianza" (top-level) entre 0 y 1.
- Las fechas en formato ISO YYYY-MM-DD; si la factura solo tiene "DD/MM/YYYY" tradu como "YYYY-MM-DD" sin inventar dia/mes.
- Los numeros sin separadores de miles, con punto decimal.
- Si no hay lineas legibles, "lineas": [].
- "clasificacion_confianza" de cada linea entre 0 y 1; si dudas, usa "REVISION" y baja la confianza.`;

async function extractInvoiceFromOcr({ documentId, ocrText }) {
  const t0 = Date.now();
  const model = getModel();

  const full = `${PROMPT_EXTRACT_INVOICE}\n\n=== TEXTO OCR ===\n${ocrText}\n=== FIN OCR ===`;
  const result = await model.generateContent(full);
  const responseText = result.response.text();

  let parsed = null;
  let parseError = null;
  try {
    const cleaned = responseText.replace(/^```json|^```|```$/gm, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    parseError = e.message;
  }

  const durationMs = Date.now() - t0;
  await pool.query(
    `INSERT INTO ai_extractions
       (document_id, purpose, model, prompt, request_payload, response_raw, response_json, score, duration_ms)
     VALUES (?, 'EXTRACT_INVOICE', ?, ?, ?, ?, ?, ?, ?)`,
    [
      documentId,
      config.gemini.model,
      PROMPT_EXTRACT_INVOICE,
      JSON.stringify({ ocr_chars: ocrText.length }),
      responseText.slice(0, 65000),
      parsed ? JSON.stringify(parsed) : null,
      null,
      durationMs,
    ]
  );

  if (!parsed) {
    throw new Error(`Gemini devolvio JSON invalido: ${parseError}. Respuesta: ${responseText.slice(0, 300)}`);
  }
  return parsed;
}

module.exports = { extractInvoiceFromOcr, PROMPT_EXTRACT_INVOICE };
