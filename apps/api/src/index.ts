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
import logger from './utils/logger';

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time notifications
const io = new SocketServer(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true },
});

io.on('connection', (socket) => {
  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`);
  });
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many requests' }));

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/worklogs', worklogsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/notifications', notificationsRouter);

// Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 handler
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.message, err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.NODE_ENV === 'test' ? 0 : parseInt(process.env.PORT || '4000');

server.listen(PORT, async () => {
  logger.info(`API server running on port ${PORT}`);
  logger.info(`Swagger docs: http://localhost:${PORT}/api/docs`);

  if (process.env.NODE_ENV !== 'test') {
    try {
      await startScheduler();
    } catch (err) {
      logger.error('Scheduler failed to start', err);
    }
  }
});

export { app, server, io };
