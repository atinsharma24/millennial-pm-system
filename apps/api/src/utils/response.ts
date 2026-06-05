import { Response } from 'express';
import { ApiResponse } from '../types';

export function ok<T>(res: Response, data: T, message?: string) {
  return res.json({ success: true, data, message } as ApiResponse<T>);
}

export function created<T>(res: Response, data: T, message?: string) {
  return res.status(201).json({ success: true, data, message } as ApiResponse<T>);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function badRequest(res: Response, message: string, errors?: unknown[]) {
  return res.status(400).json({ success: false, message, errors } as ApiResponse);
}

export function unauthorized(res: Response, message = 'Unauthorized') {
  return res.status(401).json({ success: false, message } as ApiResponse);
}

export function forbidden(res: Response, message = 'Forbidden') {
  return res.status(403).json({ success: false, message } as ApiResponse);
}

export function notFound(res: Response, message = 'Not found') {
  return res.status(404).json({ success: false, message } as ApiResponse);
}

export function conflict(res: Response, message: string) {
  return res.status(409).json({ success: false, message } as ApiResponse);
}

export function serverError(res: Response, message = 'Internal server error') {
  return res.status(500).json({ success: false, message } as ApiResponse);
}

export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return res.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } as ApiResponse<T[]>);
}
