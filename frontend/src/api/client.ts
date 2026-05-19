import axios from 'axios';
import type { User, Project, Task, Activity, Reimbursement, MonthlyReport, AuthResponse } from '../components/types/index';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers['x-auth-token'] = token;
  return config;
});

// ========== AUTH ==========
export const login = (email: string, password: string) => api.post<AuthResponse>('/auth/login', { email, password });
export const register = (name: string, email: string, password: string, role?: string) =>
  api.post<AuthResponse>('/auth/register', { name, email, password, role });
export const getMe = () => api.get<User>('/auth/me');

// ========== USERS ==========
export const getUsers = (page = 1, limit = 20, role?: string, status?: string) =>
  api.get<{ users: User[]; total: number; page: number; pages: number }>(
    `/users?page=${page}&limit=${limit}${role ? `&role=${role}` : ''}${status ? `&status=${status}` : ''}`
  );
export const getUser = (id: string) => api.get<User>(`/users/${id}`);
export const createUser = (data: FormData) => api.post('/users', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateUser = (id: string, data: FormData) => api.put(`/users/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteUser = (id: string) => api.delete(`/users/${id}`);
export const getTeamMembers = () => api.get<User[]>('/users/team');
export const getAllEmployees = () => getUsers(1, 1000).then(res => res.data.users);

// ========== PROJECTS ==========
export const getProjects = (params?: any) => api.get<Project[]>('/projects', { params });
export const getProject = (id: string) => api.get<Project>(`/projects/${id}`);
export const createProject = (data: any) => api.post('/projects', data);
export const updateProject = (id: string, data: any) => api.put(`/projects/${id}`, data);
export const deleteProject = (id: string) => api.delete(`/projects/${id}`);
export const getProjectProgress = (projectId: string) =>
  api.get(`/projects/${projectId}/progress`);
export const addProgressUpdate = (projectId: string, data: { percentage: number; note: string }) =>
  api.post<Project>(`/projects/${projectId}/progress`, data);
export const deleteProgressUpdate = (projectId: string, entryId: string) =>
  api.delete<Project>(`/projects/${projectId}/progress/${entryId}`);
export const getMyProjects = () =>
  api.get('/projects/my-projects');

// ========== TASKS ==========
export const getTasks = (params?: any) => api.get<Task[]>('/tasks', { params });
export const getTask = (id: string) => api.get<Task>(`/tasks/${id}`);
export const createTask = (data: FormData) => api.post('/tasks', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateTask = (id: string, data: FormData) => api.put(`/tasks/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteTask = (id: string) => api.delete(`/tasks/${id}`);

// ========== ACTIVITIES ==========
export const getActivities = (params?: any) => api.get<Activity[]>('/activities', { params });
export const getActivity = (id: string) => api.get<Activity>(`/activities/${id}`);
export const createActivity = (data: FormData) => api.post('/activities', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateActivity = (id: string, data: FormData) => api.put(`/activities/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteActivity = (id: string) => api.delete(`/activities/${id}`);

// ========== REIMBURSEMENTS ==========
export const getReimbursements = (params?: any) => api.get<Reimbursement[]>('/reimbursements', { params });
export const getReimbursement = (id: string) => api.get<Reimbursement>(`/reimbursements/${id}`);
export const createReimbursement = (data: FormData) => api.post('/reimbursements', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateReimbursementStatus = (id: string, data: any) => api.put(`/reimbursements/${id}/status`, data);

// ========== REPORTS ==========
export const getMyMonthlyReport = (year: number, month: number) => api.get<MonthlyReport>(`/reports/monthly/${year}/${month}`);
export const getEmployeeMonthlyReport = (userId: string, year: number, month: number) =>
  api.get<MonthlyReport>(`/reports/admin/${userId}/${year}/${month}`);

// ========== PERFORMANCE DASHBOARD (new) ==========
export const getEmployeesProgress = () => api.get('/performance/employees-progress');
export const updateProgress = (userId: string, data: any) => api.put(`/performance/progress/${userId}`, data);

// ✅ DEFAULT EXPORT – needed for `import api from '../../api/client'`
export default api;