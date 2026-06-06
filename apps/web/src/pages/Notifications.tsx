/**
 * @file pages/Notifications.tsx
 * @description Full-page notification centre.
 *
 * ## Purpose
 *
 * The bell dropdown in the top-bar shows only 15 recent unread notifications.
 * This page shows the **full paginated history** — both read and unread — so
 * the user can scroll back and see all past reminders and alerts.
 *
 * ## Features
 *
 * - **Tab switcher** — "Unread" tab (default) and "All" tab so you can
 *   browse the full history without noise.
 *
 * - **Type filter** — filter by notification type (48h / 24h / 12h / 1h / Overdue)
 *   to quickly find what you're looking for.
 *
 * - **Per-row mark read** — each unread row has a "Mark read" button.
 *
 * - **Bulk "Mark all read"** — a single button in the header wipes the badge
 *   and marks everything in the DB.
 *
 * - **Pagination** — "Load more" button appends the next page (cursor-based
 *   via page index).  We chose "Load more" instead of numbered pages because
 *   notification lists are consumed linearly.
 *
 * - **Task link** — if the notification is tied to a task, a clickable link
 *   navigates directly to the task detail page.
 *
 * ## Data fetching
 *
 * Uses the `useNotifications` React Query hook which calls:
 * - `GET /api/notifications?limit=20` (all)
 * - `GET /api/notifications?unread=true&limit=20` (unread tab)
 *
 * React Query caches results per param set, so switching tabs is instant on
 * the second visit.
 *
 * ## API endpoints used
 *
 * | Method | Path                              | Purpose                   |
 * |--------|-----------------------------------|---------------------------|
 * | GET    | /api/notifications                | List notifications         |
 * | PATCH  | /api/notifications/:id/read       | Mark one as read           |
 * | PATCH  | /api/notifications/read-all       | Mark all as read           |
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';
import { useNotifications, useMarkRead, useMarkAllRead } from '../api/hooks';
import type { Notification, NotificationType } from '../types';
import Spinner from '../components/Spinner';

// ─── Notification type config ─────────────────────────────────────────────────

/**
 * Visual metadata for each notification type.
 * Shared with `NotificationBell.tsx` conceptually but defined locally to keep
 * the two files independently deployable.
 */
const TYPE_META: Record<
  NotificationType,
  { label: string; icon: string; chipBg: string; chipText: string }
> = {
  DEADLINE_48H: { label: '48h Reminder', icon: '🕐', chipBg: 'bg-yellow-100', chipText: 'text-yellow-800' },
  DEADLINE_24H: { label: '24h Reminder', icon: '⏰', chipBg: 'bg-orange-100', chipText: 'text-orange-800' },
  DEADLINE_12H: { label: '12h Warning',  icon: '⚡', chipBg: 'bg-red-100',    chipText: 'text-red-700'   },
  DEADLINE_1H:  { label: '1h Warning',   icon: '🚨', chipBg: 'bg-red-200',    chipText: 'text-red-800'   },
  OVERDUE:      { label: 'Overdue',      icon: '🔴', chipBg: 'bg-red-100',    chipText: 'text-red-800'   },
};

// ─── Filter options ───────────────────────────────────────────────────────────

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: '',             label: 'All types'   },
  { value: 'DEADLINE_48H', label: '48h Reminder' },
  { value: 'DEADLINE_24H', label: '24h Reminder' },
  { value: 'DEADLINE_12H', label: '12h Warning'  },
  { value: 'DEADLINE_1H',  label: '1h Warning'   },
  { value: 'OVERDUE',      label: 'Overdue'       },
];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Full notification history page.
 * Accessible from the bell dropdown's "View all →" link.
 */
