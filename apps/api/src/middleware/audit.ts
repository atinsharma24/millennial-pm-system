import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

export interface AuditOptions {
  action: string;
  entity: string;
  getEntityId?: (req: AuthRequest) => string | undefined;
}

export function auditLog(opts: AuditOptions) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      const result = originalJson(body);

      if (res.statusCode < 400) {
        const entityId = opts.getEntityId?.(req) ?? (body as Record<string, unknown>)?.['id'] as string;
        prisma.auditLog
          .create({
            data: {
              userId: req.user?.userId,
              userEmail: req.user?.email,
              action: opts.action,
              entity: opts.entity,
              entityId: entityId ?? null,
              newValue: body as object,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          })
          .catch((e) => logger.error('Audit log failed', e));
      }

      return result;
    };

    next();
  };
}

export async function writeAudit(params: {
  userId?: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  previousValue?: object;
  newValue?: object;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({ data: params });
  } catch (e) {
    logger.error('Audit log write failed', e);
  }
}
