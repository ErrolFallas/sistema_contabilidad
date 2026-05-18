const express = require('express');
const { authRequired, ingestTokenRequired } = require('../middleware/auth');
const { upload: multerUpload } = require('../middleware/upload');
const documentsController = require('../controllers/documentsController');

const router = express.Router();

// === Ingesta desde n8n (Drive / Gmail) - stub conserva, sera Fase 2 final ===
router.post('/ingest', ingestTokenRequired, async (req, res, next) => {
  try {
    const { source_type, original_filename } = req.body || {};
    if (!source_type || !original_filename) {
      return res.status(400).json({ error: 'BadRequest', message: 'source_type y original_filename son obligatorios' });
    }
    // Marcador: n8n debera enviar el archivo binario al backend.
    // Implementacion completa con OAuth + descarga llega en sub-fase de automatizacion.
    res.status(202).json({
      accepted: true,
      message: 'Ingesta encolada (stub n8n). Use /upload mientras se completa la integracion OAuth.',
    });
  } catch (e) {
    next(e);
  }
});

// === Carga manual desde el frontend ===
router.post('/upload', authRequired, multerUpload.single('file'), documentsController.upload);

// === Lectura ===
router.get('/', authRequired, documentsController.list);
router.get('/reintegro/download', authRequired, documentsController.downloadReintegro);
router.get('/:id', authRequired, documentsController.detail);
router.get('/:id/trace', authRequired, documentsController.trace);

module.exports = router;