export default function Notifications() {
  // ── State ────────────────────────────────────────────────────────────────
  /** 'unread' shows only unread; 'all' shows everything */
  const [tab,        setTab]        = useState<'unread' | 'all'>('unread');
  const [typeFilter, setTypeFilter] = useState('');
  const [page,       setPage]       = useState(1);

  const markRead = useMarkRead();
  const markAll  = useMarkAllRead();

  // ── Data fetching ─────────────────────────────────────────────────────────

  /**
   * Build params for the notifications API call.
   * `unread=true` filters to only unread rows (used in the Unread tab).
   * `limit=20` with a `page` param gives us simple offset pagination.
   */
  const params: Record<string, string> = {
    limit: '20',
    page:  String(page),
    ...(tab === 'unread'   && { unread: 'true' }),
    ...(typeFilter          && { type: typeFilter }),
  };

  const { data, isLoading, isFetching } = useNotifications(params);
  const notifications: Notification[] = data?.data         ?? [];
  const totalPages: number             = data?.pagination?.totalPages ?? 1;
  const totalCount: number             = data?.pagination?.total      ?? 0;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleTabChange(newTab: 'unread' | 'all') {
    setTab(newTab);
    setPage(1); // reset to first page on tab switch
  }

  function handleTypeFilter(value: string) {
    setTypeFilter(value);
    setPage(1); // reset to first page on filter change
  }

  function handleMarkAll() {
    markAll.mutate();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl mx-auto">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            All your deadline reminders and overdue alerts in one place.
          </p>
        </div>
        <button
          onClick={handleMarkAll}
          disabled={markAll.isPending}
          className="btn btn-secondary text-sm"
          title="Mark all notifications as read"
        >
          {markAll.isPending ? 'Clearing…' : '✓ Mark all read'}
        </button>
      </div>

      {/* ── Tabs + filters ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        {/* Tab switcher */}
        <div
          className="flex bg-gray-100 rounded-xl p-1 gap-1 w-fit"
          role="tablist"
          aria-label="Notification filter tabs"
        >
          {(['unread', 'all'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => handleTabChange(t)}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all',
                tab === t
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Type filter dropdown */}
        <select
          id="notif-type-filter"
          value={typeFilter}
          onChange={(e) => handleTypeFilter(e.target.value)}
          className="input w-auto text-sm"
          aria-label="Filter by notification type"
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* ── Result count ─────────────────────────────────────────────────── */}
      {!isLoading && (
        <p className="text-xs text-gray-400">
          {totalCount === 0
            ? 'No notifications found.'
            : `Showing ${notifications.length} of ${totalCount} notification${totalCount !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* ── Notification list ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : notifications.length === 0 ? (
        <NotificationsEmptyState tab={tab} />
      ) : (
        <div className="card overflow-hidden">
          <ul role="list" className="divide-y divide-gray-100">
            {notifications.map((notif) => (
              <NotificationPageRow
                key={notif.id}
                notification={notif}
                onMarkRead={(id) => markRead.mutate(id)}
                isPending={markRead.isPending}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn btn-secondary text-sm"
          >
            ← Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
            className="btn btn-secondary text-sm"
          >
            {isFetching ? 'Loading…' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Notification row ─────────────────────────────────────────────────────────

/**
 * A full-width notification row for the page view.
 *
 * Wider than the dropdown's compact row — shows:
 * - Large type icon chip on the left
 * - Message text (full, no truncation)
 * - Task link if applicable
 * - Absolute + relative timestamp
 * - Mark-read button (for unread items only)
 *
 * @param notification - The notification data object
 * @param onMarkRead   - Callback to mark this notification as read
 * @param isPending    - Whether a mark-read mutation is in flight
 */
function NotificationPageRow({
  notification,
  onMarkRead,
  isPending,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  isPending: boolean;
}) {
  const meta = TYPE_META[notification.type] ?? {
    label:    notification.type,
    icon:     '🔔',
    chipBg:   'bg-gray-100',
    chipText: 'text-gray-700',
  };

  return (
    <li
      className={clsx(
        'flex items-start gap-4 px-5 py-4 transition-colors',
        notification.isRead
          ? 'bg-white hover:bg-gray-50/70'
          : 'bg-blue-50/30 hover:bg-blue-50/60 border-l-[3px] border-brand-500'
      )}
    >
      {/* Type icon chip */}
      <span
        className={clsx(
          'shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-lg mt-0.5',
          meta.chipBg
        )}
        aria-hidden="true"
      >
        {meta.icon}
      </span>

      {/* Content block */}
      <div className="flex-1 min-w-0">
        {/* Type label chip */}
        <span className={clsx(
          'inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1',
          meta.chipBg, meta.chipText
        )}>
          {meta.label}
        </span>

        {/* Message */}
        <p className={clsx(
          'text-sm',
          notification.isRead ? 'text-gray-600' : 'text-gray-900 font-medium'
        )}>
          {notification.message}
        </p>

        {/* Task link */}
        {notification.task && (
          <Link
            to={`/tasks/${notification.task.id}`}
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 hover:underline mt-1 font-medium"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            View task: {notification.task.name}
          </Link>
        )}

        {/* Timestamp row */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400">
            {format(new Date(notification.sentAt), 'MMM d, yyyy · h:mm a')}
          </span>
          <span className="text-gray-200 text-xs">•</span>
          <span className="text-xs text-gray-400 italic">
            {formatDistanceToNow(new Date(notification.sentAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Mark-read button */}
      {!notification.isRead && (
        <button
          onClick={() => onMarkRead(notification.id)}
          disabled={isPending}
          title="Mark as read"
          aria-label="Mark this notification as read"
          className={clsx(
            'shrink-0 self-start mt-1 flex items-center gap-1.5',
            'text-xs text-gray-400 hover:text-brand-600 font-medium',
            'hover:bg-brand-50 px-2.5 py-1.5 rounded-lg transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-brand-400'
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Read
        </button>
      )}

      {/* Already-read indicator */}
      {notification.isRead && (
        <span className="shrink-0 self-start mt-1 text-xs text-gray-300 italic">
          Read
        </span>
      )}
    </li>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

/**
 * Shown when the notification list is empty.
 * Shows different copy depending on which tab is active.
 *
 * @param tab - Current active tab ('unread' or 'all')
 */
function NotificationsEmptyState({ tab }: { tab: 'unread' | 'all' }) {
  if (tab === 'unread') {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-semibold text-gray-700">You're all caught up!</p>
        <p className="text-sm text-gray-400 mt-1">No unread notifications. Great work!</p>
        <button
          onClick={() => {}}
          className="mt-4 text-xs text-brand-600 hover:underline"
        >
          View notification history →
        </button>
      </div>
    );
  }

  return (
    <div className="card flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
      <p className="font-semibold text-gray-700">No notifications yet</p>
      <p className="text-sm text-gray-400 mt-1">
        Deadline reminders will appear here when tasks are due soon.
      </p>
    </div>
  );
}
