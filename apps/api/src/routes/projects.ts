import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import { ProjectStatus, Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireAdminOrPM } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';
import { ok, created, notFound, forbidden, badRequest } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

function canAccessProject(req: AuthRequest, managerId: string): boolean {
  if (req.user!.role === Role.ADMIN) return true;
  if (req.user!.role === Role.PROJECT_MANAGER && managerId === req.user!.userId) return true;
  return false;
}

/**
 * @swagger
 * /api/projects:
 *   get:
 *     tags: [Projects]
 *     summary: List projects (scoped by role)
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const status = req.query.status as ProjectStatus | undefined;
  const managerId = req.query.managerId as string | undefined;
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;

  const where: Record<string, unknown> = {};
  if (req.user!.role === Role.PROJECT_MANAGER) where['managerId'] = req.user!.userId;
  if (req.user!.role === Role.EMPLOYEE) {
    // Employees can see projects their tasks belong to
    const assignedProjectIds = await prisma.taskAssignment.findMany({
      where: { userId: req.user!.userId },
      select: { task: { select: { projectId: true } } },
    });
    const ids = [...new Set(assignedProjectIds.map((a) => a.task.projectId))];
    where['id'] = { in: ids };
  }
  if (status) where['status'] = status;
  if (managerId && req.user!.role === Role.ADMIN) where['managerId'] = managerId;
  if (from || to) where['startDate'] = { ...(from && { gte: from }), ...(to && { lte: to }) };

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where, skip, take: limit,
      include: {
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return res.json({ success: true, data: projects, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/**
 * @swagger
 * /api/projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a project (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/',
  requireAdmin,
  [
    body('name').notEmpty().trim(),
    body('description').optional().trim(),
    body('startDate').isISO8601(),
    body('endDate').isISO8601(),
    body('managerId').notEmpty(),
    body('status').optional().isIn(Object.values(ProjectStatus)),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const { name, description, startDate, endDate, managerId, status } = req.body;

    const manager = await prisma.user.findUnique({ where: { id: managerId } });
    if (!manager || manager.role !== Role.PROJECT_MANAGER) {
      return badRequest(res, 'Manager must be a user with PROJECT_MANAGER role');
    }

    const project = await prisma.project.create({
      data: {
        name, description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: status || ProjectStatus.PLANNING,
        managerId,
        createdById: req.user!.userId,
      },
      include: { manager: { select: { id: true, name: true, email: true } } },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'CREATE_PROJECT', entity: 'Project', entityId: project.id,
      newValue: { name, managerId, status }, ipAddress: req.ip,
    });

    return created(res, project, 'Project created');
  }
);

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project details
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      manager: { select: { id: true, name: true, email: true } },
      tasks: {
        include: {
          assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!project) return notFound(res);

  if (req.user!.role === Role.EMPLOYEE) {
    const isAssigned = project.tasks.some((t) =>
      t.assignments.some((a) => a.user.id === req.user!.userId)
    );
    if (!isAssigned) return forbidden(res);
  } else if (!canAccessProject(req, project.managerId)) {
    return forbidden(res);
  }

  // Compute completion %
  const total = project.tasks.length;
  const completed = project.tasks.filter((t) => t.status === 'COMPLETED').length;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return ok(res, { ...project, completionPct });
});

/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     tags: [Projects]
 *     summary: Update project
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id',
  requireAdminOrPM,
  [
    param('id').notEmpty(),
    body('name').optional().trim(),
    body('description').optional().trim(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('status').optional().isIn(Object.values(ProjectStatus)),
    body('managerId').optional(),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return notFound(res);
    if (!canAccessProject(req, project.managerId)) return forbidden(res);

    const previous = { name: project.name, status: project.status, managerId: project.managerId };
    const { name, description, startDate, endDate, status, managerId } = req.body;

    if (managerId && req.user!.role !== Role.ADMIN) return forbidden(res, 'Only admin can reassign manager');

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(status && { status }),
        ...(managerId && { managerId }),
      },
      include: { manager: { select: { id: true, name: true, email: true } } },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'UPDATE_PROJECT', entity: 'Project', entityId: project.id,
      previousValue: previous, newValue: req.body, ipAddress: req.ip,
    });

    return ok(res, updated);
  }
);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete project (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return notFound(res);

  await prisma.project.delete({ where: { id: req.params.id } });

  await writeAudit({
    userId: req.user!.userId, userEmail: req.user!.email,
    action: 'DELETE_PROJECT', entity: 'Project', entityId: project.id,
    previousValue: { name: project.name, status: project.status }, ipAddress: req.ip,
  });

  return ok(res, null, 'Project deleted');
});

export default router;
