const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Falta token Bearer' });
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Token invalido o expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Rol insuficiente' });
    }
    next();
  };
}

function ingestTokenRequired(req, res, next) {
  const provided = req.headers['x-n8n-token'] || req.query.token;
  if (!config.n8n.ingestToken) {
    return res.status(500).json({ error: 'ServerMisconfig', message: 'N8N_INGEST_TOKEN no configurado' });
  }
  if (provided !== config.n8n.ingestToken) {
    return res.status(401).json({ error: 'Unauthorized', message: 'N8N ingest token invalido' });
  }
  next();
}

module.exports = { signToken, authRequired, requireRole, ingestTokenRequired };
