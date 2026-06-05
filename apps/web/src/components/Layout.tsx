import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/AuthStore';
import { useNotifications, useMarkAllRead } from '../api/hooks';
import clsx from 'clsx';
import api from '../api/client';

const navItems = {
  ADMIN: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/projects', label: 'Projects' },
    { to: '/tasks', label: 'Tasks' },
    { to: '/users', label: 'Users' },
    { to: '/reports', label: 'Reports' },
    { to: '/audit', label: 'Audit Log' },
  ],
  PROJECT_MANAGER: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/projects', label: 'Projects' },
    { to: '/tasks', label: 'Tasks' },
    { to: '/worklogs', label: 'Work Logs' },
    { to: '/reports', label: 'Reports' },
  ],
  EMPLOYEE: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/tasks', label: 'My Tasks' },
    { to: '/worklogs', label: 'My Logs' },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [showNotifs, setShowNotifs] = useState(false);
  const { data: notifsData } = useNotifications({ unread: 'true', limit: '10' });
  const markAll = useMarkAllRead();
  const unreadCount = notifsData?.pagination?.total || 0;
  const notifs = notifsData?.data || [];

  async function logout() {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    navigate('/login');
  }

  const links = navItems[user?.role || 'EMPLOYEE'];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-brand-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-brand-700">
          <div className="text-lg font-bold tracking-tight">Millennial PM</div>
          <div className="text-xs text-brand-100 mt-1">{user?.role?.replace('_', ' ')}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx('block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-700 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-brand-700">
          <div className="text-xs text-brand-300 truncate mb-2">{user?.name}</div>
          <button onClick={logout} className="text-xs text-brand-300 hover:text-white transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-end gap-4">
          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-10 w-80 card shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="p-3 border-b flex justify-between items-center">
                  <span className="font-medium text-sm">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={() => markAll.mutate()} className="text-xs text-brand-600 hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                {notifs.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">All caught up!</p>
                ) : (
                  notifs.map((n: { id: string; message: string; type: string; isRead: boolean }) => (
                    <div key={n.id} className={clsx('p-3 border-b text-sm', !n.isRead && 'bg-blue-50')}>
                      <p className="text-gray-800">{n.message}</p>
                      <span className="text-xs text-gray-400">{n.type.replace(/_/g, ' ')}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <span className="text-sm text-gray-600 font-medium">{user?.name}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
