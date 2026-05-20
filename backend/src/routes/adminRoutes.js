const router = require('express').Router();
const { authRequired, requireRole } = require('../middleware/auth');
const admin = require('../controllers/adminController');

router.post('/storage/cleanup', authRequired, requireRole('ADMIN'), admin.runStorageCleanup);
router.get('/storage/orphans', authRequired, requireRole('ADMIN'), admin.listOrphans);

module.exports = router;
