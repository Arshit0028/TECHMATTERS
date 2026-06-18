import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  User, Project, Task, Activity,
  Reimbursement, MonthlyReport, AuthResponse,
} from '../components/types/index';

// ─── Base instance ────────────────────────────────────────────────────────────
// Local:      REACT_APP_API_URL=http://localhost:5000/api  (in .env.local)
// Production: REACT_APP_API_URL=https://techmatters.onrender.com/api (Vercel env var)
const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// ─── Auth token injector ──────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers['x-auth-token'] = token;
  return config;
});

// ─── Global error interceptor ─────────────────────────────────────────────────
// 401 → clear stale token and reload to login
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/login', { email, password });

export const register = (
  name: string, email: string, password: string, role?: string
) => api.post<AuthResponse>('/auth/register', { name, email, password, role });

export const getMe = () => api.get<User>('/auth/me');

// ═══════════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════════
export const getUsers = (
  page = 1, limit = 20, role?: string, status?: string
) =>
  api.get<{ users: User[]; total: number; page: number; pages: number }>(
    `/users?page=${page}&limit=${limit}` +
    (role   ? `&role=${role}`     : '') +
    (status ? `&status=${status}` : '')
  );

export const getUser       = (id: string)               => api.get<User>(`/users/${id}`);
export const createUser    = (data: FormData)            => api.post('/users', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateUser    = (id: string, data: FormData) => api.put(`/users/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteUser    = (id: string)               => api.delete(`/users/${id}`);
export const getTeamMembers = ()                        => api.get<User[]>('/users/team');
export const getAllEmployees = ()                        => getUsers(1, 1000).then(res => res.data.users);

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════
export const getProjects          = (params?: any)        => api.get<Project[]>('/projects', { params });
export const getProject           = (id: string)          => api.get<Project>(`/projects/${id}`);
export const createProject        = (data: any)           => api.post('/projects', data);
export const updateProject        = (id: string, data: any) => api.put(`/projects/${id}`, data);
export const deleteProject        = (id: string)          => api.delete(`/projects/${id}`);
export const getMyProjects        = ()                    => api.get('/projects/my-projects');
export const getProjectProgress   = (id: string)          => api.get(`/projects/${id}/progress`);
export const addProgressUpdate    = (id: string, data: { percentage: number; note: string }) =>
  api.post<Project>(`/projects/${id}/progress`, data);
export const deleteProgressUpdate = (id: string, entryId: string) =>
  api.delete<Project>(`/projects/${id}/progress/${entryId}`);

// ═══════════════════════════════════════════════════════════════════════════
// TASKS  (personal — employee creates tasks for themselves only)
// These go to /api/tasks and stay in the Task collection.
// No assignee field — assigner is always the logged-in user.
// ═══════════════════════════════════════════════════════════════════════════
export const getTasks   = (params?: any)               => api.get<Task[]>('/tasks', { params });
export const getTask    = (id: string)                 => api.get<Task>(`/tasks/${id}`);
export const createTask = (data: FormData)             => api.post('/tasks', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateTask = (id: string, data: FormData) => api.put(`/tasks/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteTask = (id: string)                 => api.delete(`/tasks/${id}`);

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGNED TASKS  (peer assignment — completely separate from /api/tasks)
// Goes to /api/assigned-tasks → AssignedTask collection in MongoDB.
// Regular Tasks page NEVER sees these records.
//
// Flow: Employee assigns → pending → Manager approves → Assignee sees it
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateAssignedTaskPayload {
  title:        string;
  description?: string;
  project:      string;
  assignee:     string;           // recipient's user _id
  priority?:    'Low' | 'Medium' | 'High';
  dueDate?:     string;           // ISO date string
}

export type AssignedTaskStatus = 'To Do' | 'In Progress' | 'Done';
export type ApprovalStatus     = 'pending' | 'approved' | 'rejected';

/** Create a peer assignment — always starts as 'pending' */
export const createAssignedTask = (data: CreateAssignedTaskPayload) =>
  api.post('/assigned-tasks', data);

/** Tasks approved and assigned TO the current user */
export const getAssignedToMe = () =>
  api.get('/assigned-tasks/mine');

/** Tasks the current user assigned to others (all approval states) */
export const getAssignedByMe = () =>
  api.get('/assigned-tasks/by-me');

/** Combined: { received: [...], outgoing: [...] } in one network call */
export const getAllMyAssignedTasks = () =>
  api.get<{ received: any[]; outgoing: any[] }>('/assigned-tasks/all');

/** Manager: tasks waiting for their sign-off */
export const getPendingApprovals = () =>
  api.get('/assigned-tasks/pending-approval');

/** Manager approves a peer-assigned task */
export const approveAssignedTask = (id: string, note = '') =>
  api.patch(`/assigned-tasks/${id}/approve`, { note });

/** Manager rejects a peer-assigned task (note required) */
export const rejectAssignedTask = (id: string, note: string) =>
  api.patch(`/assigned-tasks/${id}/reject`, { note });

/** Assignee updates their task status */
export const updateAssignedTaskStatus = (id: string, status: AssignedTaskStatus) =>
  api.patch(`/assigned-tasks/${id}`, { status });

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════════════════
export const getActivities   = (params?: any)               => api.get<Activity[]>('/activities', { params });
export const getActivity     = (id: string)                 => api.get<Activity>(`/activities/${id}`);
export const createActivity  = (data: FormData)             => api.post('/activities', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateActivity  = (id: string, data: FormData) => api.put(`/activities/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteActivity  = (id: string)                 => api.delete(`/activities/${id}`);

// ═══════════════════════════════════════════════════════════════════════════
// REIMBURSEMENTS
// ═══════════════════════════════════════════════════════════════════════════
export const getReimbursements        = (params?: any)        => api.get<Reimbursement[]>('/reimbursements', { params });
export const getReimbursement         = (id: string)          => api.get<Reimbursement>(`/reimbursements/${id}`);
export const createReimbursement      = (data: FormData)      => api.post('/reimbursements', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateReimbursementStatus = (id: string, data: any) => api.put(`/reimbursements/${id}/status`, data);

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════
export const getMyMonthlyReport = (year: number, month: number) =>
  api.get<MonthlyReport>(`/reports/monthly/${year}/${month}`);

export const getEmployeeMonthlyReport = (userId: string, year: number, month: number) =>
  api.get<MonthlyReport>(`/reports/admin/${userId}/${year}/${month}`);

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════
export const getEmployeesProgress = ()                          => api.get('/performance/employees-progress');
export const updateProgress       = (userId: string, data: any) => api.put(`/performance/progress/${userId}`, data);

// ═══════════════════════════════════════════════════════════════════════════
// ISSUES
// ═══════════════════════════════════════════════════════════════════════════
export const getIssues       = (params?: any)               => api.get('/issues', { params });
export const getIssue        = (id: string)                 => api.get(`/issues/${id}`);
export const createIssue     = (data: any)                  => api.post('/issues', data);
export const updateIssue     = (id: string, data: any)      => api.patch(`/issues/${id}`, data);
export const deleteIssue     = (id: string)                 => api.delete(`/issues/${id}`);
export const addIssueComment = (id: string, text: string)   => api.post(`/issues/${id}/comments`, { text });

// ─── Default export ───────────────────────────────────────────────────────────
export default api;