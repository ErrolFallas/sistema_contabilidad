const express = require('express');
const { ingestTokenRequired, authRequired } = require('../middleware/auth');
const { pool } = require('../db/pool');

const router = express.Router();

// === Ingesta desde n8n (Drive / Gmail) ===
// STUB Fase 1: registra el evento y devuelve 202.
// Fase 2 conectara aqui el pipeline OCR -> Gemini -> MySQL -> Excel.
router.post('/ingest', ingestTokenRequired, async (req, res, next) => {
  try {
    const { source_type, original_filename, drive_file_id, gmail_message_id, mime_type } = req.body || {};
    if (!source_type || !original_filename) {
      return res.status(400).json({ error: 'BadRequest', message: 'source_type y original_filename son obligatorios' });
    }
    console.log('[ingest] recibido:', { source_type, original_filename, drive_file_id, gmail_message_id });
    res.status(202).json({
      accepted: true,
      message: 'Ingesta encolada (stub Fase 1).',
      received: { source_type, original_filename, drive_file_id, gmail_message_id, mime_type },
    });
  } catch (e) {
    next(e);
  }
});

// === Listado basico (Fase 1 - lectura) ===
router.get('/', authRequired, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const [rows] = await pool.query(
      `SELECT id, original_filename, source_type, mime_type, status, doc_kind, received_at, completed_at
       FROM documents ORDER BY id DESC LIMIT ?`,
      [limit]
    );
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
