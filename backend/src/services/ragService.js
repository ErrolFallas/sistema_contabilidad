/**
 * RAG documental (seccion 13.4 del Plan Maestro v2.1).
 *
 * Flujo de indexacion (al procesar un documento o por reindex manual):
 *   raw_ocr -> chunkText (parrafo-aware, ~800 chars) -> embedTexts (Gemini
 *   text-embedding-004, batch) -> rag_documents (chunk_text + embedding JSON).
 *
 * Flujo de consulta:
 *   pregunta -> embedQuery -> SELECT todos los chunks con embedding ->
 *   cosine similarity in-memory -> top-K -> prompt a Gemini con contexto ->
 *   respuesta en lenguaje natural + sources con doc_id y archivo.
 *
 * Reglas inviolables del plan (5.1) aplican: Gemini SOLO sintetiza a partir
 * del contexto. El prompt prohibe inferir/inventar. Si la pregunta no se
 * puede responder, debe decirlo explicitamente.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config/env');
const { pool } = require('../db/pool');
const { logger } = require('../lib/logger');

const EMBEDDING_MODEL = 'gemini-embedding-001';
const CHAT_MODEL = config.gemini.model;
const CHUNK_TARGET_CHARS = 800;
const CHUNK_MAX_CHARS = 2000;
const DEFAULT_TOP_K = 5;

let _client = null;
function getClient() {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY no configurada');
  if (!_client) _client = new GoogleGenerativeAI(config.gemini.apiKey);
  return _client;
}

function getEmbedModel() {
  return getClient().getGenerativeModel({ model: EMBEDDING_MODEL });
}

function getChatModel() {
  return getClient().getGenerativeModel({
    model: CHAT_MODEL,
    generationConfig: { temperature: 0.1 },
  });
}

// ============================================================
// Chunking
// ============================================================

function chunkText(text) {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  // Divide por parrafos (1+ lineas en blanco). Si un parrafo es muy largo
  // (mas de CHUNK_MAX_CHARS), se subdivide por oracion o por chars duros.
  const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const chunks = [];
  let buf = '';
  for (const p of paragraphs) {
    if (p.length > CHUNK_MAX_CHARS) {
      if (buf) { chunks.push(buf); buf = ''; }
      // Split por chars
      for (let i = 0; i < p.length; i += CHUNK_MAX_CHARS) {
        chunks.push(p.slice(i, i + CHUNK_MAX_CHARS));
      }
      continue;
    }
    if ((buf + '\n\n' + p).length > CHUNK_TARGET_CHARS && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

// ============================================================
// Embeddings
// ============================================================

async function embedTexts(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  if (!texts.length) return [];
  const model = getEmbedModel();

  // batchEmbedContents acepta multiples requests en una llamada. Mas eficiente
  // que embedContent por separado.
  try {
    const result = await model.batchEmbedContents({
      requests: texts.map((t) => ({
        content: { role: 'user', parts: [{ text: t }] },
        taskType,
      })),
    });
    return result.embeddings.map((e) => e.values);
  } catch (err) {
    // Fallback: embedContent uno por uno (mas lento pero mas robusto si la
    // API cambia el formato batch).
    logger.warn({ err: err.message }, 'batchEmbedContents fallo, fallback a embedContent individual');
    const out = [];
    for (const t of texts) {
      const r = await model.embedContent({
        content: { role: 'user', parts: [{ text: t }] },
        taskType,
      });
      out.push(r.embedding.values);
    }
    return out;
  }
}

async function embedQuery(question) {
  const [v] = await embedTexts([question], 'RETRIEVAL_QUERY');
  return v;
}

// ============================================================
// Similarity
// ============================================================

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// ============================================================
// Index API
// ============================================================

async function indexDocument(documentId) {
  const [ocrRows] = await pool.query(
    `SELECT ocr_text FROM raw_ocr WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
    [documentId]
  );
  const text = ocrRows[0]?.ocr_text || '';
  if (!text.trim()) {
    return { document_id: documentId, indexed: false, reason: 'sin texto OCR' };
  }

  await pool.query(`DELETE FROM rag_documents WHERE document_id = ?`, [documentId]);

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { document_id: documentId, indexed: false, reason: 'sin chunks' };
  }

  const embeddings = await embedTexts(chunks, 'RETRIEVAL_DOCUMENT');
  for (let i = 0; i < chunks.length; i++) {
    await pool.query(
      `INSERT INTO rag_documents (document_id, chunk_index, chunk_text, embedding, token_count)
       VALUES (?, ?, ?, ?, ?)`,
      [documentId, i, chunks[i], JSON.stringify(embeddings[i]), Math.round(chunks[i].length / 4)]
    );
  }

  return { document_id: documentId, indexed: true, chunks: chunks.length };
}

async function reindexAll() {
  const [docs] = await pool.query(
    `SELECT d.id FROM documents d
       INNER JOIN raw_ocr o ON o.document_id = d.id
      GROUP BY d.id
      ORDER BY d.id ASC`
  );
  const results = [];
  for (const d of docs) {
    try {
      const r = await indexDocument(d.id);
      results.push(r);
    } catch (err) {
      results.push({ document_id: d.id, indexed: false, error: err.message });
    }
  }
  return {
    total_documents: docs.length,
    indexed: results.filter((r) => r.indexed).length,
    skipped: results.filter((r) => !r.indexed && !r.error).length,
    errors: results.filter((r) => r.error).length,
    details: results,
  };
}

// ============================================================
// Query API
// ============================================================

const RAG_ANSWER_PROMPT = `Eres un asistente contable que responde preguntas SOLO con base en los fragmentos de facturas y documentos provistos a continuacion.

REGLAS INVIOLABLES:
- NO inventes datos, montos, fechas, proveedores ni numeros de factura.
- Si la respuesta no esta literalmente en el contexto, responde exactamente: "No encontre informacion suficiente para responder esa pregunta en las facturas cargadas."
- Cuando cites cifras, copialas exactamente como aparecen en el contexto.
- Cita las facturas relevantes por su numero entre parentesis, ej: "(factura #12, factura #18)".
- Manten la respuesta breve y concreta (maximo 5 oraciones).
- Responde en espanol claro, sin jerga tecnica.

CONTEXTO:
{context}

PREGUNTA: {question}

RESPUESTA:`;

function buildContext(matches) {
  return matches
    .map((m, i) => {
      const label = m.original_filename ? `factura #${m.document_id} "${m.original_filename}"` : `factura #${m.document_id}`;
      return `[Fragmento ${i + 1} - ${label}]\n${m.chunk_text}`;
    })
    .join('\n\n---\n\n');
}

async function queryRag({ question, topK = DEFAULT_TOP_K, userId = null }) {
  const t0 = Date.now();
  if (!question || !question.trim()) {
    throw Object.assign(new Error('La pregunta esta vacia'), { status: 400 });
  }
  const q = question.trim().slice(0, 1000);

  // 1. Embed pregunta
  const qVec = await embedQuery(q);

  // 2. Cargar todos los chunks con embedding + metadata del doc
  const [chunks] = await pool.query(
    `SELECT r.id, r.document_id, r.chunk_index, r.chunk_text, r.embedding,
            d.original_filename, d.status
       FROM rag_documents r
       JOIN documents d ON d.id = r.document_id
      WHERE r.embedding IS NOT NULL`
  );

  if (chunks.length === 0) {
    return {
      question: q,
      answer: 'Todavia no hay facturas preparadas para consulta. Pedile a un administrador que use el boton "Volver a preparar todas" en esta misma pagina.',
      sources: [],
      duration_ms: Date.now() - t0,
      matches_count: 0,
    };
  }

  // 3. Cosine en memoria
  const scored = chunks.map((c) => {
    const emb = typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding;
    return {
      document_id: c.document_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      original_filename: c.original_filename,
      status: c.status,
      score: cosineSimilarity(qVec, emb),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  // 4. Prompt + Gemini
  const prompt = RAG_ANSWER_PROMPT
    .replace('{context}', buildContext(top))
    .replace('{question}', q);
  const model = getChatModel();
  const result = await model.generateContent(prompt);
  const answer = (result.response.text() || '').trim();

  // 5. Persistir en rag_queries
  await pool.query(
    `INSERT INTO rag_queries (user_id, question, answer, matched_chunks, duration_ms)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId,
      q,
      answer,
      JSON.stringify(top.map((m) => ({
        document_id: m.document_id,
        chunk_index: m.chunk_index,
        score: m.score,
      }))),
      Date.now() - t0,
    ]
  );

  return {
    question: q,
    answer,
    sources: top.map((m) => ({
      document_id: m.document_id,
      original_filename: m.original_filename,
      chunk_index: m.chunk_index,
      chunk_text: m.chunk_text,
      score: Math.round(m.score * 1000) / 1000,
    })),
    duration_ms: Date.now() - t0,
    matches_count: top.length,
  };
}

async function getStatus() {
  const [[docsTotal]] = await pool.query(`SELECT COUNT(*) AS total FROM documents`);
  const [[indexedDocs]] = await pool.query(
    `SELECT COUNT(DISTINCT document_id) AS total FROM rag_documents WHERE embedding IS NOT NULL`
  );
  const [[chunks]] = await pool.query(
    `SELECT COUNT(*) AS total FROM rag_documents WHERE embedding IS NOT NULL`
  );
  const [[queries]] = await pool.query(`SELECT COUNT(*) AS total FROM rag_queries`);
  return {
    documents_total: Number(docsTotal.total),
    documents_indexed: Number(indexedDocs.total),
    chunks_total: Number(chunks.total),
    queries_total: Number(queries.total),
    embedding_model: EMBEDDING_MODEL,
    chat_model: CHAT_MODEL,
  };
}

async function listHistory({ limit = 20 } = {}) {
  const [rows] = await pool.query(
    `SELECT q.id, q.question, q.answer, q.matched_chunks, q.duration_ms, q.created_at,
            u.email AS user_email
       FROM rag_queries q
       LEFT JOIN users u ON u.id = q.user_id
      ORDER BY q.id DESC
      LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    matched_chunks: typeof r.matched_chunks === 'string' ? JSON.parse(r.matched_chunks) : r.matched_chunks,
  }));
}

module.exports = {
  chunkText,
  embedTexts,
  embedQuery,
  cosineSimilarity,
  indexDocument,
  reindexAll,
  queryRag,
  getStatus,
  listHistory,
  EMBEDDING_MODEL,
};
