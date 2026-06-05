import { useState } from 'react';
import { useAuditLogs } from '../api/hooks';
import Spinner from '../components/Spinner';
import { format } from 'date-fns';

export default function AuditLog() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');

  const { data, isLoading } = useAuditLogs({
    ...(entity && { entity }),
    ...(action && { action }),
  });
  const logs = data?.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input className="input w-40" placeholder="Entity..." value={entity} onChange={(e) => setEntity(e.target.value)} />
        <input className="input w-44" placeholder="Action..." value={action} onChange={(e) => setAction(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center mt-10"><Spinner size="lg" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Time', 'User', 'Action', 'Entity', 'Entity ID'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-gray-500 text-xs uppercase font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No audit logs found.</td></tr>
              ) : (
                logs.map((log: { id: string; createdAt: string; userEmail?: string; action: string; entity: string; entityId?: string }) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}</td>
                    <td className="px-4 py-3 text-gray-700">{log.userEmail || '—'}</td>
                    <td className="px-4 py-3"><span className="badge bg-gray-100 text-gray-700">{log.action}</span></td>
                    <td className="px-4 py-3 text-gray-600">{log.entity}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono truncate max-w-xs">{log.entityId || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
