/**
 * @file components/NotificationBell.tsx
 * @description Self-contained notification bell icon + dropdown panel.
 *
 * ## What this component does
 *
 * 1. **Bell icon in the top-bar** — shows a pulsing red badge with the count
 *    of unread notifications.  The badge disappears once you open the panel.
 *
 * 2. **Dropdown panel** — opens below the bell on click.  Shows up to 15 most
 *    recent unread notifications.  Each notification shows:
 *    - A coloured icon based on notification type (48h = yellow, overdue = red, etc.)
 *    - The message text
 *    - Relative timestamp ("2 minutes ago")
 *    - A "Mark read" tick button on the right
 *
 * 3. **Mark all read** button — calls PATCH /notifications/read-all and clears
 *    the badge.
 *
 * 4. **Click-outside to close** — clicking anywhere outside the dropdown closes it.
 *
 * 5. **Empty state** — when there are no unread notifications, shows a friendly
 *    "All caught up! 🎉" message.
 *
 * ## How real-time works
 *
 * The bell reads `unreadCount` from `SocketContext`.  Every time the server
 * pushes a `notification:new` Socket.IO event the count increments automatically.
 * Opening the bell calls `clearUnread()` which resets the badge to 0.
 *
 * ## Data flow
 *
 * ```
 * Server (BullMQ deadline scan)
 *   ──▶ Socket.IO "notification:new"
 *         ──▶ SocketContext increments unreadCount
 *               ──▶ Bell badge updates
 *
 * User clicks bell
 *   ──▶ clearUnread() resets badge to 0
 *   ──▶ useNotifications() fetches latest 15 unread rows from DB
 *   ──▶ Dropdown renders notification list
 * ```
 *
 * ## Dependencies
 *
 * - `useSocket`        — unreadCount + clearUnread from SocketContext
 * - `useNotifications` — React Query hook → GET /api/notifications
 * - `useMarkRead`      — React Query mutation → PATCH /api/notifications/:id/read
 * - `useMarkAllRead`   — React Query mutation → PATCH /api/notifications/read-all
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { useSocket } from '../context/SocketContext';
import { useNotifications, useMarkRead, useMarkAllRead } from '../api/hooks';
import type { Notification, NotificationType } from '../types';

// ─── Notification type meta ──────────────────────────────────────────────────

/**
 * Visual config for each notification type.
 * Maps the backend `NotificationType` enum to colours and icons used in the UI.
 */
const TYPE_META: Record<
  NotificationType,
  { label: string; icon: string; bg: string; text: string; border: string }
