const { buildApp } = require('./app');
const { config } = require('./config/env');
const { ping } = require('./db/pool');

async function start() {
  const app = buildApp();

  try {
    await ping();
    console.log(`[mysql] Conectado a ${config.db.host}:${config.db.port}/${config.db.database} como ${config.db.user}`);
  } catch (e) {
    console.warn(`[mysql] ADVERTENCIA: no se pudo conectar (${e.code || e.message}). El servidor arranca igual; revisar /api/health.`);
  }

  app.listen(config.port, () => {
    console.log(`[server] Backend escuchando en http://localhost:${config.port}`);
    console.log(`[server] Health:    http://localhost:${config.port}/api/health`);
    console.log(`[server] Entorno:   ${config.env}`);
  });
}

start().catch((err) => {
  console.error('[server] Fallo de arranque:', err);
  process.exit(1);
});
