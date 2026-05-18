/**
 * Google OAuth2 - seccion 2.4 del Plan Maestro v2.1.
 *
 * Scopes:
 *   - https://www.googleapis.com/auth/drive          (Drive: leer + mover archivos)
 *   - https://www.googleapis.com/auth/gmail.modify   (Gmail: leer y marcar como leido)
 *
 * El refresh_token se persiste en `google_credentials` (singleton) tras el
 * primer consentimiento. A partir de ahi cualquier cliente Google se construye
 * con ese refresh_token y obtiene access_tokens nuevos de forma transparente.
 */
const crypto = require('crypto');
const { google } = require('googleapis');
const { pool } = require('../db/pool');
const { config } = require('../config/env');

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
  'profile',
];

const _stateCache = new Map();
function newState() {
  const s = crypto.randomBytes(16).toString('hex');
  _stateCache.set(s, Date.now());
  // limpieza basica: descartar mas antiguos que 10 min
  for (const [k, t] of _stateCache.entries()) {
    if (Date.now() - t > 10 * 60 * 1000) _stateCache.delete(k);
  }
  return s;
}
function consumeState(s) {
  const ok = _stateCache.has(s);
  if (ok) _stateCache.delete(s);
  return ok;
}

function buildOAuthClient() {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados');
  }
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

function getAuthorizeUrl() {
  const oauth2 = buildOAuthClient();
  const state = newState();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
  return { url, state };
}

async function exchangeCodeForTokens(code) {
  const oauth2 = buildOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google no devolvio refresh_token. Vaya a https://myaccount.google.com/permissions, ' +
      'remueva el acceso de la aplicacion, y vuelva a autorizar (asi Google forzara prompt de consentimiento).'
    );
  }
  oauth2.setCredentials(tokens);
  const oauth = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data: profile } = await oauth.userinfo.get();
  await pool.query(
    `INSERT INTO google_credentials (id, google_email, refresh_token, scopes)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       google_email = VALUES(google_email),
       refresh_token = VALUES(refresh_token),
       scopes = VALUES(scopes),
       updated_at = CURRENT_TIMESTAMP`,
    [profile.email, tokens.refresh_token, SCOPES.join(' ')]
  );
  return { google_email: profile.email, scopes: SCOPES };
}

async function getStoredCredential() {
  const [rows] = await pool.query(
    `SELECT id, google_email, refresh_token, scopes, drive_folder_id,
            last_drive_sync, last_gmail_sync, updated_at
       FROM google_credentials WHERE id = 1 LIMIT 1`
  );
  return rows[0] || null;
}

async function getAuthenticatedClient() {
  // refresh_token desde BD; .env actua como fallback (util en CI/CD).
  const cred = await getStoredCredential();
  const refreshToken = cred?.refresh_token || config.google.refreshToken;
  if (!refreshToken) {
    const e = new Error('Google no conectado. Visite /admin/google y autorice la app.');
    e.status = 412;
    throw e;
  }
  const oauth2 = buildOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

async function updateDriveSync() {
  await pool.query(
    `UPDATE google_credentials SET last_drive_sync = CURRENT_TIMESTAMP WHERE id = 1`
  );
}
async function updateGmailSync() {
  await pool.query(
    `UPDATE google_credentials SET last_gmail_sync = CURRENT_TIMESTAMP WHERE id = 1`
  );
}
async function setDriveFolderId(id) {
  await pool.query(
    `UPDATE google_credentials SET drive_folder_id = ? WHERE id = 1`,
    [id]
  );
}

async function disconnect() {
  await pool.query(`DELETE FROM google_credentials WHERE id = 1`);
}

module.exports = {
  SCOPES,
  newState,
  consumeState,
  getAuthorizeUrl,
  exchangeCodeForTokens,
  getStoredCredential,
  getAuthenticatedClient,
  updateDriveSync,
  updateGmailSync,
  setDriveFolderId,
  disconnect,
};
