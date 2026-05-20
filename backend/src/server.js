const { buildApp } = require('./app');
const { config, validateRequiredSecrets } = require('./config/env');
const { ping } = require('./db/pool');
const { logger } = require('./lib/logger');

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
}

start().catch((err) => {
  logger.fatal({ err: { message: err.message, stack: err.stack } }, 'server failed to start');
  process.exit(1);
});
