import { Router, Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { AuthRequest } from '../types';
import { ok } from '../utils/response';
import { parsePagination } from '../utils/pagination';

const router = Router();
router.use(authenticate, requireAdmin);

/**
 * @swagger
 * /api/audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit logs (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const userId = req.query.userId as string | undefined;
  const entity = req.query.entity as string | undefined;
  const action = req.query.action as string | undefined;
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;

  const where: Record<string, unknown> = {};
  if (userId) where['userId'] = userId;
  if (entity) where['entity'] = entity;
  if (action) where['action'] = action;
  if (from || to) where['createdAt'] = { ...(from && { gte: from }), ...(to && { lte: to }) };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where, skip, take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return res.json({ success: true, data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

export default router;
