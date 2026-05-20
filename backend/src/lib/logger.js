const pino = require('pino');

const env = process.env.NODE_ENV || 'development';
const level = process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug');

const transport = env === 'production'
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    };

const logger = pino({
  level,
  base: { service: 'docscan-finance-backend', env },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-n8n-token"]',
      'req.headers.cookie',
      'password',
      'password_hash',
      '*.password',
      '*.password_hash',
      'token',
      'refresh_token',
      'access_token',
      'GEMINI_API_KEY',
      'GOOGLE_CLIENT_SECRET',
      'JWT_SECRET',
      'N8N_INGEST_TOKEN',
      'DB_PASSWORD',
    ],
    censor: '[REDACTED]',
  },
  transport,
});

module.exports = { logger };
