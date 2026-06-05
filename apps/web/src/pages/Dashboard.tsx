/**
 * @file pages/Dashboard.tsx
 * @description Role-aware home dashboard.
 *
 * Renders a different stat layout depending on the logged-in user's role:
 * - **Admin**: global totals (projects, tasks, employees, overdue, completed) + recent projects
 * - **Project Manager**: scoped to managed projects; active tasks, upcoming deadlines, overdue
 * - **Employee**: personal stats (assigned, due-soon, completed, hours logged) + recent work logs
 *
 * All data comes from `GET /api/reports/dashboard` which returns role-scoped JSON.
 */

import { Link } from 'react-router-dom';
import { useAuthStore } from '../context/AuthStore';
import { useDashboard } from '../api/hooks';
import Spinner from '../components/Spinner';
import { ProjectStatusBadge } from '../components/StatusBadge';
import { format, formatDistanceToNow } from 'date-fns';
import type { ProjectStatus } from '../types';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = 'text-brand-700', to,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  to?: string;
}) {
  const inner = (
    <div className={`card p-5 ${to ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuthStore();
  const { data, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex justify-center mt-16">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Welcome back, {user?.name} — {format(new Date(), 'EEEE, MMMM d yyyy')}
        </p>
      </div>

      {/* ── Admin ───────────────────────────────────────────────────────────── */}
      {user?.role === 'ADMIN' && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard label="Total Projects"    value={data.totalProjects}    to="/projects"  />
            <StatCard label="Total Tasks"       value={data.totalTasks}       to="/tasks"     />
            <StatCard label="Active Employees"  value={data.activeEmployees}  to="/users"     />
            <StatCard label="Overdue Tasks"     value={data.overdueTasks}     color="text-red-600" />
            <StatCard label="Completed Tasks"   value={data.completedTasks}   color="text-green-600" />
          </div>

          {data.recentProjects?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Recent Projects</h2>
                <Link to="/projects" className="text-xs text-brand-600 hover:underline">View all →</Link>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Project', 'Manager', 'Status', 'Tasks'].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 uppercase font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.recentProjects.map((p: { id: string; name: string; status: ProjectStatus; manager: { name: string }; _count: { tasks: number } }) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link to={`/projects/${p.id}`} className="text-brand-600 hover:underline font-medium">{p.name}</Link>
                      </td>
                      <td className="px-4 py-2 text-gray-500">{p.manager.name}</td>
                      <td className="px-4 py-2"><ProjectStatusBadge status={p.status} /></td>
                      <td className="px-4 py-2 text-gray-500">{p._count.tasks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Project Manager ─────────────────────────────────────────────────── */}
      {user?.role === 'PROJECT_MANAGER' && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Managed Projects"   value={data.managedProjects}   to="/projects"  />
            <StatCard label="Active Tasks"        value={data.activeTasks}        to="/tasks"     />
            <StatCard label="Due This Week"       value={data.upcomingDeadlines}  color="text-orange-600" />
            <StatCard label="Overdue"             value={data.overdueTasks}       color="text-red-600" />
          </div>

          {data.recentTasks?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Upcoming Deadlines</h2>
                <Link to="/tasks" className="text-xs text-brand-600 hover:underline">All tasks →</Link>
              </div>
              <div className="divide-y">
                {data.recentTasks.map((t: { id: string; name: string; deadline: string; assignments: Array<{ user: { name: string } }> }) => (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                    <Link to={`/tasks/${t.id}`} className="text-sm text-brand-600 hover:underline font-medium">{t.name}</Link>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{format(new Date(t.deadline), 'MMM d, yyyy')}</p>
                      <p className="text-xs text-gray-400">{t.assignments.map((a) => a.user.name).join(', ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Employee ────────────────────────────────────────────────────────── */}
      {user?.role === 'EMPLOYEE' && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Assigned Tasks"    value={data.assignedTasks}      to="/tasks"          />
            <StatCard label="Due in 48 h"       value={data.dueSoon}            color="text-orange-600" />
            <StatCard label="Completed"         value={data.completedTasks}     color="text-green-600" />
            <StatCard label="Hours Logged"      value={`${data.totalHoursLogged}h`} color="text-brand-700" />
          </div>

          {data.recentLogs?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Recent Work Logs</h2>
                <Link to="/worklogs" className="text-xs text-brand-600 hover:underline">All logs →</Link>
              </div>
              <div className="divide-y">
                {data.recentLogs.map((log: { id: string; description: string; hoursWorked: number; createdAt: string; task: { name: string; project: { name: string } } }) => (
                  <div key={log.id} className="px-4 py-3">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-gray-800 line-clamp-1">{log.description}</p>
                      <span className="text-xs bg-brand-100 text-brand-700 rounded px-1.5 py-0.5 ml-2 shrink-0">
                        {log.hoursWorked}h
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {log.task.project.name} / {log.task.name} ·{' '}
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
