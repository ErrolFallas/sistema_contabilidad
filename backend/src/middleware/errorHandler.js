function notFound(req, res, next) {
  res.status(404).json({ error: 'NotFound', message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const body = {
    error: err.name || 'InternalError',
    message: err.message || 'Error interno',
  };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    body.stack = err.stack.split('\n').slice(0, 5);
  }
  if (status >= 500) {
    console.error('[errorHandler]', err);
  }
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
