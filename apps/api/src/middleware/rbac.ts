import { Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AuthRequest } from '../types';
import { forbidden } from '../utils/response';

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return forbidden(res);
    }
    next();
  };
}

export const requireAdmin = requireRole(Role.ADMIN);
export const requireAdminOrPM = requireRole(Role.ADMIN, Role.PROJECT_MANAGER);
export const requireAny = requireRole(Role.ADMIN, Role.PROJECT_MANAGER, Role.EMPLOYEE);
