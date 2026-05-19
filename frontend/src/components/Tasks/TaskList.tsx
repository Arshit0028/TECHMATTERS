// src/components/Tasks/TaskList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, Edit, Trash2, X } from 'lucide-react';
import { getTasks, deleteTask, getProjects } from '../../api/client';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import type { Task, Project } from '../types/index';

// ─── Toast Notification ──────────────────────────────────────────────────────
const notify = (message: string, type: 'success' | 'error' = 'success') => {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;padding:16px 24px;border-radius:12px;
    font-size:14px;font-weight:500;box-shadow:0 10px 30px rgba(0,0,0,0.3);
    z-index:9999;transition:all 0.3s;
    ${type === 'success' ? 'background:#34d399;color:#fff;' : 'background:#f87171;color:#fff;'}
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
};

// ─── Debounce hook ────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const extractProjects = (res: any): Project[] => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.projects)) return res.projects;
  if (Array.isArray(res.data?.projects)) return res.data.projects;
  return [];
};

const extractTasks = (res: any): Task[] => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.tasks)) return res.data.tasks;
  return [];
};

const STATUS_STYLES: Record<string, string> = {
  'Done': 'bg-emerald-500/10 text-emerald-400',
  'In Progress': 'bg-amber-500/10 text-amber-400',
  'Review': 'bg-purple-500/10 text-purple-400',
  'To Do': 'bg-blue-500/10 text-blue-400',
};

const PRIORITY_STYLES: Record<string, string> = {
  'High': 'text-red-400',
  'Medium': 'text-amber-400',
  'Low': 'text-emerald-400',
};

// ─── Component ────────────────────────────────────────────────────────────────
export const TaskList: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  const navigate = useNavigate();
  const { user } = useAuth();

  const canCreate =
    usePermission('tasks', 'create') ||
    ['super-admin', 'admin'].includes(user?.accessLevel || '');

  const canDeleteGlobal =
    usePermission('tasks', 'delete') ||
    ['super-admin', 'admin'].includes(user?.accessLevel || '');

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsRes, tasksRes] = await Promise.all([
        getProjects(),
        getTasks({
          project: filterProject || undefined,
          status: filterStatus || undefined,
          search: debouncedSearch || undefined,
        }),
      ]);
      setProjects(extractProjects(projectsRes));
      setTasks(extractTasks(tasksRes));
    } catch (err) {
      console.error(err);
      notify('Failed to load tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterStatus, debouncedSearch]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Delete with permission-aware error handling ─────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task permanently? This action cannot be undone.')) return;

    const previousTasks = [...tasks];
    setDeletingId(id);
    setTasks(prev => prev.filter(t => t._id !== id));

    try {
      await deleteTask(id);
      notify('Task deleted successfully');
    } catch (err: any) {
      setTasks(previousTasks); // rollback on error
      const errorMsg =
        err?.response?.data?.msg ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete task';
      notify(errorMsg, 'error');
      console.error('Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Clear filters ───────────────────────────────────────────────────────────
  const hasActiveFilters = searchTerm || filterProject || filterStatus;
  const clearFilters = () => {
    setSearchTerm('');
    setFilterProject('');
    setFilterStatus('');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .task-root {
          min-height: 100vh;
          background: #07080e;
          background-image:
            radial-gradient(ellipse 70% 50% at 88% 0%, rgba(124,58,237,0.11) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at 8% 100%, rgba(88,80,236,0.08) 0%, transparent 55%);
          padding: 2.75rem 1.75rem 6rem;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,0.84);
        }
        .task-card {
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px;
          overflow: hidden;
        }
        .skeleton { background: linear-gradient(90deg, #1f2028 25%, #2a2b36 50%, #1f2028 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      <div className="task-root">
        <div className="max-w-screen-2xl mx-auto">

          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Tasks</h1>
              <p className="text-zinc-400">
                Real-time project delivery •{' '}
                {loading ? '…' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            {canCreate && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/tasks/new')}
                className="flex items-center gap-3 bg-violet-600 hover:bg-violet-500 px-8 py-4 rounded-3xl text-white font-semibold shadow-xl shadow-violet-500/30 transition-colors"
              >
                <Plus size={20} /> New Task
              </motion.button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-8">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              <input
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-10 py-4 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white placeholder:text-zinc-500 transition-colors"
                aria-label="Search tasks"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <select
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
              className="px-6 py-4 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white transition-colors"
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-6 py-4 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white transition-colors"
            >
              <option value="">All Status</option>
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Review">Review</option>
              <option value="Done">Done</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-5 py-4 text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-3xl transition-colors text-sm"
              >
                <X size={14} /> Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="task-card">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700">
                  {['Task', 'Project', 'Assignee', 'Priority', 'Status', 'Due'].map(h => (
                    <th key={h} className="text-left py-5 px-8 text-xs font-medium text-zinc-400 uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                  <th className="w-28" />
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-800">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="py-5 px-8">
                          <div className={`h-4 skeleton rounded-full ${j === 0 ? 'w-3/4' : j === 6 ? 'w-16' : 'w-1/2'}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-20 text-zinc-400">
                      <div className="flex flex-col items-center gap-3">
                        <Search size={32} className="text-zinc-700" />
                        <p>{hasActiveFilters ? 'No tasks match your filters' : 'No tasks yet'}</p>
                        {hasActiveFilters && (
                          <button onClick={clearFilters} className="text-violet-400 hover:text-violet-300 text-sm underline">
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence>
                    {tasks.map(task => (
                      <motion.tr
                        key={task._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: deletingId === task._id ? 0.4 : 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-b border-zinc-800 hover:bg-zinc-800/50 group"
                      >
                        <td className="py-5 px-8 font-medium text-white max-w-xs">
                          <span className="truncate block">{task.title}</span>
                        </td>
                        <td className="py-5 px-8 text-zinc-400">
                          {task.project?.name || '—'}
                        </td>
                        <td className="py-5 px-8 text-zinc-400">
                          {task.assignee?.name || 'Unassigned'}
                        </td>
                        <td className="py-5 px-8">
                          <span className={`text-xs font-semibold ${PRIORITY_STYLES[task.priority] || 'text-zinc-400'}`}>
                            {task.priority || '—'}
                          </span>
                        </td>
                        <td className="py-5 px-8">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-2xl ${STATUS_STYLES[task.status] || 'bg-zinc-500/10 text-zinc-400'}`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="py-5 px-8 text-zinc-400 text-sm">
                          {task.endDate
                            ? new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '—'}
                        </td>
                        <td className="py-5 px-8 text-right">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              onClick={() => navigate(`/tasks/${task._id}`)}
                              className="p-2 hover:bg-zinc-700 rounded-2xl text-zinc-400 hover:text-white transition-colors"
                              title="View"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => navigate(`/tasks/${task._id}/edit`)}
                              className="p-2 hover:bg-zinc-700 rounded-2xl text-zinc-400 hover:text-white transition-colors"
                              title="Edit"
                            >
                              <Edit size={18} />
                            </button>

                            {/* 🔥 Users can delete tasks they created OR are assigned to */}
                            {(canDeleteGlobal ||
                              task.assigner?._id?.toString() === user?._id ||
                              task.assignee?._id?.toString() === user?._id) && (
                              <button
                                onClick={() => handleDelete(task._id)}
                                disabled={deletingId === task._id}
                                className="p-2 hover:bg-red-500/10 rounded-2xl text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};