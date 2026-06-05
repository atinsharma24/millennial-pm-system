import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';
import { ok, created, notFound, conflict, badRequest } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { skip, page, limit } = parsePagination(req.query);
  const role = req.query.role as Role | undefined;
  const search = req.query.search as string | undefined;

  const where = {
    ...(role && { role }),
    ...(search && { OR: [{ name: { contains: search } }, { email: { contains: search } }] }),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where, skip, take: limit,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return res.json({ success: true, data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/**
 * @swagger
 * /api/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a new user (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/',
  requireAdmin,
  [
    body('name').notEmpty().trim(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('role').isIn(Object.values(Role)),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const { name, email, password, role } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return conflict(res, 'Email already registered');

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'CREATE_USER', entity: 'User', entityId: user.id,
      newValue: { name, email, role }, ipAddress: req.ip,
    });

    return created(res, user, 'User created');
  }
);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  if (!user) return notFound(res);
  return ok(res, user);
});

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update user (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id',
  requireAdmin,
  [
    param('id').notEmpty(),
    body('name').optional().trim(),
    body('role').optional().isIn(Object.values(Role)),
    body('isActive').optional().isBoolean(),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return notFound(res);

    const { name, role, isActive } = req.body;
    const previous = { name: user.name, role: user.role, isActive: user.isActive };

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(role && { role }), ...(isActive !== undefined && { isActive }) },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    await writeAudit({
      userId: req.user!.userId, userEmail: req.user!.email,
      action: 'UPDATE_USER', entity: 'User', entityId: user.id,
      previousValue: previous, newValue: req.body, ipAddress: req.ip,
    });

    return ok(res, updated);
  }
);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete user (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return notFound(res);
  if (user.id === req.user!.userId) return badRequest(res, 'Cannot delete yourself');

  await prisma.user.delete({ where: { id: req.params.id } });

  await writeAudit({
    userId: req.user!.userId, userEmail: req.user!.email,
    action: 'DELETE_USER', entity: 'User', entityId: user.id,
    previousValue: { email: user.email, role: user.role }, ipAddress: req.ip,
  });

  return ok(res, null, 'User deleted');
});

export default router;
