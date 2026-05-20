const express = require('express');
const { authRequired, requireRole, ingestTokenRequired } = require('../middleware/auth');
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

// === Reprocesar documento existente (ADMIN) ===
router.post('/:id/reprocess', authRequired, requireRole('ADMIN'), documentsController.reprocess);

// === Lectura ===
router.get('/', authRequired, documentsController.list);
router.get('/reintegro/download', authRequired, documentsController.downloadReintegro);
router.get('/:id', authRequired, documentsController.detail);
router.get('/:id/trace', authRequired, documentsController.trace);
router.get('/:id/edits', authRequired, require('../controllers/editsController').listEdits);

// === Gestion (ADMIN) ===
// Doble cerradura para wipe total: header de confirmacion + role ADMIN.
function confirmHeaderRequired(req, res, next) {
  if (req.headers['x-confirm-bulk-delete'] !== 'ELIMINAR') {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Falta header X-Confirm-Bulk-Delete: ELIMINAR',
    });
  }
  next();
}
router.delete('/', authRequired, requireRole('ADMIN'), confirmHeaderRequired, documentsController.bulkRemove);
router.delete('/reintegro/reset', authRequired, requireRole('ADMIN'), documentsController.resetReintegro);
router.delete('/:id', authRequired, requireRole('ADMIN'), documentsController.remove);

module.exports = router;
