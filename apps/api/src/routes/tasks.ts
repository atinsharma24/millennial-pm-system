/**
 * @file routes/tasks.ts
 * @description Task CRUD, assignment, and status-change endpoints.
 *
 * Access control summary:
 * - GET  /tasks             — all roles (scoped: employee sees only assigned, PM sees project tasks)
 * - POST /tasks             — Admin or PM (PM must own the project)
 * - GET  /tasks/:id         — all roles (scoped)
 * - PATCH /tasks/:id        — Admin/PM for all fields; Employee for status only
 * - POST /tasks/:id/assign  — Admin or PM (PM must own the project)
 * - DELETE /tasks/:id       — Admin or PM (PM must own the project)
 *
 * Real-time: every mutating operation emits a `task:updated` socket event to
 * each assignee's private room so the Kanban board updates live.
 */

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
import { emitToUser } from '../utils/socket';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns `true` if the current user may create / modify tasks inside `projectId`.
 * Admins can touch any project; PMs only their own.
 */
async function canManageTask(req: AuthRequest, projectId: string): Promise<boolean> {
  if (req.user!.role === Role.ADMIN) return true;
  if (req.user!.role === Role.PROJECT_MANAGER) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    return project?.managerId === req.user!.userId;
  }
  return false;
}

/**
 * Push a `task:updated` Socket.IO event to every user assigned to `taskId`.
 * Used after any mutation so the Kanban board and task list refresh in real time.
 *
 * @param taskId - Database Task ID whose assignees should be notified
 * @param data   - Payload broadcast to each assignee's room
 */
