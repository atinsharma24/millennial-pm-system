import { useParams, Link } from 'react-router-dom';
import { useProject, useUpdateProject } from '../api/hooks';
import { ProjectStatusBadge, TaskStatusBadge, PriorityBadge } from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { useAuthStore } from '../context/AuthStore';
import { format } from 'date-fns';
import { useState } from 'react';
import type { ProjectStatus } from '../types';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id!);
  const { user } = useAuthStore();
  const updateProject = useUpdateProject(id!);
  const [editStatus, setEditStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<ProjectStatus>('ACTIVE');

  if (isLoading) return <div className="flex justify-center mt-16"><Spinner size="lg" /></div>;
  if (!project) return <div className="card p-6 text-gray-500">Project not found.</div>;

  const canEdit = user?.role === 'ADMIN' || (user?.role === 'PROJECT_MANAGER' && project.managerId === user.id);

  async function handleStatusUpdate() {
    await updateProject.mutateAsync({ status: newStatus });
    setEditStatus(false);
  }

  const tasks = project.tasks || [];
  const completed = tasks.filter((t: { status: string }) => t.status === 'COMPLETED').length;

  return (
    <div>
      <div className="mb-2 text-sm text-gray-500">
        <Link to="/projects" className="hover:underline">Projects</Link> / {project.name}
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500 text-sm mt-1">{project.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <ProjectStatusBadge status={project.status} />
          {canEdit && (
            <button onClick={() => { setNewStatus(project.status); setEditStatus(!editStatus); }} className="btn-secondary text-xs">
              Change Status
            </button>
          )}
        </div>
      </div>

      {editStatus && (
        <div className="card p-4 mb-4 flex gap-3 items-center">
          <select className="input w-44" value={newStatus} onChange={(e) => setNewStatus(e.target.value as ProjectStatus)}>
            {['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={handleStatusUpdate} className="btn-primary text-sm" disabled={updateProject.isPending}>Save</button>
          <button onClick={() => setEditStatus(false)} className="btn-secondary text-sm">Cancel</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Manager', value: project.manager?.name },
          { label: 'Start Date', value: format(new Date(project.startDate), 'MMM d, yyyy') },
          { label: 'End Date', value: format(new Date(project.endDate), 'MMM d, yyyy') },
          { label: 'Completion', value: `${project.completionPct ?? 0}%` },
        ].map((item) => (
          <div key={item.label} className="card p-4">
            <p className="text-xs text-gray-400">{item.label}</p>
            <p className="font-semibold text-gray-900 mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card p-4 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span>Task Progress</span>
          <span className="text-gray-500">{completed} / {tasks.length} completed</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${project.completionPct ?? 0}%` }}
          />
        </div>
      </div>

      {/* Tasks table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Tasks ({tasks.length})</h2>
          {canEdit && (
            <Link to={`/tasks?projectId=${id}`} className="btn-secondary text-sm">View all</Link>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="p-6 text-center text-gray-500">No tasks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Task', 'Status', 'Priority', 'Deadline', 'Assignees'].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-gray-500 font-medium text-xs uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task: {
                  id: string; name: string; status: string; priority: string; deadline: string;
                  assignments: Array<{ user: { name: string } }>;
                }) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/tasks/${task.id}`} className="font-medium text-brand-600 hover:underline">{task.name}</Link>
                    </td>
                    <td className="px-4 py-3"><TaskStatusBadge status={task.status as never} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={task.priority as never} /></td>
                    <td className="px-4 py-3 text-gray-500">{format(new Date(task.deadline), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3 text-gray-500">{task.assignments.map((a) => a.user.name).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
