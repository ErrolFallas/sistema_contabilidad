const { randomUUID } = require('crypto');
const { logger } = require('../lib/logger');

const SILENT_PATHS = new Set(['/api/health']);

function requestLogger(req, res, next) {
  const reqId = req.headers['x-request-id'] || randomUUID();
  req.id = reqId;
  req.log = logger.child({ req_id: reqId });
  res.setHeader('X-Request-Id', reqId);

  if (SILENT_PATHS.has(req.path)) return next();

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const duration_ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
    const payload = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms,
      ip: req.ip,
      user_id: req.user?.id || null,
    };
    if (res.statusCode >= 500) req.log.error(payload, 'request failed');
    else if (res.statusCode >= 400) req.log.warn(payload, 'request rejected');
    else req.log.info(payload, 'request');
  });

  next();
}

module.exports = { requestLogger };
