import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';
import type { Project, Task, WorkLog, User, Notification } from '../types';

// ─── Auth ────────────────────────────────────────────────────────────────────

export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post('/auth/login', data).then((r) => r.data.data),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data.data as User),
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────

export function useUsers(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => api.get('/users', { params }).then((r) => r.data),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User> & { password: string }) => api.post('/users', data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User>) => api.patch(`/users/${id}`, data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ─── Projects ────────────────────────────────────────────────────────────────

export function useProjects(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => api.get('/projects', { params }).then((r) => r.data),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.get(`/projects/${id}`).then((r) => r.data.data as Project),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Project>) => api.post('/projects', data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Project>) => api.patch(`/projects/${id}`, data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); qc.invalidateQueries({ queryKey: ['projects', id] }); },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export function useTasks(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => api.get('/tasks', { params }).then((r) => r.data),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.get(`/tasks/${id}`).then((r) => r.data.data as Task),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task> & { assigneeIds?: string[] }) => api.post('/tasks', data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task>) => api.patch(`/tasks/${id}`, data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['tasks', id] }); },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useAssignTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) => api.post(`/tasks/${id}/assign`, { userIds }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', id] }),
  });
}

// ─── WorkLogs ────────────────────────────────────────────────────────────────

export function useWorkLogs(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['worklogs', params],
    queryFn: () => api.get('/worklogs', { params }).then((r) => r.data),
  });
}

export function useSubmitWorkLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FormData) => api.post('/worklogs', data, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worklogs'] }),
  });
}

export function useReplyToLog(logId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.post(`/worklogs/${logId}/replies`, { content }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worklogs'] }),
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export function useDashboard() {
  return useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => api.get('/reports/dashboard').then((r) => r.data.data),
  });
}

export function useProjectReport() {
  return useQuery({
    queryKey: ['reports', 'projects'],
    queryFn: () => api.get('/reports/projects').then((r) => r.data.data),
  });
}

export function useEmployeeReport() {
  return useQuery({
    queryKey: ['reports', 'employees'],
    queryFn: () => api.get('/reports/employees').then((r) => r.data.data),
  });
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function useNotifications(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => api.get('/notifications', { params }).then((r) => r.data),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export function useAuditLogs(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => api.get('/audit', { params }).then((r) => r.data),
  });
}
