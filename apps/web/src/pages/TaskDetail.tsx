import { useParams, Link } from 'react-router-dom';
import { useTask, useUpdateTask, useSubmitWorkLog, useReplyToLog } from '../api/hooks';
import { TaskStatusBadge, PriorityBadge } from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { useAuthStore } from '../context/AuthStore';
import { format } from 'date-fns';
import { useState } from 'react';
import type { TaskStatus } from '../types';

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: task, isLoading } = useTask(id!);
  const { user } = useAuthStore();
  const updateTask = useUpdateTask(id!);
  const [newStatus, setNewStatus] = useState<TaskStatus>('TODO');
  const [showLogForm, setShowLogForm] = useState(false);

  if (isLoading) return <div className="flex justify-center mt-16"><Spinner size="lg" /></div>;
  if (!task) return <div className="card p-6 text-gray-500">Task not found.</div>;

  const isEmployee = user?.role === 'EMPLOYEE';
  const isAssigned = task.assignments.some((a) => a.user.id === user?.id);

  async function updateStatus() {
    await updateTask.mutateAsync({ status: newStatus });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-sm text-gray-500">
        <Link to="/tasks" className="hover:underline">Tasks</Link> / {task.name}
      </div>

      <div className="flex items-start justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{task.name}</h1>
        <div className="flex gap-2 shrink-0">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </div>
      </div>

      {task.description && <p className="text-gray-600 mb-4">{task.description}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Project', value: task.project?.name },
          { label: 'Deadline', value: format(new Date(task.deadline), 'MMM d, yyyy HH:mm') },
          { label: 'Est. Hours', value: task.estimatedHours ? `${task.estimatedHours}h` : '—' },
          { label: 'Assignees', value: task.assignments.map((a) => a.user.name).join(', ') || '—' },
        ].map((item) => (
          <div key={item.label} className="card p-3">
            <p className="text-xs text-gray-400">{item.label}</p>
            <p className="font-medium text-gray-800 mt-0.5 text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Status update (employee or PM/admin) */}
      <div className="card p-4 mb-6 flex gap-3 items-center">
        <label className="text-sm font-medium text-gray-700">Update Status:</label>
        <select
          className="input w-44"
          defaultValue={task.status}
          onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
        >
          {['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <button onClick={updateStatus} className="btn-primary text-sm" disabled={updateTask.isPending}>
          {updateTask.isPending ? 'Saving...' : 'Update'}
        </button>
      </div>

      {/* Work Logs */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Work Logs ({task.workLogs?.length || 0})</h2>
          {(isEmployee && isAssigned) && (
            <button onClick={() => setShowLogForm(!showLogForm)} className="btn-secondary text-sm">
              + Submit Log
            </button>
          )}
        </div>

        {showLogForm && <WorkLogForm taskId={id!} onClose={() => setShowLogForm(false)} />}

        <div className="divide-y">
          {!task.workLogs?.length ? (
            <p className="p-4 text-sm text-gray-500">No work logs yet.</p>
          ) : (
            task.workLogs.map((log: import('../types').WorkLog) => (
              <WorkLogEntry key={log.id} log={log} canReply={!isEmployee || log.userId === user?.id} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function WorkLogForm({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const submit = useSubmitWorkLog();
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const fd = new FormData();
    fd.append('taskId', taskId);
    fd.append('description', desc);
    fd.append('hoursWorked', hours);
    if (file) fd.append('attachment', file);
    try {
      await submit.mutateAsync(fd);
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-blue-50 border-b space-y-3">
      <div>
        <label className="label">Description *</label>
        <textarea className="input" rows={2} required value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Hours Worked *</label>
          <input type="number" step="0.5" min="0.5" className="input" required value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div>
          <label className="label">Attachment</label>
          <input type="file" className="input text-xs py-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={submit.isPending}>
          {submit.isPending ? 'Submitting...' : 'Submit Log'}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  );
}

function WorkLogEntry({ log, canReply }: { log: import('../types').WorkLog; canReply: boolean }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const reply = useReplyToLog(log.id);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    await reply.mutateAsync(replyText);
    setReplyText('');
    setShowReply(false);
  }

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <span className="font-medium text-sm">{log.user.name}</span>
          <span className="text-gray-400 text-xs ml-2">{format(new Date(log.createdAt), 'MMM d, HH:mm')}</span>
          <span className="ml-2 text-xs bg-brand-100 text-brand-700 rounded px-1.5 py-0.5">{log.hoursWorked}h</span>
        </div>
        {canReply && (
          <button onClick={() => setShowReply(!showReply)} className="text-xs text-brand-600 hover:underline">Reply</button>
        )}
      </div>
      <p className="text-sm text-gray-700">{log.description}</p>
      {log.attachmentUrl && (
        <a href={log.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline mt-1 block">
          View attachment
        </a>
      )}

      {/* Replies */}
      {log.replies?.length > 0 && (
        <div className="mt-2 pl-4 border-l-2 border-gray-200 space-y-2">
          {log.replies.map((r) => (
            <div key={r.id}>
              <span className="text-xs font-medium text-gray-600">{r.user.name}</span>
              <span className="text-gray-400 text-xs ml-1">{format(new Date(r.createdAt), 'MMM d, HH:mm')}</span>
              <p className="text-xs text-gray-700 mt-0.5">{r.content}</p>
            </div>
          ))}
        </div>
      )}

      {showReply && (
        <form onSubmit={submitReply} className="mt-2 flex gap-2">
          <input
            className="input text-sm flex-1"
            placeholder="Write a reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary text-sm" disabled={reply.isPending}>Send</button>
        </form>
      )}
    </div>
  );
}
