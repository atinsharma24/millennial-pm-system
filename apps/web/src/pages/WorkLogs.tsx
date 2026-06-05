import { useState } from 'react';
import { useWorkLogs } from '../api/hooks';
import { useAuthStore } from '../context/AuthStore';
import Spinner from '../components/Spinner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function WorkLogs() {
  const { user } = useAuthStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading } = useWorkLogs({
    ...(from && { from }),
    ...(to && { to }),
  });
  const logs = data?.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{user?.role === 'EMPLOYEE' ? 'My Work Logs' : 'Work Logs'}</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <label className="label text-xs">From</label>
          <input type="date" className="input w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">To</label>
          <input type="date" className="input w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center mt-10"><Spinner size="lg" /></div>
      ) : logs.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">No work logs found.</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log: {
            id: string; description: string; hoursWorked: number; createdAt: string;
            user: { name: string }; task?: { id: string; name: string; project?: { name: string } };
            replies: Array<{ id: string }>;
          }) => (
            <div key={log.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-sm">{log.user.name}</span>
                  <span className="text-gray-400 text-xs ml-2">{format(new Date(log.createdAt), 'MMM d, yyyy HH:mm')}</span>
                  <span className="ml-2 text-xs bg-brand-100 text-brand-700 rounded px-1.5 py-0.5">{log.hoursWorked}h</span>
                </div>
                {log.task && (
                  <Link to={`/tasks/${log.task.id}`} className="text-xs text-brand-600 hover:underline shrink-0">
                    {log.task.project?.name && `${log.task.project.name} / `}{log.task.name}
                  </Link>
                )}
              </div>
              <p className="text-sm text-gray-700 mt-1">{log.description}</p>
              {log.replies?.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">{log.replies.length} repl{log.replies.length === 1 ? 'y' : 'ies'}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
