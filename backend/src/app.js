const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const documentsRoutes = require('./routes/documentsRoutes');
const usersRoutes = require('./routes/usersRoutes');
const integrationsRoutes = require('./routes/integrationsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const invoicesRoutes = require('./routes/invoicesRoutes');
const invoiceLinesRoutes = require('./routes/invoiceLinesRoutes');
const traceabilityRoutes = require('./routes/traceabilityRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { requestLogger } = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(requestLogger);

  // Rate limit general (no aplica a /health para monitoreo)
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  app.get('/', (_req, res) => res.json({ ok: true, service: 'docscan-finance-backend' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/invoices', invoicesRoutes);
  app.use('/api/invoice-lines', invoiceLinesRoutes);
  app.use('/api/traceability', traceabilityRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
