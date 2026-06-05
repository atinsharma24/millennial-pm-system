import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects, useCreateProject, useDeleteProject, useUsers } from '../api/hooks';
import { useAuthStore } from '../context/AuthStore';
import { ProjectStatusBadge } from '../components/StatusBadge';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { format } from 'date-fns';
import type { ProjectStatus } from '../types';

export default function Projects() {
  const { user } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useProjects({
    ...(statusFilter && { status: statusFilter }),
    ...(search && { search }),
  });

  const projects = data?.data || [];
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            + New Project
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          className="input w-56"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center mt-10"><Spinner size="lg" /></div>
      ) : projects.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">No projects found.</div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p: typeof projects[0]) => (
            <Link to={`/projects/${p.id}`} key={p.id} className="card p-5 hover:shadow-md transition-shadow block">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-gray-900 line-clamp-1">{p.name}</h3>
                <ProjectStatusBadge status={p.status as ProjectStatus} />
              </div>
              {p.description && <p className="text-sm text-gray-500 line-clamp-2 mb-3">{p.description}</p>}
              <div className="text-xs text-gray-400 space-y-1">
                <div>Manager: {p.manager?.name}</div>
                <div>{p._count?.tasks ?? 0} tasks · Due {format(new Date(p.endDate), 'MMM d, yyyy')}</div>
              </div>
              {typeof p.completionPct === 'number' && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span><span>{p.completionPct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${p.completionPct}%` }} />
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { data: usersData } = useUsers({ role: 'PROJECT_MANAGER' });
  const managers = usersData?.data || [];
  const create = useCreateProject();
  const [form, setForm] = useState({
    name: '', description: '', startDate: '', endDate: '', managerId: '', status: 'PLANNING' as ProjectStatus,
  });
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await create.mutateAsync(form);
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create');
    }
  }

  return (
    <Modal title="New Project" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Name *</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start Date *</label>
            <input type="date" className="input" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End Date *</label>
            <input type="date" className="input" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Project Manager *</label>
          <select className="input" required value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
            <option value="">Select manager</option>
            {managers.map((m: { id: string; name: string }) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
