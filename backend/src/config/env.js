const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

function req(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    return '';
  }
  return v;
}

const config = {
  env: req('NODE_ENV', 'development'),
  port: parseInt(req('PORT', '3000'), 10),

  db: {
    host: req('DB_HOST', 'localhost'),
    port: parseInt(req('DB_PORT', '3306'), 10),
    user: req('DB_USER', 'app_user'),
    password: req('DB_PASSWORD', ''),
    database: req('DB_NAME', 'docscan_finance'),
    connectionLimit: parseInt(req('DB_CONNECTION_LIMIT', '10'), 10),
  },

  jwt: {
    secret: req('JWT_SECRET', ''),
    expiresIn: req('JWT_EXPIRES_IN', '8h'),
  },

  gemini: {
    apiKey: req('GEMINI_API_KEY', ''),
    model: req('GEMINI_MODEL', 'gemini-2.5-flash'),
  },

  google: {
    clientId: req('GOOGLE_CLIENT_ID', ''),
    clientSecret: req('GOOGLE_CLIENT_SECRET', ''),
    redirectUri: req('GOOGLE_REDIRECT_URI', ''),
    refreshToken: req('GOOGLE_REFRESH_TOKEN', ''),
  },

  drive: {
    rootFolder: req('DRIVE_ROOT_FOLDER_NAME', 'DocScanFinanceCR'),
    subfolders: req('DRIVE_SUBFOLDERS', 'Facturas,Procesadas,Errores,PlantillasExcel,OCR,Temporal').split(','),
  },

  n8n: {
    ingestToken: req('N8N_INGEST_TOKEN', ''),
  },

  backendBaseUrl: req('BACKEND_BASE_URL', 'http://localhost:3000'),

  bccr: {
    indicadorVenta: req('BCCR_INDICADOR_VENTA', '318'),
    indicadorCompra: req('BCCR_INDICADOR_COMPRA', '317'),
  },

  storage: {
    dir: path.resolve(__dirname, '..', '..', req('STORAGE_DIR', './storage')),
    excelTemplateReintegro: path.resolve(
      __dirname,
      '..',
      '..',
      req('EXCEL_TEMPLATE_REINTEGRO', './templates/Reintegro.xlsx')
    ),
  },

  bootstrapAdmin: {
    email: req('BOOTSTRAP_ADMIN_EMAIL', ''),
    password: req('BOOTSTRAP_ADMIN_PASSWORD', ''),
  },
};

const REQUIRED_SECRETS = [
  ['DB_PASSWORD', config.db.password],
  ['JWT_SECRET', config.jwt.secret],
  ['N8N_INGEST_TOKEN', config.n8n.ingestToken],
];

function validateRequiredSecrets({ throwOnMissing = true } = {}) {
  const missing = REQUIRED_SECRETS.filter(([, v]) => !v).map(([name]) => name);
  if (missing.length === 0) return { ok: true, missing: [] };
  const msg =
    `[config] Variables obligatorias ausentes en .env: ${missing.join(', ')}. ` +
    `Defina valores en backend/.env (ver backend/.env.example) y reinicie.`;
  if (throwOnMissing) throw new Error(msg);
  const { logger } = require('../lib/logger');
  logger.error({ missing }, 'required env secrets missing');
  return { ok: false, missing };
}

module.exports = { config, validateRequiredSecrets };
