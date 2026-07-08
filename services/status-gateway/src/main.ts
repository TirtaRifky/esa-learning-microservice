import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';

// ==============================
// CONFIG
// ==============================
const LOAN_CORE_URL = process.env.LOAN_CORE_URL || 'http://localhost:3001';
const AUDIT_URL = process.env.AUDIT_URL || 'http://localhost:3010';
const PORT = Number(process.env.PORT || 3020);

// ==============================
// APP INIT
// ==============================
const app = express();
app.use(cors());

// ==============================
// LOGGER
// ==============================
const log = (msg: string, meta?: any) => {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    service: 'status-gateway',
    message: msg,
    ...meta
  }));
};

// ==============================
// HEALTH
// ==============================
app.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'status-gateway', status: 'ok', uptime: process.uptime() });
});

// ==============================
// PLATFORM STATUS
// ==============================
app.get('/api/status', async (_req: Request, res: Response) => {
  const checks: Record<string, any> = {};

  // Check loan-core
  try {
    const loan = await axios.get(`${LOAN_CORE_URL}/loans/health`, { timeout: 3000 });
    checks.loanCore = { status: 'up', data: loan.data };
  } catch {
    checks.loanCore = { status: 'down' };
  }

  // Check audit
  try {
    const audit = await axios.get(`${AUDIT_URL}/health`, { timeout: 3000 });
    checks.audit = { status: 'up', data: audit.data };
  } catch {
    checks.audit = { status: 'down' };
  }

  const allUp = Object.values(checks).every((c: any) => c.status === 'up');
  res.status(allUp ? 200 : 503).json({
    platform: allUp ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: checks
  });
});

// ==============================
// PLATFORM SUMMARY
// ==============================
app.get('/api/summary', async (_req: Request, res: Response) => {
  const services: Record<string, string> = {};

  const check = async (name: string, url: string, path: string) => {
    try {
      await axios.get(`${url}${path}`, { timeout: 2000 });
      services[name] = 'online';
    } catch {
      services[name] = 'offline';
    }
  };

  await Promise.all([
    check('loanCore', LOAN_CORE_URL, '/loans/health'),
    check('audit', AUDIT_URL, '/health'),
  ]);

  const online = Object.values(services).filter(s => s === 'online').length;

  res.json({
    platform: 'Smart Lending Platform',
    version: '0.1.0',
    services,
    summary: `${online}/${Object.keys(services).length} services online`,
    timestamp: new Date().toISOString()
  });
});

// ==============================
// START SERVER
// ==============================
const server = app.listen(PORT, () => {
  log('Status Gateway started', { port: PORT, loanCore: LOAN_CORE_URL, audit: AUDIT_URL });
});

server.on('error', (err) => {
  log('Startup error', { error: err });
  process.exit(1);
});

// ==============================
// GRACEFUL SHUTDOWN
// ==============================
const shutdown = (signal: string) => {
  log('Shutdown signal received', { signal });
  server.close(() => {
    log('Server closed gracefully');
    process.exit(0);
  });
  setTimeout(() => {
    log('Force shutdown');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
