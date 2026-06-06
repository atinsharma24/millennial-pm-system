/**
 * @file App.tsx
 * @description Root router configuration.
 *
 * Route guards:
 * - `ProtectedRoute`   — requires any authenticated user
 * - `AdminRoute`       — requires ADMIN role
 * - `PMOrAdminRoute`   — requires ADMIN or PROJECT_MANAGER role
 *
 * All authenticated routes render inside `<Layout>` which provides the sidebar,
 * top bar, toast system, and Socket.IO connection.
 *
 * Route table:
 * | Path               | Guard          | Component         |
 * |--------------------|----------------|-------------------|
 * | /login             | Public         | Login             |
 * | /forgot-password   | Public         | ForgotPassword    |
 * | /reset-password    | Public         | ResetPassword     |
 * | /dashboard         | All roles      | Dashboard         |
 * | /projects          | All roles      | Projects          |
 * | /projects/:id      | All roles      | ProjectDetail     |
 * | /tasks             | All roles      | Tasks             |
 * | /tasks/:id         | All roles      | TaskDetail        |
 * | /kanban            | All roles      | Kanban            |
 * | /worklogs          | All roles      | WorkLogs          |
 * | /notifications     | All roles      | Notifications     |
 * | /users             | Admin only     | Users             |
 * | /audit             | Admin only     | AuditLog          |
 * | /reports           | Admin + PM     | Reports           |
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './context/AuthStore';
import Layout from './components/Layout';

// Pages
import Login          from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import Dashboard      from './pages/Dashboard';
import Projects       from './pages/Projects';
import ProjectDetail  from './pages/ProjectDetail';
import Tasks          from './pages/Tasks';
import TaskDetail     from './pages/TaskDetail';
import Kanban         from './pages/Kanban';
import WorkLogs       from './pages/WorkLogs';
import Users          from './pages/Users';
import Reports        from './pages/Reports';
import AuditLog       from './pages/AuditLog';
import Notifications  from './pages/Notifications';

// ─── Guards ───────────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

function PMOrAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'EMPLOYEE') return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default function App() {
  const { user } = useAuthStore();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login"           element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />

      {/* Authenticated — all roles */}
      <Route path="/dashboard"       element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/projects"        element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/projects/:id"    element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/tasks"           element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/tasks/:id"       element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
      <Route path="/kanban"          element={<ProtectedRoute><Kanban /></ProtectedRoute>} />
      <Route path="/worklogs"        element={<ProtectedRoute><WorkLogs /></ProtectedRoute>} />
      {/*
       * Notifications page — available to ALL authenticated roles.
       * Employees see their own deadline reminders.
       * PMs and Admins also see overdue alerts for their projects.
       */}
      <Route path="/notifications"   element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

      {/* Admin only */}
      <Route path="/users"   element={<AdminRoute><Users /></AdminRoute>} />
      <Route path="/audit"   element={<AdminRoute><AuditLog /></AdminRoute>} />

      {/* Admin + PM */}
      <Route path="/reports" element={<PMOrAdminRoute><Reports /></PMOrAdminRoute>} />

      {/* Fallbacks */}
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
