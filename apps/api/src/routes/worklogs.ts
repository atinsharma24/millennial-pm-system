import { Router, Response } from 'express';
import { body } from 'express-validator';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';
import { ok, created, notFound, forbidden } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { writeAudit } from '../middleware/audit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /api/worklogs:
 *   get:
 *     tags: [WorkLogs]
 *     summary: List work logs
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const taskId = req.query.taskId as string | undefined;
  const projectId = req.query.projectId as string | undefined;
  const employeeId = req.query.employeeId as string | undefined;
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;

  const where: Record<string, unknown> = {};

  if (req.user!.role === Role.EMPLOYEE) where['userId'] = req.user!.userId;
  else if (req.user!.role === Role.PROJECT_MANAGER) {
    where['task'] = { project: { managerId: req.user!.userId } };
  }

  if (taskId) where['taskId'] = taskId;
  if (projectId) where['task'] = { projectId };
  if (employeeId && req.user!.role !== Role.EMPLOYEE) where['userId'] = employeeId;
  if (from || to) where['createdAt'] = { ...(from && { gte: from }), ...(to && { lte: to }) };

  const [total, logs] = await Promise.all([
    prisma.workLog.count({ where }),
    prisma.workLog.findMany({
      where, skip, take: limit,
      include: {
        user: { select: { id: true, name: true } },
        task: { select: { id: true, name: true, projectId: true, project: { select: { name: true } } } },
        replies: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return res.json({ success: true, data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/**
 * @swagger
 * /api/worklogs:
 *   post:
 *     tags: [WorkLogs]
 *     summary: Submit a work log (Employee)
 *     security:
 *       - bearerAuth: []
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
      where: { id: taskId },
      include: { assignments: true },
    });
    if (!task) return notFound(res, 'Task not found');

    if (req.user!.role === Role.EMPLOYEE) {
      const isAssigned = task.assignments.some((a) => a.userId === req.user!.userId);
      if (!isAssigned) return forbidden(res, 'You are not assigned to this task');
    }

    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

    const log = await prisma.workLog.create({
      data: {
        taskId,
        userId: req.user!.userId,
        description,
        hoursWorked: parseFloat(hoursWorked),
        attachmentUrl,
      },
      include: {
        user: { select: { id: true, name: true } },
        replies: true,
      },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'SUBMIT_WORKLOG', entity: 'WorkLog', entityId: log.id,
      newValue: { taskId, hoursWorked }, ipAddress: req.ip,
    });

    return created(res, log, 'Work log submitted');
  }
);

/**
 * @swagger
 * /api/worklogs/{id}/replies:
 *   post:
 *     tags: [WorkLogs]
 *     summary: Reply to a work log (PM or Admin)
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/:id/replies',
  [body('content').notEmpty().trim()],
  validate,
  async (req: AuthRequest, res: Response) => {
    const log = await prisma.workLog.findUnique({
      where: { id: req.params.id },
      include: { task: { include: { project: true } } },
    });
    if (!log) return notFound(res);

    if (req.user!.role === Role.EMPLOYEE && log.userId !== req.user!.userId) return forbidden(res);
    if (req.user!.role === Role.PROJECT_MANAGER && log.task.project.managerId !== req.user!.userId) return forbidden(res);

    const reply = await prisma.logReply.create({
      data: { logId: log.id, userId: req.user!.userId, content: req.body.content },
      include: { user: { select: { id: true, name: true } } },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'REPLY_WORKLOG', entity: 'LogReply', entityId: reply.id,
      newValue: { logId: log.id }, ipAddress: req.ip,
    });

    return created(res, reply, 'Reply added');
  }
);

export default router;
