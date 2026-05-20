const cron = require('node-cron');
const { buildApp } = require('./app');
const { config, validateRequiredSecrets } = require('./config/env');
const { ping } = require('./db/pool');
const { logger } = require('./lib/logger');
const { runAllCleanups } = require('./services/storageCleanupService');

async function start() {
  validateRequiredSecrets();
  const app = buildApp();

  try {
    await ping();
    logger.info({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
    }, 'mysql connected');
  } catch (e) {
    logger.warn({ err: { code: e.code, message: e.message } }, 'mysql connection failed at startup; check /api/health');
  }

  app.listen(config.port, () => {
    logger.info({
      port: config.port,
      env: config.env,
      health_url: `http://localhost:${config.port}/api/health`,
    }, 'backend listening');
  });

  // Limpieza diaria de storage a las 03:15 (hora local del servidor). El cron
  // corre dentro del backend para no depender de n8n. Si el servidor esta
  // apagado a esa hora, se salta - no rea-encola (filosofia n8n-only-as-cron
  // no aplica aca porque la limpieza no toca nada que requiera el pipeline).
  cron.schedule('15 3 * * *', async () => {
    try {
      await runAllCleanups();
    } catch (err) {
      logger.error({ err: { message: err.message, stack: err.stack } }, 'storage cleanup failed');
    }
  });
  logger.info({ schedule: '15 3 * * *' }, 'storage cleanup cron registered');
}

start().catch((err) => {
  logger.fatal({ err: { message: err.message, stack: err.stack } }, 'server failed to start');
  process.exit(1);
});
