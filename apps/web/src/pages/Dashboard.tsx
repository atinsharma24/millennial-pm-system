import { useAuthStore } from '../context/AuthStore';
import { useDashboard } from '../api/hooks';
import Spinner from '../components/Spinner';
import { Link } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: number | string;
  color?: string;
  to?: string;
}

function StatCard({ label, value, color = 'bg-brand-50 text-brand-700', to }: StatCardProps) {
  const content = (
    <div className={`card p-5 ${to ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value ?? '—'}</p>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const { data, isLoading } = useDashboard();

  if (isLoading) return (
    <div className="flex justify-center mt-16">
      <Spinner size="lg" />
    </div>
  );

  const role = user?.role;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.name}</p>
      </div>

      {role === 'ADMIN' && data && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard label="Total Projects" value={data.totalProjects} to="/projects" />
          <StatCard label="Total Tasks" value={data.totalTasks} to="/tasks" />
          <StatCard label="Active Employees" value={data.activeEmployees} to="/users" />
          <StatCard label="Overdue Tasks" value={data.overdueTasks} color="text-red-600" />
          <StatCard label="Completed Tasks" value={data.completedTasks} color="text-green-600" />
        </div>
      )}

      {role === 'PROJECT_MANAGER' && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Managed Projects" value={data.managedProjects} to="/projects" />
          <StatCard label="Active Tasks" value={data.activeTasks} to="/tasks" />
          <StatCard label="Due This Week" value={data.upcomingDeadlines} color="text-orange-600" />
        </div>
      )}

      {role === 'EMPLOYEE' && (
        <div className="card p-6">
          <p className="text-gray-500">Head to <Link className="text-brand-600 hover:underline" to="/tasks">My Tasks</Link> to see your assignments and submit work logs.</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Quick Links</h2>
          <ul className="space-y-2 text-sm">
            <li><Link to="/projects" className="text-brand-600 hover:underline">→ View all projects</Link></li>
            <li><Link to="/tasks" className="text-brand-600 hover:underline">→ View all tasks</Link></li>
            {(role === 'ADMIN' || role === 'PROJECT_MANAGER') && (
              <li><Link to="/reports" className="text-brand-600 hover:underline">→ Reports & Analytics</Link></li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
