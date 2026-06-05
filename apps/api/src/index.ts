/**
 * @file index.ts
 * @description Express application entry point.
 *
 * Bootstraps the HTTP server, Socket.IO, all middleware, API routes,
 * Swagger documentation, and the BullMQ deadline-reminder scheduler.
 *
 * Export surface:
 *   - `app`    — raw Express application (used by Supertest in tests)
 *   - `server` — underlying HTTP server (used by Socket.IO)
 *   - `io`     — Socket.IO Server instance
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import projectsRouter from './routes/projects';
import tasksRouter from './routes/tasks';
import worklogsRouter from './routes/worklogs';
import reportsRouter from './routes/reports';
import auditRouter from './routes/audit';
import notificationsRouter from './routes/notifications';
import { swaggerSpec } from './swagger';
import { startScheduler } from './workers/scheduler';
import { setIo } from './utils/socket';
import logger from './utils/logger';

const app = express();
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
/**
 * Real-time notification layer.
 *
 * Clients connect and immediately emit `join` with their userId so they are
 * placed in the private room `user:<userId>`.  The server then targets that
 * room with `emitToUser()` whenever a relevant event occurs (new notification,
 * task update, worklog reply, etc.).
 */
const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  path: '/socket.io',
});

// Register the singleton so route handlers can reach it without circular deps
setIo(io);

io.on('connection', (socket) => {
  /**
   * Client emits `join` with their user ID immediately after connecting.
   * We place them in a private room so we can push targeted events.
   */
  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`);
    logger.debug(`Socket ${socket.id} joined room user:${userId}`);
  });

  socket.on('disconnect', () => {
    logger.debug(`Socket ${socket.id} disconnected`);
  });
});

// ─── Core middleware ───────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting ─────────────────────────────────────────────────────────────
// Tighten auth routes to 30 req / 15 min to limit brute-force attempts
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many requests, please try again later' },
}));

// ─── Static files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',          authRouter);
app.use('/api/users',         usersRouter);
app.use('/api/projects',      projectsRouter);
app.use('/api/tasks',         tasksRouter);
app.use('/api/worklogs',      worklogsRouter);
app.use('/api/reports',       reportsRouter);
app.use('/api/audit',         auditRouter);
app.use('/api/notifications', notificationsRouter);

// ─── Swagger UI ───────────────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Millennial PM — API Docs',
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// ─── Utility routes ───────────────────────────────────────────────────────────
/** Simple liveness probe used by Docker healthcheck and load balancers. */
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ─── Error handlers ───────────────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ success: false, message: 'Route not found' })
);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error: ' + err.message, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
// Use port 0 in test mode so the OS assigns a random free port,
// preventing EADDRINUSE when multiple test files import this module.
const PORT = process.env.NODE_ENV === 'test' ? 0 : parseInt(process.env.PORT || '4000');

server.listen(PORT, async () => {
  logger.info(`API server running on port ${PORT}`);
  logger.info(`Swagger docs: http://localhost:${PORT}/api/docs`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  if (process.env.NODE_ENV !== 'test') {
    try {
      await startScheduler();
    } catch (err) {
      logger.error('Scheduler failed to start', err);
    }
  }
});

export { app, server, io };
