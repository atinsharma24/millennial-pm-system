export type Role = 'ADMIN' | 'PROJECT_MANAGER' | 'EMPLOYEE';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED' | 'BLOCKED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type NotificationType = 'DEADLINE_48H' | 'DEADLINE_24H' | 'DEADLINE_12H' | 'DEADLINE_1H' | 'OVERDUE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  managerId: string;
  manager?: User;
  completionPct?: number;
  tasks?: Task[];
  _count?: { tasks: number };
  createdAt?: string;
}

export interface TaskAssignment {
  id: string;
  userId: string;
  user: User;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: string;
  estimatedHours?: number;
  projectId: string;
  project?: { id: string; name: string; managerId?: string };
  assignments: TaskAssignment[];
  workLogs?: WorkLog[];
  createdById?: string;
  createdAt?: string;
  _count?: { workLogs: number };
}

export interface LogReply {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string };
}

export interface WorkLog {
  id: string;
  taskId: string;
  userId: string;
  description: string;
  hoursWorked: number;
  attachmentUrl?: string;
  createdAt: string;
  user: { id: string; name: string };
  task?: { id: string; name: string; project?: { name: string } };
  replies: LogReply[];
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  sentAt: string;
  task?: { id: string; name: string };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: Pagination;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}
