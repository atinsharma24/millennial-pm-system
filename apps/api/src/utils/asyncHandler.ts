/**
 * @file utils/asyncHandler.ts
 * @description Express async route handler wrapper.
 *
 * ## Problem it solves
 *
 * In **Express 4**, an exception thrown inside an `async (req, res) => {}` route handler
 * does NOT automatically reach the error-handling middleware.  Instead it becomes an
 * unhandled promise rejection, which:
 *   - Crashes the process in Node 15+ (UnhandledPromiseRejection)
 *   - Hangs the request (no response) in older Node versions
 *
 * Express 5 fixes this natively, but we are on Express 4.
 *
 * ## Solution
 *
 * Wrap every async route handler with `asyncHandler()`.  It returns a regular
 * (non-async) function that catches any rejection and forwards it to Express's
 * `next(err)` so the centralized error handler in `index.ts` can return a clean `500`.
 *
 * ## Usage
 *
 * ```ts
 * import { asyncHandler } from '../utils/asyncHandler';
 *
 * router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
 *   const data = await prisma.something.findMany();
 *   return ok(res, data);
 * }));
 * ```
 *
 * Without this wrapper a Prisma connection error (transient DB outage on Render's free
 * tier, etc.) would crash the handler silently.  With it, Express catches the error and
 * returns `{ success: false, message: "Internal server error" }` with a 500 status.
 *
 * @module asyncHandler
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler so any rejected promise is forwarded
 * to the Express error-handling middleware via `next(err)`.
 *
 * @param fn - An async Express request handler function
 * @returns  A regular (non-async) Express RequestHandler safe for Express 4
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
