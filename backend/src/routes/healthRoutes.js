const express = require('express');
const { ping } = require('../db/pool');
const { config } = require('../config/env');

const router = express.Router();

router.get('/', async (_req, res) => {
  const out = {
    service: 'docscan-finance-backend',
    env: config.env,
    port: config.port,
    timestamp: new Date().toISOString(),
    checks: {},
  };
  try {
    await ping();
    out.checks.mysql = 'ok';
  } catch (e) {
    out.checks.mysql = `error: ${e.code || e.message}`;
  }
  out.checks.gemini = config.gemini.apiKey ? 'configured' : 'missing-key';
  out.checks.google_oauth = config.google.clientId ? 'configured' : 'missing-credentials';
  out.checks.n8n_token = config.n8n.ingestToken ? 'configured' : 'missing-token';

  const httpStatus = out.checks.mysql === 'ok' ? 200 : 503;
  res.status(httpStatus).json(out);
});

module.exports = router;
