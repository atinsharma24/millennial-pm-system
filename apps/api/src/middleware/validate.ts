import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { badRequest } from '../utils/response';

export function validate(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation error', errors.array());
  }
  next();
}
