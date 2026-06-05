/**
 * @file components/Layout.tsx
 * @description Authenticated shell layout.
 *
 * Renders the sidebar navigation and top bar.  The navigation links shown
 * depend on the logged-in user's role so employees never see admin pages.
 *
 * Wraps children with `<SocketProvider>` (real-time events) and
 * `<ToastProvider>` (transient in-app messages).
 */

import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/AuthStore';
import { useNotifications, useMarkAllRead } from '../api/hooks';
import { ToastProvider } from '../context/ToastContext';
import { SocketProvider, useSocket } from '../context/SocketContext';
import clsx from 'clsx';
import api from '../api/client';
import { formatDistanceToNow } from 'date-fns';

// ─── Navigation config ────────────────────────────────────────────────────────

const NAV_ITEMS = {
  ADMIN: [
    { to: '/dashboard', label: 'Dashboard',  icon: '▦' },
    { to: '/projects',  label: 'Projects',   icon: '◫' },
    { to: '/tasks',     label: 'Tasks',      icon: '☑' },
    { to: '/kanban',    label: 'Kanban',     icon: '⊞' },
    { to: '/users',     label: 'Users',      icon: '👤' },
    { to: '/reports',   label: 'Reports',    icon: '📊' },
    { to: '/audit',     label: 'Audit Log',  icon: '🔍' },
  ],
  PROJECT_MANAGER: [
    { to: '/dashboard', label: 'Dashboard',  icon: '▦' },
    { to: '/projects',  label: 'Projects',   icon: '◫' },
    { to: '/tasks',     label: 'Tasks',      icon: '☑' },
    { to: '/kanban',    label: 'Kanban',     icon: '⊞' },
    { to: '/worklogs',  label: 'Work Logs',  icon: '📋' },
    { to: '/reports',   label: 'Reports',    icon: '📊' },
  ],
  EMPLOYEE: [
    { to: '/dashboard', label: 'Dashboard',  icon: '▦' },
    { to: '/tasks',     label: 'My Tasks',   icon: '☑' },
    { to: '/kanban',    label: 'Kanban',     icon: '⊞' },
    { to: '/worklogs',  label: 'My Logs',    icon: '📋' },
  ],
};

// ─── Layout root ─────────────────────────────────────────────────────────────

/**
 * Wraps authenticated pages with the sidebar + topbar shell.
 * Also wraps with `ToastProvider` and `SocketProvider`.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <SocketProvider>
        <LayoutInner>{children}</LayoutInner>
      </SocketProvider>
    </ToastProvider>
  );
}

// ─── Inner layout (needs socket context) ─────────────────────────────────────

function LayoutInner({ children }: { children: ReactNode }) {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const { unreadCount, clearUnread } = useSocket();
  const [showNotifs, setShowNotifs] = useState(false);
  const markAll = useMarkAllRead();

  const { data: notifsData } = useNotifications({ unread: 'true', limit: '15' });
  const notifs = notifsData?.data ?? [];

  async function logout() {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    navigate('/login');
  }

  function openBell() {
    setShowNotifs((v) => !v);
    clearUnread();
  }

  const links = NAV_ITEMS[user?.role || 'EMPLOYEE'];

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-56 bg-brand-900 text-white flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-brand-700">
          <div className="text-lg font-bold tracking-tight">Millennial PM</div>
          <div className="text-xs text-brand-200 mt-0.5">{user?.role?.replace('_', ' ')}</div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-700 text-white'
                    : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                )
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-brand-700">
          <p className="text-xs text-brand-300 truncate mb-1">{user?.name}</p>
          <p className="text-xs text-brand-400 truncate mb-2">{user?.email}</p>
          <button
            onClick={logout}
            className="text-xs text-brand-300 hover:text-white transition-colors"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-end gap-3 sticky top-0 z-10">
          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={openBell}
              className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {showNotifs && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowNotifs(false)}
                />
                <div className="absolute right-0 top-11 w-80 card shadow-xl z-50 max-h-96 overflow-y-auto">
                  <div className="p-3 border-b flex justify-between items-center">
                    <span className="font-semibold text-sm">Notifications</span>
                    <button
                      onClick={() => { markAll.mutate(); setShowNotifs(false); }}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>

                  {notifs.length === 0 ? (
                    <p className="p-4 text-sm text-gray-400 text-center">All caught up! 🎉</p>
                  ) : (
                    notifs.map((n: { id: string; message: string; type: string; isRead: boolean; sentAt: string }) => (
                      <div
                        key={n.id}
                        className={clsx(
                          'p-3 border-b last:border-0 text-sm',
                          !n.isRead && 'bg-blue-50'
                        )}
                      >
                        <p className="text-gray-800 text-xs leading-snug">{n.message}</p>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-400">{n.type.replace(/_/g, ' ')}</span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(n.sentAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-medium text-gray-700">{user?.name}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
