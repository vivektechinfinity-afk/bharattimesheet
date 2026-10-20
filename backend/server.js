require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const authRoutes = require('./routes/auth');
const timesheetRoutes = require('./routes/timesheets');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Login is the brute-force target; keep it tighter than the rest of the API.
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Bahut zyada attempts. 15 min baad try karein.' } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300 }));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'disconnected', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);

// Serve the built React app in production (single-service Railway deploy)
const clientDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} nahi mila` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Server error. Thodi der baad try karein.'
      : err.message,
  });
});

// Only bind a port when started directly — `require`ing this file (tests) must not listen.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`✓ Timesheet API listening on :${PORT}  (${process.env.NODE_ENV || 'development'})`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => db.pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
