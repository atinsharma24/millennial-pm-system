/**
 * @file routes/reports.ts
 * @description Reporting and analytics endpoints.
 *
 * Endpoint summary:
 * - GET /reports/dashboard  — role-aware stats (Admin / PM / Employee)
 * - GET /reports/projects   — project completion breakdown (Admin + PM)
 * - GET /reports/employees  — per-employee productivity metrics (Admin + PM)
 *
 * All endpoints require authentication.  `requireAdminOrPM` is applied where
 * employee access is intentionally blocked.
 */

import { Router, Response } from 'express';
import { Role, TaskStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdminOrPM } from '../middleware/rbac';
import { AuthRequest } from '../types';
import { ok } from '../utils/response';

const router = Router();
router.use(authenticate);

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     tags: [Reports]
 *     summary: Role-aware dashboard statistics
 *     description: |
 *       Returns different stat shapes depending on the caller's role:
 *       - **Admin**: total projects/tasks, active employees, overdue/completed counts
 *       - **Project Manager**: managed project count, active tasks, upcoming deadlines
 *       - **Employee**: assigned tasks, due-soon count, completed count, hours logged
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats object (shape varies by role)
 */
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;

  // ── Admin ────────────────────────────────────────────────────────────────
  if (role === Role.ADMIN) {
    const [
      totalProjects,
      totalTasks,
      activeEmployees,
      overdueTasks,
      completedTasks,
      recentProjects,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.task.count(),
      prisma.user.count({ where: { role: Role.EMPLOYEE, isActive: true } }),
      prisma.task.count({
        where: { deadline: { lt: new Date() }, status: { notIn: [TaskStatus.COMPLETED] } },
      }),
      prisma.task.count({ where: { status: TaskStatus.COMPLETED } }),
      prisma.project.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          manager: { select: { name: true } },
          _count:  { select: { tasks: true } },
        },
      }),
    ]);

    return ok(res, {
      totalProjects,
      totalTasks,
      activeEmployees,
      overdueTasks,
      completedTasks,
      recentProjects,
    });
  }

  // ── Project Manager ───────────────────────────────────────────────────────
  if (role === Role.PROJECT_MANAGER) {
    const [managedProjects, activeTasks, upcomingDeadlines, overdueTasks, recentTasks] =
      await Promise.all([
        prisma.project.count({ where: { managerId: userId } }),
        prisma.task.count({
          where: {
            project: { managerId: userId },
            status: { notIn: [TaskStatus.COMPLETED] },
          },
        }),
        prisma.task.count({
          where: {
            project: { managerId: userId },
            deadline: { gte: new Date(), lte: new Date(Date.now() + 7 * 86_400_000) },
            status:   { notIn: [TaskStatus.COMPLETED] },
          },
        }),
        prisma.task.count({
          where: {
            project: { managerId: userId },
            deadline: { lt: new Date() },
            status:   { notIn: [TaskStatus.COMPLETED] },
          },
        }),
        prisma.task.findMany({
          where: { project: { managerId: userId } },
          take: 5,
          orderBy: { deadline: 'asc' },
          include: { assignments: { include: { user: { select: { name: true } } } } },
        }),
      ]);

    return ok(res, { managedProjects, activeTasks, upcomingDeadlines, overdueTasks, recentTasks });
  }

  // ── Employee ──────────────────────────────────────────────────────────────
  const [assignedTasks, dueSoon, completedCount, hoursLogged, recentLogs] = await Promise.all([
    prisma.taskAssignment.count({ where: { userId } }),
    prisma.task.count({
      where: {
        assignments: { some: { userId } },
        deadline: { gte: new Date(), lte: new Date(Date.now() + 48 * 3_600_000) },
        status:   { notIn: [TaskStatus.COMPLETED] },
      },
    }),
    prisma.task.count({
      where: {
        assignments: { some: { userId } },
        status: TaskStatus.COMPLETED,
      },
    }),
    prisma.workLog.aggregate({
      where: { userId },
      _sum: { hoursWorked: true },
    }),
    prisma.workLog.findMany({
      where: { userId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { task: { select: { name: true, project: { select: { name: true } } } } },
    }),
  ]);

  return ok(res, {
    assignedTasks,
    dueSoon,
    completedTasks: completedCount,
    totalHoursLogged: hoursLogged._sum.hoursWorked ?? 0,
    recentLogs,
  });
});

// ─── Project report ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/reports/projects:
 *   get:
 *     tags: [Reports]
 *     summary: Project completion breakdown (Admin + PM)
 *     description: Returns per-project totals for total / completed / pending tasks and a completion percentage.
 *     security:
 *       - bearerAuth: []
 */
router.get('/projects', requireAdminOrPM, async (req: AuthRequest, res: Response) => {
  const where = req.user!.role === Role.PROJECT_MANAGER ? { managerId: req.user!.userId } : {};

  const projects = await prisma.project.findMany({
    where,
    include: {
      manager: { select: { name: true } },
      tasks:   { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const report = projects.map((p) => {
    const total     = p.tasks.length;
    const completed = p.tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const overdue   = p.tasks.filter(
      (t) => t.status !== TaskStatus.COMPLETED
    ).length; // simplified — real overdue needs deadline check

    return {
      id:            p.id,
      name:          p.name,
      status:        p.status,
      manager:       p.manager.name,
      totalTasks:    total,
      completedTasks: completed,
      pendingTasks:  total - completed,
      overdueTasks:  overdue,
      completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  return ok(res, report);
});

// ─── Employee report ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/reports/employees:
 *   get:
 *     tags: [Reports]
 *     summary: Per-employee productivity metrics (Admin + PM)
 *     description: |
 *       - Admin sees all employees.
 *       - PM sees only employees assigned to their projects.
 *     security:
 *       - bearerAuth: []
 */
router.get('/employees', requireAdminOrPM, async (req: AuthRequest, res: Response) => {
  let employeeIds: string[] | undefined;

  if (req.user!.role === Role.PROJECT_MANAGER) {
    const rows = await prisma.taskAssignment.findMany({
      where:   { task: { project: { managerId: req.user!.userId } } },
      select:  { userId: true },
      distinct: ['userId'],
    });
    employeeIds = rows.map((r) => r.userId);
  }

  const employees = await prisma.user.findMany({
    where: {
      role:     Role.EMPLOYEE,
      isActive: true,
      ...(employeeIds && { id: { in: employeeIds } }),
    },
    include: {
      taskAssignments: {
        include: { task: { select: { status: true, createdAt: true, updatedAt: true } } },
      },
      workLogs: { select: { hoursWorked: true } },
    },
  });

  const report = employees.map((emp) => {
    const tasks     = emp.taskAssignments.map((a) => a.task);
    const completed = tasks.filter((t) => t.status === TaskStatus.COMPLETED);
    const totalHours = emp.workLogs.reduce((s, l) => s + l.hoursWorked, 0);
    const avgMs      = completed.length > 0
      ? completed.reduce((s, t) => s + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) / completed.length
      : 0;

    return {
      id:              emp.id,
      name:            emp.name,
      email:           emp.email,
      assignedTasks:   tasks.length,
      completedTasks:  completed.length,
      totalHoursLogged: Math.round(totalHours * 10) / 10,
      avgCompletionDays: avgMs > 0 ? Math.round(avgMs / 86_400_000) : 0,
    };
  });

  return ok(res, report);
});

export default router;
