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
import jwt from 'jsonwebtoken';

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

// ─── Startup env validation ───────────────────────────────────────────────────
/**
 * Fail fast: if a required env var is missing the app should crash at boot with
 * a clear error rather than silently starting and failing on the first request.
 *
 * Required vars:
 *   - JWT_ACCESS_SECRET  — used to sign/verify access tokens
 *   - JWT_REFRESH_SECRET — used to sign/verify refresh tokens
 *   - DATABASE_URL       — Prisma connection string
 */
const REQUIRED_ENV = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

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

/**
 * Socket.IO authentication middleware — runs before any event handler.
 *
 * The client must pass a valid JWT access token in the handshake `auth` object:
 * ```js
 * io(SOCKET_URL, { auth: { token: accessToken } })
 * ```
 *
 * We verify the token server-side and attach the decoded payload to
 * `socket.data.userId`.  The `join` handler below then uses THAT value,
 * never a client-supplied userId string.  This prevents any connected
 * client from subscribing to another user's private notification room.
 *
 * If the token is missing or invalid, the connection is refused with a
 * 401 error (the client's socket.on('connect_error') fires).
 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    return next(new Error('Authentication required: no token provided'));
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as { userId: string };
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error('Authentication required: invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  /**
   * Client connects → we join them to their private room automatically.
   *
   * The userId is taken from the VERIFIED JWT payload (socket.data.userId),
   * NOT from a client-emitted event.  This prevents any client from
   * joining another user's room by emitting a fake userId.
   *
   * The `join` event is kept for backward compatibility (client may still
   * emit it) but the server ignores the client-provided value and uses the
   * token-derived userId instead.
   */
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);
  logger.debug(`Socket ${socket.id} authenticated and joined room user:${userId}`);

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
/**
 * Auth routes: 30 req / 15 min — limit brute-force login/reset attempts.
 * Reports routes: 20 req / 1 min — prevent expensive aggregation DoS.
 * Upload routes (worklogs POST): 30 req / 10 min — prevent upload flooding.
 */
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many requests, please try again later' },
}));
app.use('/api/reports', rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many report requests, please slow down' },
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

// ─── Graceful shutdown ────────────────────────────────────────────────────────
/**
 * Handle SIGTERM (Render, Docker stop) and SIGINT (Ctrl+C in dev).
 *
 * On shutdown:
 * 1. Stop accepting new HTTP connections (server.close)
 * 2. Close Socket.IO (stops sending events)
 * 3. Disconnect Prisma (flushes in-flight queries, releases DB connections)
 * 4. BullMQ queue/worker instances close automatically when the process exits
 *    since they don't hold the event loop open indefinitely.
 *
 * Without this handler, Render sends SIGTERM and the process is force-killed
 * after 10 s, potentially interrupting in-flight DB transactions.
 */
import prisma from './utils/prisma';
import { emailQueue, scanQueue } from './workers/scheduler';

async function shutdown(signal: string) {
  logger.info(`Received ${signal} — gracefully shutting down`);
  server.close(async () => {
    try {
      io.close();
      await emailQueue.close();
      await scanQueue.close();
      await prisma.$disconnect();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export { app, server, io };