> = {
  DEADLINE_48H: {
    label: '48h reminder',
    icon: '🕐',
    bg:   'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
  },
  DEADLINE_24H: {
    label: '24h reminder',
    icon: '⏰',
    bg:   'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
  },
  DEADLINE_12H: {
    label: '12h reminder',
    icon: '⚡',
    bg:   'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-200',
  },
  DEADLINE_1H: {
    label: '1h warning',
    icon: '🚨',
    bg:   'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
  },
  OVERDUE: {
    label: 'Overdue',
    icon: '🔴',
    bg:   'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-300',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders the notification bell button + dropdown panel.
 *
 * Designed to be dropped into the top-bar `<header>` in `Layout.tsx`.
 * It handles its own open/close state, outside-click detection, and
 * fetches notification data using React Query.
 */
export default function NotificationBell() {
  const { unreadCount, clearUnread } = useSocket();
  const [isOpen, setIsOpen]           = useState(false);
  const panelRef                       = useRef<HTMLDivElement>(null);
  const buttonRef                      = useRef<HTMLButtonElement>(null);

  const markRead    = useMarkRead();
  const markAll     = useMarkAllRead();

  /**
   * Fetch the latest 15 unread notifications.
   * React Query auto-refetches when SocketContext invalidates the 'notifications' key.
   */
  const { data: notifsData, isLoading } = useNotifications({ limit: '15' });
  const notifications: Notification[] = notifsData?.data ?? [];
  const unreadNotifs = notifications.filter((n) => !n.isRead);

  // ── Click-outside to close ────────────────────────────────────────────────

  /**
   * When the panel is open, listen for any click outside both the button and
   * the panel div and close the dropdown.
   *
   * We use `mousedown` (not `click`) so it fires before React's synthetic
   * click event bubbles up.
   */
  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(e: MouseEvent) {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Toggle the dropdown open.
   * When opening, reset the in-memory unread badge (red number) to 0.
   * The DB-persisted `isRead` state is only changed when the user explicitly
   * clicks "Mark read" or "Mark all read".
   */
  function handleBellClick() {
    setIsOpen((v) => !v);
    if (!isOpen) clearUnread(); // clear badge when opening
  }

  /**
   * Mark a single notification as read.
   * The row is updated in the DB via the mutation and React Query invalidates
   * the 'notifications' cache, so the panel re-renders without the item
   * (since we fetch unread-only).
   */
  function handleMarkOne(id: string) {
    markRead.mutate(id);
  }

  /**
   * Mark every notification as read.
   * Closes the panel and invalidates the cache.
   */
  function handleMarkAll() {
    markAll.mutate();
    setIsOpen(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="relative" id="notification-bell-container">
      {/* ── Bell button ───────────────────────────────────────────────────── */}
      <button
        ref={buttonRef}
        id="notification-bell-btn"
        onClick={handleBellClick}
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={clsx(
          'relative p-2 rounded-xl transition-all duration-200',
          'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1',
          isOpen ? 'bg-gray-100 text-brand-600' : 'text-gray-500 hover:text-gray-700'
        )}
      >
        {/* Bell SVG icon */}
        <BellIcon className="w-5 h-5" ringing={unreadCount > 0} />

        {/* Unread badge — only shown when count > 0 */}
        {unreadCount > 0 && (
          <span
            className={clsx(
              'absolute -top-1 -right-1 flex items-center justify-center',
              'min-w-[18px] h-[18px] px-1 rounded-full',
              'bg-red-500 text-white text-[10px] font-bold leading-none',
              'ring-2 ring-white',
              'animate-pulse-once'
            )}
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={panelRef}
          id="notification-panel"
          role="dialog"
          aria-label="Notifications panel"
          className={clsx(
            'absolute right-0 top-12 z-50',
            'w-[360px] max-h-[520px] flex flex-col',
            'bg-white rounded-2xl shadow-2xl border border-gray-100',
            'overflow-hidden',
            'animate-dropdown-in'
          )}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">Notifications</span>
              {unreadNotifs.length > 0 && (
                <span className="bg-brand-100 text-brand-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unreadNotifs.length} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadNotifs.length > 0 && (
                <button
                  onClick={handleMarkAll}
                  disabled={markAll.isPending}
                  className="text-xs text-brand-600 hover:text-brand-800 font-medium hover:underline transition-colors"
                  title="Mark all notifications as read"
                >
                  {markAll.isPending ? 'Clearing…' : 'Mark all read'}
                </button>
              )}
              <Link
                to="/notifications"
                onClick={() => setIsOpen(false)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                title="View all notifications"
              >
                View all →
              </Link>
            </div>
          </div>

          {/* Panel body — scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <LoadingState />
            ) : notifications.length === 0 ? (
              <EmptyState />
            ) : (
              <ul role="list" className="divide-y divide-gray-50">
                {notifications.map((notif) => (
                  <NotificationRow
                    key={notif.id}
                    notification={notif}
                    onMarkRead={handleMarkOne}
                    isPending={markRead.isPending}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * A single notification row in the dropdown list.
 *
 * Shows:
 * - Coloured type icon on the left
 * - Message text + relative timestamp
 * - "Mark read" button that disappears once the item is read
 *
 * Unread rows have a subtle left accent border and lighter background.
 */
function NotificationRow({
  notification,
  onMarkRead,
  isPending,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  isPending: boolean;
}) {
  const meta = TYPE_META[notification.type] ?? {
    label: notification.type,
    icon:  '🔔',
    bg:    'bg-gray-50',
    text:  'text-gray-700',
    border: 'border-gray-200',
  };

  return (
    <li
      className={clsx(
        'flex items-start gap-3 px-4 py-3 transition-colors',
        notification.isRead
          ? 'bg-white hover:bg-gray-50'
          : 'bg-blue-50/40 hover:bg-blue-50/70 border-l-2 border-brand-400'
      )}
    >
      {/* Type icon */}
      <span
        className={clsx(
          'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-base mt-0.5',
          meta.bg,
          meta.border,
          'border'
        )}
        aria-hidden="true"
      >
        {meta.icon}
      </span>

      {/* Message + meta */}
      <div className="flex-1 min-w-0">
        <p className={clsx('text-xs leading-snug', notification.isRead ? 'text-gray-600' : 'text-gray-800 font-medium')}>
          {notification.message}
        </p>
        <div className="flex items-center justify-between mt-1 gap-1">
          <span className={clsx('text-[10px] font-medium uppercase tracking-wide', meta.text)}>
            {meta.label}
          </span>
          <span className="text-[10px] text-gray-400">
            {formatDistanceToNow(new Date(notification.sentAt), { addSuffix: true })}
          </span>
        </div>

        {/* Task link if notification is tied to a task */}
        {notification.task && (
          <Link
            to={`/tasks/${notification.task.id}`}
            className="text-[10px] text-brand-600 hover:underline mt-0.5 block truncate"
          >
            → {notification.task.name}
          </Link>
        )}
      </div>

      {/* Mark-read button — only shows for unread items */}
      {!notification.isRead && (
        <button
          onClick={() => onMarkRead(notification.id)}
          disabled={isPending}
          title="Mark as read"
          aria-label={`Mark "${notification.message.slice(0, 30)}…" as read`}
          className={clsx(
            'shrink-0 w-6 h-6 flex items-center justify-center rounded-full mt-0.5',
            'text-gray-300 hover:text-brand-500 hover:bg-brand-50 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-brand-400'
          )}
        >
          {/* Checkmark icon */}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
    </li>
  );
}

/**
 * Shown when there are no notifications.
 * Gives the user positive feedback that they're up to date.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700">All caught up!</p>
      <p className="text-xs text-gray-400 mt-1">No unread notifications right now.</p>
    </div>
  );
}

/**
 * Shown while notifications are loading from the API.
 * Uses skeleton placeholders to avoid layout shift.
 */
function LoadingState() {
  return (
    <div className="divide-y divide-gray-50">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-2 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bell SVG icon ────────────────────────────────────────────────────────────

/**
 * The bell SVG icon.
 *
 * When `ringing` is true, we add a subtle CSS wiggle animation to hint
 * that there are new notifications waiting.
 *
 * @param className - Tailwind size classes (e.g. "w-5 h-5")
 * @param ringing   - If true, applies the ring animation
 */
function BellIcon({ className, ringing }: { className?: string; ringing?: boolean }) {
  return (
    <svg
      className={clsx(className, ringing && 'animate-bell-ring')}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11
           a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341
           C7.67 6.165 6 8.388 6 11v3.159
           c0 .538-.214 1.055-.595 1.436L4 17h5
           m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
