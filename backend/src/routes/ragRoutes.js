const router = require('express').Router();
const { authRequired, requireRole } = require('../middleware/auth');
const rag = require('../controllers/ragController');

router.get('/status', authRequired, rag.status);
router.post('/query', authRequired, rag.query);
router.get('/history', authRequired, rag.history);
router.post('/reindex-all', authRequired, requireRole('ADMIN'), rag.reindexAll);
router.post('/reindex/:id', authRequired, requireRole('ADMIN'), rag.reindexOne);

module.exports = router;
