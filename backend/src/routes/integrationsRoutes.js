const express = require('express');
const { ingestTokenRequired, authRequired, requireRole } = require('../middleware/auth');
const integrations = require('../controllers/integrationsController');

const router = express.Router();

// Disparadores de n8n: protegidos con N8N_INGEST_TOKEN.
router.post('/poll-drive', ingestTokenRequired, integrations.pollDrive);
router.post('/poll-gmail', ingestTokenRequired, integrations.pollGmail);
router.post('/currency-fetch', ingestTokenRequired, integrations.fetchCurrency);

// Acciones administrativas (UI):
router.post('/drive/ensure-folders', authRequired, requireRole('ADMIN'), integrations.ensureDriveStructure);
router.post('/drive/poll', authRequired, requireRole('ADMIN'), integrations.pollDrive);
router.post('/gmail/poll', authRequired, requireRole('ADMIN'), integrations.pollGmail);
router.post('/currency/fetch', authRequired, requireRole('ADMIN'), integrations.fetchCurrency);
router.get('/currency', authRequired, integrations.listCurrency);

module.exports = router;
