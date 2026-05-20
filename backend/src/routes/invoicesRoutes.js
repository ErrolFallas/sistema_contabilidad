const router = require('express').Router();
const { authRequired, requireRole } = require('../middleware/auth');
const edits = require('../controllers/editsController');

router.patch('/:id', authRequired, requireRole('ADMIN'), edits.editInvoice);

module.exports = router;
