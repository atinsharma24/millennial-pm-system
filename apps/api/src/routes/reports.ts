import { Router, Response } from 'express';
import { Role, TaskStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdminOrPM } from '../middleware/rbac';
import { AuthRequest } from '../types';
import { ok, forbidden } from '../utils/response';

const router = Router();
router.use(authenticate, requireAdminOrPM);

/**
 * @swagger
 * /api/reports/projects:
 *   get:
 *     tags: [Reports]
 *     summary: Project completion report
 *     security:
 *       - bearerAuth: []
 */
router.get('/projects', async (req: AuthRequest, res: Response) => {
  const where = req.user!.role === Role.PROJECT_MANAGER ? { managerId: req.user!.userId } : {};

  const projects = await prisma.project.findMany({
    where,
    include: { _count: { select: { tasks: true } }, tasks: { select: { status: true } } },
  });

  const report = projects.map((p) => {
    const total = p.tasks.length;
    const completed = p.tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const pending = total - completed;
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: pending,
      completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  return ok(res, report);
});

/**
 * @swagger
 * /api/reports/employees:
 *   get:
 *     tags: [Reports]
 *     summary: Employee productivity report
 *     security:
 *       - bearerAuth: []
 */
router.get('/employees', async (req: AuthRequest, res: Response) => {
  let employeeIds: string[] | undefined;

  if (req.user!.role === Role.PROJECT_MANAGER) {
    const assignments = await prisma.taskAssignment.findMany({
      where: { task: { project: { managerId: req.user!.userId } } },
      select: { userId: true },
      distinct: ['userId'],
    });
    employeeIds = assignments.map((a) => a.userId);
  }

  const employees = await prisma.user.findMany({
    where: {
      role: Role.EMPLOYEE,
      ...(employeeIds && { id: { in: employeeIds } }),
    },
    include: {
      taskAssignments: {
        include: {
          task: { select: { status: true, createdAt: true, updatedAt: true } },
        },
      },
      workLogs: { select: { hoursWorked: true } },
    },
  });

  const report = employees.map((emp) => {
    const tasks = emp.taskAssignments.map((a) => a.task);
    const completed = tasks.filter((t) => t.status === TaskStatus.COMPLETED);
    const totalHours = emp.workLogs.reduce((sum, l) => sum + l.hoursWorked, 0);
    const avgMs = completed.length > 0
      ? completed.reduce((sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) / completed.length
      : 0;
    const avgDays = avgMs > 0 ? Math.round(avgMs / (1000 * 60 * 60 * 24)) : 0;

    return {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      assignedTasks: tasks.length,
      completedTasks: completed.length,
      totalHoursLogged: Math.round(totalHours * 10) / 10,
      avgCompletionDays: avgDays,
    };
  });

  return ok(res, report);
});

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     tags: [Reports]
 *     summary: Dashboard stats (role-scoped)
 *     security:
 *       - bearerAuth: []
 */
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  if (req.user!.role === Role.ADMIN) {
    const [totalProjects, totalTasks, activeEmployees, overdueTasks, completedTasks] = await Promise.all([
      prisma.project.count(),
      prisma.task.count(),
      prisma.user.count({ where: { role: Role.EMPLOYEE, isActive: true } }),
      prisma.task.count({ where: { deadline: { lt: new Date() }, status: { notIn: [TaskStatus.COMPLETED] } } }),
      prisma.task.count({ where: { status: TaskStatus.COMPLETED } }),
    ]);
    return ok(res, { totalProjects, totalTasks, activeEmployees, overdueTasks, completedTasks });
  }

  // PM dashboard
  const [managedProjects, activeTasks, upcomingDeadlines] = await Promise.all([
    prisma.project.count({ where: { managerId: req.user!.userId } }),
    prisma.task.count({ where: { project: { managerId: req.user!.userId }, status: { notIn: [TaskStatus.COMPLETED] } } }),
    prisma.task.count({
      where: {
        project: { managerId: req.user!.userId },
        deadline: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        status: { notIn: [TaskStatus.COMPLETED] },
      },
    }),
  ]);
  return ok(res, { managedProjects, activeTasks, upcomingDeadlines });
});

export default router;
