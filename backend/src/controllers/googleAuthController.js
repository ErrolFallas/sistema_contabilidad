const oauth = require('../services/googleOAuthService');

async function status(req, res, next) {
  try {
    const cred = await oauth.getStoredCredential();
    res.json({
      connected: !!cred,
      google_email: cred?.google_email || null,
      scopes: cred?.scopes ? cred.scopes.split(' ') : null,
      drive_folder_id: cred?.drive_folder_id || null,
      last_drive_sync: cred?.last_drive_sync || null,
      last_gmail_sync: cred?.last_gmail_sync || null,
      updated_at: cred?.updated_at || null,
    });
  } catch (e) {
    next(e);
  }
}

async function authorize(req, res, next) {
  try {
    const { url } = oauth.getAuthorizeUrl();
    res.json({ authorize_url: url });
  } catch (e) {
    next(e);
  }
}

async function callback(req, res, next) {
  try {
    const { code, error: errParam, state: _state } = req.query;
    if (errParam) {
      return res.status(400).send(renderHtml(false, `Google rechazo el consentimiento: ${errParam}`));
    }
    if (!code) {
      return res.status(400).send(renderHtml(false, 'Falta parametro "code".'));
    }
    const out = await oauth.exchangeCodeForTokens(code);
    res.send(renderHtml(true, `Conectado como ${out.google_email}. Puede cerrar esta ventana y volver a la app.`));
  } catch (e) {
    res.status(500).send(renderHtml(false, e.message));
  }
}

async function disconnect(req, res, next) {
  try {
    await oauth.disconnect();
    res.json({ disconnected: true });
  } catch (e) {
    next(e);
  }
}

function renderHtml(ok, message) {
  const color = ok ? '#16a34a' : '#dc2626';
  const title = ok ? 'Google conectado' : 'Error de conexion';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<title>${title}</title>
<style>body{font-family:system-ui,Arial;background:#f1f5f9;color:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#fff;border-radius:.5rem;padding:2rem;box-shadow:0 4px 12px rgba(0,0,0,.08);max-width:480px;text-align:center}
h1{color:${color};margin:0 0 .75rem}
.btn{display:inline-block;margin-top:1rem;background:#2563eb;color:#fff;padding:.5rem 1rem;border-radius:.375rem;text-decoration:none;font-size:.875rem}</style>
</head><body><div class="box">
<h1>${title}</h1><p>${message}</p>
<a class="btn" href="http://localhost:5173/admin/google">Volver a la app</a>
</div></body></html>`;
}

module.exports = { status, authorize, callback, disconnect };
