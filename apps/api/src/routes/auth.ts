import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ok, created, unauthorized, badRequest, notFound, serverError } from '../utils/response';
import { writeAudit } from '../middleware/audit';
import { sendEmail } from '../services/email';

const router = Router();

function signAccess(userId: string, email: string, role: string) {
  return jwt.sign({ userId, email, role }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as never,
  });
}

function signRefresh(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as never,
  });
}

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and get JWT tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  validate,
  async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return unauthorized(res, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return unauthorized(res, 'Invalid credentials');

    const accessToken = signAccess(user.id, user.email, user.role);
    const refreshToken = signRefresh(user.id);

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    await writeAudit({
      userId: user.id, userEmail: user.email,
      action: 'LOGIN', entity: 'User', entityId: user.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
    });

    return ok(res, {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return unauthorized(res);

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.refreshToken !== refreshToken) return unauthorized(res);

    const newAccess = signAccess(user.id, user.email, user.role);
    const newRefresh = signRefresh(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefresh } });

    return ok(res, { accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    return unauthorized(res, 'Invalid refresh token');
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and invalidate refresh token
 *     security:
 *       - bearerAuth: []
 */
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  await prisma.user.update({ where: { id: req.user!.userId }, data: { refreshToken: null } });
  await writeAudit({
    userId: req.user!.userId, userEmail: req.user!.email,
    action: 'LOGOUT', entity: 'User', entityId: req.user!.userId,
    ipAddress: req.ip,
  });
  return ok(res, null, 'Logged out');
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  if (!user) return notFound(res);
  return ok(res, user);
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset link
 */
router.post(
  '/forgot-password',
  [body('email').isEmail()],
  validate,
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent user enumeration
    if (!user) return ok(res, null, 'If the email exists, a reset link has been sent');

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html: `<p>Hi ${user.name},</p><p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 1 hour.</p>`,
    });

    return ok(res, null, 'If the email exists, a reset link has been sent');
  }
);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with token
 */
router.post(
  '/reset-password',
  [body('token').notEmpty(), body('password').isLength({ min: 8 })],
  validate,
  async (req: Request, res: Response) => {
    const { token, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token, passwordResetExpires: { gte: new Date() } },
    });
    if (!user) return badRequest(res, 'Invalid or expired reset token');

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordResetToken: null, passwordResetExpires: null },
    });

    return ok(res, null, 'Password reset successful');
  }
);

export default router;
