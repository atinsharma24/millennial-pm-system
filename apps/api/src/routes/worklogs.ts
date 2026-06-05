/**
 * @file routes/worklogs.ts
 * @description Work log submission and PM reply endpoints.
 *
 * Employees submit progress logs against their assigned tasks; Project
 * Managers (and Admins) can reply to start a threaded conversation.
 *
 * File attachments are stored locally under `<cwd>/uploads/` via Multer
 * and served as static files at `/uploads/<filename>`.  In production swap
 * the Multer `storage` for an S3/GCS storage engine.
 *
 * Socket.IO: a `worklog:new` event is pushed to the task's PM when an
 * employee submits a log, and a `worklog:reply` event is pushed to the
 * log author when a reply is posted.
 */

import { Router, Response } from 'express';
import { body } from 'express-validator';
import { Role } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';
import { ok, created, notFound, forbidden } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { writeAudit } from '../middleware/audit';
import { emitToUser } from '../utils/socket';

// ─── Multer setup ─────────────────────────────────────────────────────────────

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

/**
 * Multer instance configured for single-file attachments.
 * Max file size: 10 MB.  In production, swap `storage` for S3/GCS.
 */
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /api/worklogs:
 *   get:
 *     tags: [WorkLogs]
 *     summary: List work logs (role-scoped with date-range filter)
 *     description: |
 *       - **Admin** — all logs
 *       - **PM**    — logs for tasks in their projects
 *       - **Employee** — only their own logs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: taskId
 *         schema: { type: string }
 *       - in: query
 *         name: projectId
 *         schema: { type: string }
 *       - in: query
 *         name: employeeId
 *         schema: { type: string }
 *         description: Admin/PM only
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const taskId     = req.query.taskId     as string | undefined;
  const projectId  = req.query.projectId  as string | undefined;
  const employeeId = req.query.employeeId as string | undefined;
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to   = req.query.to   ? new Date(req.query.to   as string) : undefined;

  const where: Record<string, unknown> = {};

  // Role-scoping
  if (req.user!.role === Role.EMPLOYEE) {
    where['userId'] = req.user!.userId;
  } else if (req.user!.role === Role.PROJECT_MANAGER) {
    where['task'] = { project: { managerId: req.user!.userId } };
  }

  if (taskId)    where['taskId'] = taskId;
  if (projectId) where['task']   = { projectId };
  if (employeeId && req.user!.role !== Role.EMPLOYEE) where['userId'] = employeeId;
  if (from || to) {
    where['createdAt'] = {
      ...(from && { gte: from }),
      ...(to   && { lte: to   }),
    };
  }

  const [total, logs] = await Promise.all([
    prisma.workLog.count({ where }),
    prisma.workLog.findMany({
      where, skip, take: limit,
      include: {
        user: { select: { id: true, name: true } },
        task: {
          select: {
            id: true, name: true, projectId: true,
            project: { select: { name: true } },
          },
        },
        replies: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return res.json({
    success: true,
    data: logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * @swagger
 * /api/worklogs:
 *   post:
 *     tags: [WorkLogs]
 *     summary: Submit a work log (multipart/form-data to support file attachments)
 *     description: |
 *       Employees may only submit against tasks they are assigned to.
 *       Admins and PMs may submit on behalf of any task.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [taskId, description, hoursWorked]
 *             properties:
 *               taskId:      { type: string }
 *               description: { type: string }
 *               hoursWorked: { type: number }
 *               attachment:  { type: string, format: binary }
 */
router.post(
  '/',
  upload.single('attachment'),
  [
    body('taskId').notEmpty(),
    body('description').notEmpty().trim(),
    body('hoursWorked').isFloat({ min: 0.1 }),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const { taskId, description, hoursWorked } = req.body;

    const task = await prisma.task.findUnique({
      where:   { id: taskId },
      include: {
        assignments: true,
        project: { include: { manager: true } },
      },
    });
    if (!task) return notFound(res, 'Task not found');

    if (req.user!.role === Role.EMPLOYEE) {
      if (!task.assignments.some((a) => a.userId === req.user!.userId)) {
        return forbidden(res, 'You are not assigned to this task');
      }
    }

    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

    const log = await prisma.workLog.create({
      data: {
        taskId,
        userId:      req.user!.userId,
        description,
        hoursWorked: parseFloat(hoursWorked),
        attachmentUrl,
      },
      include: {
        user:    { select: { id: true, name: true } },
        replies: true,
      },
    });

    // Notify the project manager about the new work log
    const pm = task.project.manager;
    if (pm.id !== req.user!.userId) {
      emitToUser(pm.id, 'worklog:new', {
        logId:       log.id,
        taskName:    task.name,
        projectName: task.project.name,
        submittedBy: req.user!.email,
        hoursWorked: log.hoursWorked,
      });
    }

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'SUBMIT_WORKLOG', entity: 'WorkLog', entityId: log.id,
      newValue: { taskId, hoursWorked, hasAttachment: !!attachmentUrl },
      ipAddress: req.ip,
    });

    return created(res, log, 'Work log submitted');
  }
);

/**
 * @swagger
 * /api/worklogs/{id}/replies:
 *   post:
 *     tags: [WorkLogs]
 *     summary: Reply to a work log (PM, Admin, or the log author)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 */
router.post(
  '/:id/replies',
  [body('content').notEmpty().trim()],
  validate,
  async (req: AuthRequest, res: Response) => {
    const log = await prisma.workLog.findUnique({
      where:   { id: req.params.id },
      include: { task: { include: { project: true } } },
    });
    if (!log) return notFound(res);

    // Access: employee can only reply to their own logs; PM must own the project
    if (req.user!.role === Role.EMPLOYEE && log.userId !== req.user!.userId) {
      return forbidden(res);
    }
    if (req.user!.role === Role.PROJECT_MANAGER && log.task.project.managerId !== req.user!.userId) {
      return forbidden(res);
    }

    const reply = await prisma.logReply.create({
      data:    { logId: log.id, userId: req.user!.userId, content: req.body.content },
      include: { user: { select: { id: true, name: true } } },
    });

    // Notify the original log author when someone else replies
    if (log.userId !== req.user!.userId) {
      emitToUser(log.userId, 'worklog:reply', {
        replyId:    reply.id,
        logId:      log.id,
        taskName:   log.task.name,
        repliedBy:  req.user!.email,
        preview:    req.body.content.substring(0, 80),
      });
    }

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'REPLY_WORKLOG', entity: 'LogReply', entityId: reply.id,
      newValue: { logId: log.id }, ipAddress: req.ip,
    });

    return created(res, reply, 'Reply added');
  }
);

export default router;
