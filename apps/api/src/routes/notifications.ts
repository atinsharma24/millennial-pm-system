/**
 * @file routes/notifications.ts
 * @description In-app notification retrieval and read-marking endpoints.
 *
 * Notifications are created by the scheduler worker (deadline reminders +
 * overdue alerts) and indirectly by work-log routes.  This module only
 * exposes read + mark-read operations; creation is handled by the scheduler.
 *
 * Socket.IO channel: `notification:new` — emitted by the scheduler when a
 * notification row is written; the client-side bell subscribes to this.
 */

import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ok, notFound } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List notifications for the current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *         description: Pass true to fetch only unread notifications
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const unreadOnly = req.query.unread === 'true';

  const where = {
    userId: req.user!.userId,
    ...(unreadOnly && { isRead: false }),
  };

  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where, skip, take: limit,
      include: { task: { select: { id: true, name: true } } },
      orderBy: { sentAt: 'desc' },
    }),
  ]);

  return res.json({
    success: true,
    data: notifications,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}));

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/read', asyncHandler(async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notif || notif.userId !== req.user!.userId) return notFound(res);

  const updated = await prisma.notification.update({
    where: { id: notif.id },
    data:  { isRead: true },
  });
  return ok(res, updated);
}));

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all of the current user's notifications as read
 *     security:
 *       - bearerAuth: []
 */
router.patch('/read-all', asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data:  { isRead: true },
  });
  return ok(res, null, 'All notifications marked as read');
}));

export default router;
