/**
 * @file context/SocketContext.tsx
 * @description Socket.IO client context for real-time event delivery.
 *
 * On mount (when the user is authenticated) this context:
 *   1. Creates a Socket.IO connection to the API server.
 *   2. Emits `join` with the user's ID so the server places them in a private room.
 *   3. Listens for `notification:new`, `task:updated`, `task:assigned`,
 *      `worklog:new`, and `worklog:reply` events.
 *   4. Surfaces the unread notification count so the Layout bell badge stays live.
 *
 * The socket is disconnected when the user logs out or the component unmounts.
 *
 * Usage:
 * ```tsx
 * const { unreadCount } = useSocket();
 * ```
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './AuthStore';
import { useToast } from './ToastContext';
import { useQueryClient } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocketContextValue {
  /** Current unread notification count (increments on `notification:new`). */
  unreadCount: number;
  /** Reset the badge — called when the bell dropdown is opened. */
  clearUnread: () => void;
}

const SocketContext = createContext<SocketContextValue>({ unreadCount: 0, clearUnread: () => {} });

// ─── Provider ─────────────────────────────────────────────────────────────────

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000/api';
// Strip trailing /api to get the socket server root
const SOCKET_URL = API_URL.replace(/\/api$/, '');

/**
 * Wrap `<Layout>` (or the whole app) with this provider.
 * Only opens a socket connection when `user` is truthy in the auth store.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Join the private user room immediately
      socket.emit('join', user.id);
    });

    /** A new in-app notification arrived (deadline reminder or overdue alert). */
    socket.on('notification:new', (data: { message: string }) => {
      setUnreadCount((n) => n + 1);
      toast({ message: data.message, type: 'warning', duration: 6000 });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });

    /** A task's status was changed by another user. */
    socket.on('task:updated', () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    });

    /** You were assigned to a new task. */
    socket.on('task:assigned', (data: { taskName: string; projectName: string }) => {
      setUnreadCount((n) => n + 1);
      toast({ message: `You were assigned to "${data.taskName}" in ${data.projectName}`, type: 'info' });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    });

    /** A new work log was submitted on one of your project's tasks (PM). */
    socket.on('worklog:new', (data: { taskName: string; submittedBy: string }) => {
      toast({ message: `New work log on "${data.taskName}" by ${data.submittedBy}`, type: 'info' });
      qc.invalidateQueries({ queryKey: ['worklogs'] });
    });

    /** A reply was posted on your work log. */
    socket.on('worklog:reply', (data: { taskName: string; repliedBy: string }) => {
      setUnreadCount((n) => n + 1);
      toast({ message: `${data.repliedBy} replied to your log on "${data.taskName}"`, type: 'info' });
      qc.invalidateQueries({ queryKey: ['worklogs'] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]); // reconnect only if user ID changes

  return (
    <SocketContext.Provider value={{ unreadCount, clearUnread: () => setUnreadCount(0) }}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Access live unread count and `clearUnread()` for the notification bell.
 */
export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
