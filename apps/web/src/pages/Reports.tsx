import { useProjectReport, useEmployeeReport } from '../api/hooks';
import Spinner from '../components/Spinner';
import { ProjectStatusBadge } from '../components/StatusBadge';
import type { ProjectStatus } from '../types';

export default function Reports() {
  const { data: projectReport, isLoading: loadingProjects } = useProjectReport();
  const { data: employeeReport, isLoading: loadingEmployees } = useEmployeeReport();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Reports</h1>

      {/* Project Report */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Project Completion Report</h2>
        {loadingProjects ? (
          <Spinner />
        ) : !projectReport?.length ? (
          <div className="card p-4 text-gray-500 text-sm">No project data.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Project', 'Status', 'Total Tasks', 'Completed', 'Pending', 'Completion %'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-gray-500 text-xs uppercase font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projectReport.map((p: {
                  id: string; name: string; status: ProjectStatus;
                  totalTasks: number; completedTasks: number; pendingTasks: number; completionPct: number;
                }) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3"><ProjectStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-gray-600">{p.totalTasks}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{p.completedTasks}</td>
                    <td className="px-4 py-3 text-orange-600">{p.pendingTasks}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${p.completionPct}%` }} />
                        </div>
                        <span className="text-xs font-medium">{p.completionPct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Employee Report */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Employee Productivity Report</h2>
        {loadingEmployees ? (
          <Spinner />
        ) : !employeeReport?.length ? (
          <div className="card p-4 text-gray-500 text-sm">No employee data.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Employee', 'Assigned', 'Completed', 'Hours Logged', 'Avg. Days to Complete'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-gray-500 text-xs uppercase font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employeeReport.map((emp: {
                  id: string; name: string; email: string;
                  assignedTasks: number; completedTasks: number; totalHoursLogged: number; avgCompletionDays: number;
                }) => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{emp.name}</div>
                      <div className="text-xs text-gray-400">{emp.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.assignedTasks}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{emp.completedTasks}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.totalHoursLogged}h</td>
                    <td className="px-4 py-3 text-gray-600">{emp.avgCompletionDays > 0 ? `${emp.avgCompletionDays} days` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
