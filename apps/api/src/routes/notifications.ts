import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ok, notFound } from '../utils/response';
import { parsePagination } from '../utils/pagination';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notifications for current user
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: AuthRequest, res: Response) => {
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

  return res.json({ success: true, data: notifications, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark notification as read
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notif || notif.userId !== req.user!.userId) return notFound(res);

  const updated = await prisma.notification.update({ where: { id: notif.id }, data: { isRead: true } });
  return ok(res, updated);
});

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 */
router.patch('/read-all', async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.userId, isRead: false }, data: { isRead: true } });
  return ok(res, null, 'All marked as read');
});

export default router;
