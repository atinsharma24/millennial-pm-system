import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTasks, useCreateTask, useProjects, useUsers } from '../api/hooks';
import { TaskStatusBadge, PriorityBadge } from '../components/StatusBadge';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { useAuthStore } from '../context/AuthStore';
import { format, isPast } from 'date-fns';
import clsx from 'clsx';
import type { TaskPriority, TaskStatus } from '../types';

export default function Tasks() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const projectId = searchParams.get('projectId') || '';

  const { data, isLoading } = useTasks({
    ...(statusFilter && { status: statusFilter }),
    ...(priorityFilter && { priority: priorityFilter }),
    ...(search && { search }),
    ...(projectId && { projectId }),
  });

  const tasks = data?.data || [];
  const canCreate = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{user?.role === 'EMPLOYEE' ? 'My Tasks' : 'Tasks'}</h1>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">+ New Task</button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          className="input w-52"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select className="input w-36" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All priorities</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center mt-10"><Spinner size="lg" /></div>
      ) : tasks.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">No tasks found.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Task', 'Project', 'Status', 'Priority', 'Deadline', 'Assignees', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task: {
                  id: string; name: string; status: TaskStatus; priority: TaskPriority; deadline: string;
                  project?: { name: string }; assignments: Array<{ user: { name: string } }>;
                }) => {
                  const overdue = isPast(new Date(task.deadline)) && task.status !== 'COMPLETED';
                  return (
                    <tr key={task.id} className={clsx('hover:bg-gray-50', overdue && 'bg-red-50')}>
                      <td className="px-4 py-3">
                        <Link to={`/tasks/${task.id}`} className="font-medium text-brand-600 hover:underline">
                          {task.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{task.project?.name || '—'}</td>
                      <td className="px-4 py-3"><TaskStatusBadge status={task.status} /></td>
                      <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                      <td className={clsx('px-4 py-3', overdue ? 'text-red-600 font-medium' : 'text-gray-500')}>
                        {format(new Date(task.deadline), 'MMM d, yyyy')}
                        {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {task.assignments.map((a) => a.user.name).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/tasks/${task.id}`} className="text-brand-600 text-xs hover:underline">View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} defaultProjectId={projectId} />}
    </div>
  );
}

function CreateTaskModal({ onClose, defaultProjectId }: { onClose: () => void; defaultProjectId?: string }) {
  const { data: projectsData } = useProjects();
  const { data: usersData } = useUsers({ role: 'EMPLOYEE' });
  const projects = projectsData?.data || [];
  const employees = usersData?.data || [];
  const create = useCreateTask();

  const [form, setForm] = useState({
    name: '', description: '', projectId: defaultProjectId || '',
    priority: 'MEDIUM' as TaskPriority, status: 'TODO' as TaskStatus,
    deadline: '', estimatedHours: '', assigneeIds: [] as string[],
  });
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await create.mutateAsync({
        ...form,
        estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
      } as never);
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create task');
    }
  }

  function toggleAssignee(id: string) {
    setForm((f) => ({
      ...f,
      assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter((x) => x !== id) : [...f.assigneeIds, id],
    }));
  }

  return (
    <Modal title="New Task" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Task Name *</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label">Project *</label>
          <select className="input" required value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">Select project</option>
            {projects.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
              {['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Deadline *</label>
            <input type="datetime-local" className="input" required value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </div>
          <div>
            <label className="label">Est. Hours</label>
            <input type="number" step="0.5" min="0" className="input" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Assign Employees</label>
          <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
            {employees.map((emp: { id: string; name: string }) => (
              <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                <input type="checkbox" checked={form.assigneeIds.includes(emp.id)} onChange={() => toggleAssignee(emp.id)} />
                {emp.name}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
