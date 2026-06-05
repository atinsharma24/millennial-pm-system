/**
 * @file pages/Kanban.tsx
 * @description Kanban board view for tasks.
 *
 * Tasks are grouped into five status columns.  Cards are draggable using the
 * HTML5 Drag and Drop API (no extra library required).  Dropping a card on a
 * different column calls `PATCH /api/tasks/:id` to update the status; an
 * optimistic local state update makes the move feel instant while the request
 * is in flight.
 *
 * Filters at the top let PMs/Admins narrow by project; the list auto-refreshes
 * via Socket.IO `task:updated` events when other users move cards.
 */

import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTasks, useUpdateTask, useProjects } from '../api/hooks';
import { TaskStatusBadge, PriorityBadge } from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { useAuthStore } from '../context/AuthStore';
import { useToast } from '../context/ToastContext';
import { format, isPast } from 'date-fns';
import clsx from 'clsx';
import type { Task, TaskStatus } from '../types';

// ─── Column config ────────────────────────────────────────────────────────────

interface Column {
  status: TaskStatus;
  label:  string;
  color:  string;
  bg:     string;
}

const COLUMNS: Column[] = [
  { status: 'TODO',        label: 'To Do',       color: 'border-gray-400',   bg: 'bg-gray-50'   },
  { status: 'IN_PROGRESS', label: 'In Progress',  color: 'border-blue-400',   bg: 'bg-blue-50'   },
  { status: 'IN_REVIEW',   label: 'In Review',    color: 'border-yellow-400', bg: 'bg-yellow-50' },
  { status: 'COMPLETED',   label: 'Completed',    color: 'border-green-400',  bg: 'bg-green-50'  },
  { status: 'BLOCKED',     label: 'Blocked',      color: 'border-red-400',    bg: 'bg-red-50'    },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Kanban() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [projectFilter, setProjectFilter] = useState('');
  const [draggedId, setDraggedId]         = useState<string | null>(null);
  const [dropTarget, setDropTarget]       = useState<TaskStatus | null>(null);

  // Optimistic local overrides: taskId → status (cleared on API response)
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, TaskStatus>>({});

  const { data: projectsData } = useProjects();
  const projects = projectsData?.data ?? [];

  const { data: tasksData, isLoading } = useTasks({
    ...(projectFilter && { projectId: projectFilter }),
    limit: '200',
  });
  const rawTasks: Task[] = tasksData?.data ?? [];

  // Apply optimistic overrides
  const tasks = rawTasks.map((t) =>
    optimisticStatus[t.id] ? { ...t, status: optimisticStatus[t.id] } : t
  );

  const updateMutations = useRef<Record<string, ReturnType<typeof useUpdateTask>>>({});

  // Pre-create a mutation for the dragged task once we have its id
  // (we use a stable closure so we can call it in the drop handler)
  const updateTask = useUpdateTask(draggedId ?? '');

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const onDragStart = useCallback((taskId: string) => {
    setDraggedId(taskId);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDropTarget(status);
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setDropTarget(null);
    if (!draggedId) return;

    const task = tasks.find((t) => t.id === draggedId);
    if (!task || task.status === targetStatus) { setDraggedId(null); return; }

    // Optimistic update
    setOptimisticStatus((prev) => ({ ...prev, [draggedId]: targetStatus }));
    setDraggedId(null);

    try {
      await updateTask.mutateAsync({ status: targetStatus });
      toast({ message: `Task moved to ${targetStatus.replace('_', ' ')}`, type: 'success' });
    } catch {
      // Revert optimistic update
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[draggedId];
        return next;
      });
      toast({ message: 'Failed to update task status', type: 'error' });
    }
  }, [draggedId, tasks, updateTask, toast]);

  const onDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const canFilter = user?.role !== 'EMPLOYEE';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-2xl font-bold">Kanban Board</h1>
        {canFilter && (
          <select
            className="input w-52"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p: { id: string; name: string }) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center mt-16"><Spinner size="lg" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            const isTarget = dropTarget === col.status;

            return (
              <div
                key={col.status}
                className={clsx(
                  'flex flex-col rounded-xl border-2 min-w-[260px] w-[280px] shrink-0 transition-colors',
                  col.color,
                  col.bg,
                  isTarget && 'ring-2 ring-brand-400 ring-offset-1'
                )}
                onDragOver={(e) => onDragOver(e, col.status)}
                onDrop={(e) => onDrop(e, col.status)}
                onDragLeave={() => setDropTarget(null)}
              >
                {/* Column header */}
                <div className="px-3 py-2 border-b border-current/20 flex items-center justify-between shrink-0">
                  <span className="font-semibold text-sm">{col.label}</span>
                  <span className="text-xs bg-white/60 rounded-full px-2 py-0.5 font-medium">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
                  {colTasks.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      isDragging={draggedId === task.id}
                      onDragStart={() => onDragStart(task.id)}
                      onDragEnd={onDragEnd}
                    />
                  ))}

                  {colTasks.length === 0 && (
                    <div className="text-center text-xs text-gray-400 py-6">
                      Drop tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

/**
 * Individual task card rendered inside a Kanban column.
 *
 * @param task      - Task data
 * @param isDragging - Whether this card is currently being dragged
 * @param onDragStart - Called when drag begins
 * @param onDragEnd   - Called when drag ends (drop or cancel)
 */
function KanbanCard({
  task,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const overdue = isPast(new Date(task.deadline)) && task.status !== 'COMPLETED';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={clsx(
        'bg-white rounded-lg border shadow-sm p-3 cursor-grab active:cursor-grabbing',
        'transition-opacity select-none hover:shadow-md',
        isDragging && 'opacity-40 scale-95',
        overdue && 'border-red-300 bg-red-50'
      )}
    >
      {/* Name */}
      <Link
        to={`/tasks/${task.id}`}
        className="text-sm font-medium text-gray-900 hover:text-brand-600 line-clamp-2"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      >
        {task.name}
      </Link>

      {/* Project */}
      {task.project && (
        <p className="text-xs text-gray-400 mt-0.5 truncate">{task.project.name}</p>
      )}

      {/* Meta row */}
      <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
        <PriorityBadge priority={task.priority} />
        <span className={clsx('text-xs', overdue ? 'text-red-600 font-medium' : 'text-gray-400')}>
          {format(new Date(task.deadline), 'MMM d')}
          {overdue && ' ⚠'}
        </span>
      </div>

      {/* Assignees */}
      {task.assignments.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {task.assignments.slice(0, 3).map((a) => (
            <span
              key={a.user.id}
              className="text-xs bg-brand-100 text-brand-700 rounded-full px-2 py-0.5"
              title={a.user.name}
            >
              {a.user.name.split(' ')[0]}
            </span>
          ))}
          {task.assignments.length > 3 && (
            <span className="text-xs text-gray-400">+{task.assignments.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}
