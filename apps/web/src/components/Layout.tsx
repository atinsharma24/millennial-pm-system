/**
 * @file components/Layout.tsx
 * @description Authenticated shell layout.
 *
 * Renders the sidebar navigation and top bar. The navigation links shown
 * depend on the logged-in user's role, so employees never see admin pages.
 *
 * ## Provider tree
 *
 * ```
 * <ToastProvider>      ← enables toast({ message }) anywhere in the subtree
 *   <SocketProvider>   ← opens Socket.IO connection; provides unreadCount
 *     <LayoutInner>    ← sidebar + topbar + page content
 * ```
 *
 * `LayoutInner` is kept separate from `Layout` so it can safely call
 * `useSocket()`, which requires `<SocketProvider>` to already be an ancestor.
 *
 * ## Navigation config
 *
 * `NAV_ITEMS` maps each role to an ordered list of sidebar links.
 * Adding a new page is as simple as appending an entry here.
 *
 * | Role            | Pages visible                                    |
 * |-----------------|--------------------------------------------------|
 * | ADMIN           | All pages including Users, Audit Log             |
 * | PROJECT_MANAGER | Dashboard, Projects, Tasks, Kanban, Logs, Reports|
 * | EMPLOYEE        | Dashboard, My Tasks, Kanban, My Logs             |
 *
 * ## Top bar
 *
 * Contains the `<NotificationBell>` component (self-contained dropdown panel)
 * and the logged-in user's display name.
 *
 * See: src/components/NotificationBell.tsx
 */

import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/AuthStore';
import { ToastProvider } from '../context/ToastContext';
import { SocketProvider } from '../context/SocketContext';
import NotificationBell from './NotificationBell';
import clsx from 'clsx';
import api from '../api/client';

// ─── Navigation config ────────────────────────────────────────────────────────

/**
 * Sidebar navigation items per role.
 *
 * Each entry has:
 * - `to`    — react-router path (must match a <Route> in App.tsx)
 * - `label` — display text
 * - `icon`  — Unicode glyph or emoji shown beside the label
 */
const NAV_ITEMS = {
  ADMIN: [
    { to: '/dashboard',      label: 'Dashboard',      icon: '▦'  },
    { to: '/projects',       label: 'Projects',       icon: '◫'  },
    { to: '/tasks',          label: 'Tasks',          icon: '☑'  },
    { to: '/kanban',         label: 'Kanban',         icon: '⊞'  },
    { to: '/users',          label: 'Users',          icon: '👤' },
    { to: '/reports',        label: 'Reports',        icon: '📊' },
    { to: '/audit',          label: 'Audit Log',      icon: '🔍' },
    { to: '/notifications',  label: 'Notifications',  icon: '🔔' },
  ],
  PROJECT_MANAGER: [
    { to: '/dashboard',      label: 'Dashboard',      icon: '▦'  },
    { to: '/projects',       label: 'Projects',       icon: '◫'  },
    { to: '/tasks',          label: 'Tasks',          icon: '☑'  },
    { to: '/kanban',         label: 'Kanban',         icon: '⊞'  },
    { to: '/worklogs',       label: 'Work Logs',      icon: '📋' },
    { to: '/reports',        label: 'Reports',        icon: '📊' },
    { to: '/notifications',  label: 'Notifications',  icon: '🔔' },
  ],
  EMPLOYEE: [
    { to: '/dashboard',      label: 'Dashboard',      icon: '▦'  },
    { to: '/tasks',          label: 'My Tasks',       icon: '☑'  },
    { to: '/kanban',         label: 'Kanban',         icon: '⊞'  },
    { to: '/worklogs',       label: 'My Logs',        icon: '📋' },
    { to: '/notifications',  label: 'Notifications',  icon: '🔔' },
  ],
};

// ─── Layout root ─────────────────────────────────────────────────────────────

/**
 * Public surface of the layout.
 * Wraps authenticated pages with the sidebar + top-bar shell.
 *
 * All children receive access to:
 * - Toast system (via `useToast()`)
 * - Socket.IO real-time events (via `useSocket()`)
 *
 * @param children - The page component rendered in the main content area
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

/**
 * Inner layout component that lives inside the provider tree.
 *
 * Kept as a separate function (not inlined into `Layout`) so that it can
 * safely call `useSocket()` — which requires `<SocketProvider>` to already
 * be mounted as an ancestor in the React tree.
 *
 * Renders:
 * 1. Sidebar with role-filtered navigation links and sign-out button
 * 2. Top bar with NotificationBell and user's name
 * 3. `<main>` content area that receives `children`
 */
function LayoutInner({ children }: { children: ReactNode }) {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  /**
   * Log out the current user.
   *
   * 1. POST /api/auth/logout — invalidates the refresh token in the DB
   *    (swallowed if network is unavailable)
   * 2. `clearAuth()` — wipes accessToken, refreshToken, and user from Zustand
   *    persisted store (localStorage)
   * 3. Redirect to /login
   */
  async function logout() {
    try { await api.post('/auth/logout'); } catch { /* intentionally swallowed */ }
    clearAuth();
    navigate('/login');
  }

  // Pick the correct nav items for this user's role (default to EMPLOYEE if unknown)
  const links = NAV_ITEMS[user?.role || 'EMPLOYEE'];

  return (
    <div className="min-h-screen flex">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      {/*
       * Fixed-width dark sidebar.
       * sticky + h-screen keeps it in view while the main content scrolls.
       */}
      <aside className="w-56 bg-brand-900 text-white flex flex-col shrink-0 sticky top-0 h-screen">

        {/* App name + role label */}
        <div className="p-4 border-b border-brand-700">
          <div className="text-lg font-bold tracking-tight">Millennial PM</div>
          <div className="text-xs text-brand-200 mt-0.5">
            {user?.role?.replace('_', ' ')}
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
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
              <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info + sign-out */}
        <div className="p-3 border-t border-brand-700">
          <p className="text-xs text-brand-300 truncate mb-0.5" title={user?.name}>{user?.name}</p>
          <p className="text-xs text-brand-400 truncate mb-2" title={user?.email}>{user?.email}</p>
          <button
            onClick={logout}
            className="text-xs text-brand-300 hover:text-white transition-colors focus:outline-none"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/*
         * Top bar — sticky so it stays visible as page content scrolls.
         * z-10 ensures it sits above all page content but below modals (z-50).
         *
         * Contents (right-aligned):
         * 1. <NotificationBell> — self-contained bell icon + dropdown panel
         * 2. Vertical divider
         * 3. User's display name
         */}
        <header
          className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-end gap-3 sticky top-0 z-10"
          role="banner"
        >
          {/*
           * NotificationBell
           *
           * Self-contained component. Internally it:
           *   1. Reads `unreadCount` from SocketContext (incremented in real-time)
           *   2. Fetches the latest 15 notifications via React Query on open
           *   3. Handles mark-read and mark-all-read mutations
           *   4. Provides a "View all →" link to /notifications
           *
           * Source: src/components/NotificationBell.tsx
           */}
          <NotificationBell />

          {/* Visual separator */}
          <div className="h-5 w-px bg-gray-200" aria-hidden="true" />

          {/* Logged-in user's name */}
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
