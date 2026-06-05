/**
 * @file socket.ts
 * @description Singleton wrapper for the Socket.IO server instance.
 *
 * We can't import `io` directly from `index.ts` inside route files because that
 * creates a circular dependency (index → routes → index).  Instead, `index.ts`
 * calls {@link setIo} once at startup, and every module that needs to push
 * real-time events calls {@link emitToUser} or {@link emitBroadcast}.
 */

import type { Server } from 'socket.io';

let _io: Server | null = null;

/**
 * Register the Socket.IO server instance.
 * Called once in `src/index.ts` immediately after `new Server(httpServer, …)`.
 */
export function setIo(io: Server): void {
  _io = io;
}

/**
 * Emit an event to a **single user's** private room (`user:<userId>`).
 * Silently no-ops if the socket server hasn't been initialised yet (e.g. tests).
 *
 * @param userId   - Recipient's database user ID
 * @param event    - Socket event name (e.g. `"notification:new"`)
 * @param payload  - Arbitrary JSON-serialisable data
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  _io?.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit an event to **all connected clients** — useful for admin-wide broadcasts.
 *
 * @param event   - Socket event name
 * @param payload - Arbitrary JSON-serialisable data
 */
export function emitBroadcast(event: string, payload: unknown): void {
  _io?.emit(event, payload);
}
