import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import { TaskStatus, TaskPriority, Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdminOrPM } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';
import { ok, created, notFound, forbidden, badRequest } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { writeAudit } from '../middleware/audit';

const router = Router({ mergeParams: true });
router.use(authenticate);

async function canManageTask(req: AuthRequest, projectId: string): Promise<boolean> {
  if (req.user!.role === Role.ADMIN) return true;
  if (req.user!.role === Role.PROJECT_MANAGER) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    return project?.managerId === req.user!.userId;
  }
  return false;
}

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks (scoped by role)
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const status = req.query.status as TaskStatus | undefined;
  const priority = req.query.priority as TaskPriority | undefined;
  const employeeId = req.query.employeeId as string | undefined;
  const projectId = req.query.projectId as string | undefined;
  const deadlineBefore = req.query.deadlineBefore ? new Date(req.query.deadlineBefore as string) : undefined;
  const deadlineAfter = req.query.deadlineAfter ? new Date(req.query.deadlineAfter as string) : undefined;
  const search = req.query.search as string | undefined;

  const where: Record<string, unknown> = {};

  if (req.user!.role === Role.EMPLOYEE) {
    where['assignments'] = { some: { userId: req.user!.userId } };
  } else if (req.user!.role === Role.PROJECT_MANAGER) {
    where['project'] = { managerId: req.user!.userId };
  }

  if (status) where['status'] = status;
  if (priority) where['priority'] = priority;
  if (projectId) where['projectId'] = projectId;
  if (employeeId && req.user!.role !== Role.EMPLOYEE) where['assignments'] = { some: { userId: employeeId } };
  if (deadlineBefore || deadlineAfter) {
    where['deadline'] = { ...(deadlineAfter && { gte: deadlineAfter }), ...(deadlineBefore && { lte: deadlineBefore }) };
  }
  if (search) where['name'] = { contains: search };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where, skip, take: limit,
      include: {
        project: { select: { id: true, name: true } },
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { workLogs: true } },
      },
      orderBy: { deadline: 'asc' },
    }),
  ]);

  return res.json({ success: true, data: tasks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task (Admin or PM of that project)
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/',
  requireAdminOrPM,
  [
    body('name').notEmpty().trim(),
    body('description').optional().trim(),
    body('projectId').notEmpty(),
    body('priority').optional().isIn(Object.values(TaskPriority)),
    body('status').optional().isIn(Object.values(TaskStatus)),
    body('deadline').isISO8601(),
    body('estimatedHours').optional().isFloat({ min: 0 }),
    body('assigneeIds').optional().isArray(),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const { name, description, projectId, priority, status, deadline, estimatedHours, assigneeIds } = req.body;

    if (!(await canManageTask(req, projectId))) return forbidden(res);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return badRequest(res, 'Project not found');

    const task = await prisma.task.create({
      data: {
        name, description, priority: priority || TaskPriority.MEDIUM,
        status: status || TaskStatus.TODO,
        deadline: new Date(deadline),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        projectId,
        createdById: req.user!.userId,
        ...(assigneeIds?.length && {
          assignments: { create: assigneeIds.map((uid: string) => ({ userId: uid })) },
        }),
      },
      include: {
        project: { select: { id: true, name: true } },
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'CREATE_TASK', entity: 'Task', entityId: task.id,
      newValue: { name, projectId, priority, deadline }, ipAddress: req.ip,
    });

    return created(res, task, 'Task created');
  }
);

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task detail
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: {
      project: { select: { id: true, name: true, managerId: true } },
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      workLogs: {
        include: {
          user: { select: { id: true, name: true } },
          replies: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!task) return notFound(res);

  if (req.user!.role === Role.EMPLOYEE) {
    const isAssigned = task.assignments.some((a) => a.user.id === req.user!.userId);
    if (!isAssigned) return forbidden(res);
  } else if (req.user!.role === Role.PROJECT_MANAGER && task.project.managerId !== req.user!.userId) {
    return forbidden(res);
  }

  return ok(res, task);
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update task
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id',
  [
    param('id').notEmpty(),
    body('name').optional().trim(),
    body('status').optional().isIn(Object.values(TaskStatus)),
    body('priority').optional().isIn(Object.values(TaskPriority)),
    body('deadline').optional().isISO8601(),
    body('estimatedHours').optional().isFloat({ min: 0 }),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { project: true, assignments: true },
    });
    if (!task) return notFound(res);

    // Employees can only update status of their assigned tasks
    if (req.user!.role === Role.EMPLOYEE) {
      const isAssigned = task.assignments.some((a) => a.userId === req.user!.userId);
      if (!isAssigned) return forbidden(res);
      const { status } = req.body;
      if (!status) return badRequest(res, 'Employees can only update task status');

      const previous = { status: task.status };
      const updated = await prisma.task.update({ where: { id: task.id }, data: { status } });
      await writeAudit({
        userId: req.user!.userId, userEmail: req.user!.email,
        action: 'UPDATE_TASK_STATUS', entity: 'Task', entityId: task.id,
        previousValue: previous, newValue: { status }, ipAddress: req.ip,
      });
      return ok(res, updated);
    }

    if (!(await canManageTask(req, task.projectId))) return forbidden(res);

    const previous = { name: task.name, status: task.status, priority: task.priority, deadline: task.deadline };
    const { name, description, status, priority, deadline, estimatedHours } = req.body;

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(estimatedHours !== undefined && { estimatedHours: parseFloat(estimatedHours) }),
      },
      include: {
        project: { select: { id: true, name: true } },
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'UPDATE_TASK', entity: 'Task', entityId: task.id,
      previousValue: previous, newValue: req.body, ipAddress: req.ip,
    });

    return ok(res, updated);
  }
);

/**
 * @swagger
 * /api/tasks/{id}/assign:
 *   post:
 *     tags: [Tasks]
 *     summary: Assign employees to a task
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/:id/assign',
  requireAdminOrPM,
  [body('userIds').isArray({ min: 1 })],
  validate,
  async (req: AuthRequest, res: Response) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: { project: true } });
    if (!task) return notFound(res);
    if (!(await canManageTask(req, task.projectId))) return forbidden(res);

    const { userIds } = req.body;

    for (const userId of userIds) {
      await prisma.taskAssignment.upsert({
        where: { taskId_userId: { taskId: task.id, userId } },
        update: {},
        create: { taskId: task.id, userId },
      });
    }

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'ASSIGN_TASK', entity: 'Task', entityId: task.id,
      newValue: { assignedUserIds: userIds }, ipAddress: req.ip,
    });

    const updated = await prisma.task.findUnique({
      where: { id: task.id },
      include: { assignments: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    return ok(res, updated);
  }
);

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete task (Admin or PM)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', requireAdminOrPM, async (req: AuthRequest, res: Response) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return notFound(res);
  if (!(await canManageTask(req, task.projectId))) return forbidden(res);

  await prisma.task.delete({ where: { id: task.id } });

  await writeAudit({
    userId: req.user!.userId, userEmail: req.user!.email,
    action: 'DELETE_TASK', entity: 'Task', entityId: task.id,
    previousValue: { name: task.name, status: task.status }, ipAddress: req.ip,
  });

  return ok(res, null, 'Task deleted');
});

export default router;
