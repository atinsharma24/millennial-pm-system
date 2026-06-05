import clsx from 'clsx';
import type { TaskStatus, TaskPriority, ProjectStatus } from '../types';

const taskStatusColors: Record<TaskStatus, string> = {
  TODO:        'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  IN_REVIEW:   'bg-yellow-100 text-yellow-700',
  COMPLETED:   'bg-green-100 text-green-700',
  BLOCKED:     'bg-red-100 text-red-700',
};

const priorityColors: Record<TaskPriority, string> = {
  LOW:      'bg-gray-100 text-gray-600',
  MEDIUM:   'bg-blue-100 text-blue-600',
  HIGH:     'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const projectStatusColors: Record<ProjectStatus, string> = {
  PLANNING:  'bg-purple-100 text-purple-700',
  ACTIVE:    'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
  ARCHIVED:  'bg-yellow-100 text-yellow-700',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={clsx('badge', taskStatusColors[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={clsx('badge', priorityColors[priority])}>
      {priority}
    </span>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={clsx('badge', projectStatusColors[status])}>
      {status}
    </span>
  );
}