async function broadcastTaskUpdate(taskId: string, data: Record<string, unknown>) {
  const assignments = await prisma.taskAssignment.findMany({
    where: { taskId },
    select: { userId: true },
  });
  for (const { userId } of assignments) {
    emitToUser(userId, 'task:updated', data);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks (role-scoped)
 *     description: |
 *       - **Admin** — all tasks across all projects
 *       - **Project Manager** — tasks belonging to managed projects
 *       - **Employee** — only assigned tasks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [TODO, IN_PROGRESS, IN_REVIEW, COMPLETED, BLOCKED] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *       - in: query
 *         name: projectId
 *         schema: { type: string }
 *       - in: query
 *         name: employeeId
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: deadlineBefore
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: deadlineAfter
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated task list
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const status       = req.query.status       as TaskStatus  | undefined;
  const priority     = req.query.priority     as TaskPriority | undefined;
  const employeeId   = req.query.employeeId   as string | undefined;
  const projectId    = req.query.projectId    as string | undefined;
  const search       = req.query.search       as string | undefined;
  const deadlineBefore = req.query.deadlineBefore ? new Date(req.query.deadlineBefore as string) : undefined;
  const deadlineAfter  = req.query.deadlineAfter  ? new Date(req.query.deadlineAfter  as string) : undefined;
  const overdue        = req.query.overdue === 'true';

  const where: Record<string, unknown> = {};

  // Role-scoping
  if (req.user!.role === Role.EMPLOYEE) {
    where['assignments'] = { some: { userId: req.user!.userId } };
  } else if (req.user!.role === Role.PROJECT_MANAGER) {
    where['project'] = { managerId: req.user!.userId };
  }

  // Filters
  if (status)   where['status']   = status;
  if (priority) where['priority'] = priority;
  if (projectId) where['projectId'] = projectId;
  if (employeeId && req.user!.role !== Role.EMPLOYEE) {
    where['assignments'] = { some: { userId: employeeId } };
  }
  if (search) where['name'] = { contains: search };
  if (overdue) {
    where['deadline'] = { lt: new Date() };
    where['status']   = { notIn: [TaskStatus.COMPLETED] };
  } else if (deadlineBefore || deadlineAfter) {
    where['deadline'] = {
      ...(deadlineAfter  && { gte: deadlineAfter  }),
      ...(deadlineBefore && { lte: deadlineBefore }),
    };
  }

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

  return res.json({
    success: true,
    data: tasks,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task (Admin or PM of the project)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, projectId, deadline]
 *             properties:
 *               name:           { type: string }
 *               description:    { type: string }
 *               projectId:      { type: string }
 *               priority:       { type: string, enum: [LOW,MEDIUM,HIGH,CRITICAL] }
 *               status:         { type: string, enum: [TODO,IN_PROGRESS,IN_REVIEW,COMPLETED,BLOCKED] }
 *               deadline:       { type: string, format: date-time }
 *               estimatedHours: { type: number }
 *               assigneeIds:    { type: array, items: { type: string } }
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
        name,
        description,
        priority:       priority       || TaskPriority.MEDIUM,
        status:         status         || TaskStatus.TODO,
        deadline:       new Date(deadline),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        projectId,
        createdById: req.user!.userId,
        ...(assigneeIds?.length && {
          assignments: { create: assigneeIds.map((uid: string) => ({ userId: uid })) },
        }),
      },
      include: {
        project:     { select: { id: true, name: true } },
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    // Notify each assignee via Socket.IO
    for (const a of task.assignments) {
      emitToUser(a.user.id, 'task:assigned', {
        taskId: task.id,
        taskName: task.name,
        projectName: task.project.name,
        deadline: task.deadline,
      });
    }

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'CREATE_TASK', entity: 'Task', entityId: task.id,
      newValue: { name, projectId, priority, deadline },
      ipAddress: req.ip,
    });

    return created(res, task, 'Task created');
  }
);

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get full task detail including work logs and replies
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
          replies: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!task) return notFound(res);

  if (req.user!.role === Role.EMPLOYEE) {
    if (!task.assignments.some((a) => a.user.id === req.user!.userId)) return forbidden(res);
  } else if (req.user!.role === Role.PROJECT_MANAGER) {
    if (task.project.managerId !== req.user!.userId) return forbidden(res);
  }

  return ok(res, task);
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update a task
 *     description: |
 *       Employees may only update `status` on their own assigned tasks.
 *       Admins and PMs can update all fields.
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

    // Employees: can only update `status` on their own assigned tasks
    if (req.user!.role === Role.EMPLOYEE) {
      if (!task.assignments.some((a) => a.userId === req.user!.userId)) return forbidden(res);
      const { status } = req.body;
      if (!status) return badRequest(res, 'Employees may only update task status');

      const previous = { status: task.status };
      const updated  = await prisma.task.update({ where: { id: task.id }, data: { status } });

      await writeAudit({
        userId: req.user!.userId, userEmail: req.user!.email,
        action: 'UPDATE_TASK_STATUS', entity: 'Task', entityId: task.id,
        previousValue: previous, newValue: { status }, ipAddress: req.ip,
      });

      // Notify all assignees of status change
      await broadcastTaskUpdate(task.id, { taskId: task.id, status, updatedBy: req.user!.email });

      return ok(res, updated);
    }

    if (!(await canManageTask(req, task.projectId))) return forbidden(res);

    const previous = { name: task.name, status: task.status, priority: task.priority, deadline: task.deadline };
    const { name, description, status, priority, deadline, estimatedHours } = req.body;

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        ...(name        !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status      !== undefined && { status }),
        ...(priority    !== undefined && { priority }),
        ...(deadline    !== undefined && { deadline: new Date(deadline) }),
        ...(estimatedHours !== undefined && { estimatedHours: parseFloat(estimatedHours) }),
      },
      include: {
        project:     { select: { id: true, name: true } },
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'UPDATE_TASK', entity: 'Task', entityId: task.id,
      previousValue: previous, newValue: req.body, ipAddress: req.ip,
    });

    await broadcastTaskUpdate(task.id, { taskId: task.id, status: updated.status, updatedBy: req.user!.email });

    return ok(res, updated);
  }
);

/**
 * @swagger
 * /api/tasks/{id}/assign:
 *   post:
 *     tags: [Tasks]
 *     summary: Assign one or more employees to a task (upsert — safe to call multiple times)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds: { type: array, items: { type: string } }
 */
router.post(
  '/:id/assign',
  requireAdminOrPM,
  [body('userIds').isArray({ min: 1 })],
  validate,
  async (req: AuthRequest, res: Response) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    if (!task) return notFound(res);
    if (!(await canManageTask(req, task.projectId))) return forbidden(res);

    const { userIds } = req.body;
    for (const userId of userIds as string[]) {
      await prisma.taskAssignment.upsert({
        where: { taskId_userId: { taskId: task.id, userId } },
        update: {},
        create: { taskId: task.id, userId },
      });
      emitToUser(userId, 'task:assigned', {
        taskId: task.id,
        taskName: task.name,
        projectName: task.project.name,
        deadline: task.deadline,
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
 *     summary: Delete a task (Admin or owning PM)
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
