// src/components/Tasks/TaskView.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Pencil, Calendar, Download, Trash2 } from 'lucide-react';
import { getTask, deleteTask } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import type { Task } from '../types/index';

const STATUS_STYLES: Record<string, string> = {
  'Done':        'bg-emerald-500/10 text-emerald-400',
  'In Progress': 'bg-amber-500/10  text-amber-400',
  'Review':      'bg-purple-500/10 text-purple-400',
  'To Do':       'bg-blue-500/10   text-blue-400',
};

const PRIORITY_STYLES: Record<string, string> = {
  High:   'text-red-400',
  Medium: 'text-amber-400',
  Low:    'text-emerald-400',
};

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

export const TaskView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const canDeleteGlobal = usePermission('tasks', 'delete') ||
    ['super-admin', 'admin'].includes(user?.accessLevel || '');

  useEffect(() => {
    if (id) load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getTask(id!);
      const data: Task = (res as any)?.data ?? res;
      setTask(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const canDelete = canDeleteGlobal || (task?.assigner as any)?._id?.toString() === (user as any)?._id;

  const handleDelete = async () => {
    if (!task) return;
    if (!window.confirm('Delete this task permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteTask(task._id);
      notify('Task deleted successfully');
      navigate('/tasks');
    } catch (err: any) {
      notify(err?.response?.data?.msg || err?.response?.data?.message || 'Failed to delete task', 'error');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-zinc-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading task...</span>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center min-h-screen text-zinc-400 text-sm">
        Task not found.
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tv-root {
          min-height: 100vh;
          background: #07080e;
          background-image:
            radial-gradient(ellipse 70% 50% at 88% 0%, rgba(124,58,237,0.11) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at 8% 100%, rgba(88,80,236,0.08) 0%, transparent 55%);
          padding: 2.75rem 1.75rem 6rem;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,0.84);
        }
        .tv-num {
          font-family: 'JetBrains Mono', 'Fira Mono', monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: rgba(124,58,237,0.85);
          background: rgba(124,58,237,0.1);
          border: 1px solid rgba(124,58,237,0.22);
          border-radius: 8px;
          padding: 3px 10px;
        }
      `}</style>

      <div className="tv-root">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto"
        >
          <button
            onClick={() => navigate('/tasks')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 text-sm transition-colors"
          >
            <ArrowLeft size={16} /> Back to Tasks
          </button>

          <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-700 rounded-3xl p-8">
            <div className="flex justify-between items-start gap-4 mb-6">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{task.title}</h1>
                {task.taskNumber != null && (
                  <span className="tv-num">TM{String(task.taskNumber).padStart(4, '0')}</span>
                )}
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${STATUS_STYLES[task.status] || 'bg-zinc-500/10 text-zinc-400'}`}>
                {task.status}
              </span>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Description</div>
                <p className="text-zinc-200 whitespace-pre-wrap">
                  {task.description || 'No description'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Project</div>
                  <p className="text-zinc-200">{(task.project as any)?.name || '—'}</p>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Priority</div>
                  <p className={`font-semibold ${PRIORITY_STYLES[task.priority] || 'text-zinc-300'}`}>
                    {task.priority}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Start Date</div>
                  <div className="flex items-center gap-2 text-zinc-200 text-sm">
                    <Calendar size={16} />
                    {task.startDate ? new Date(task.startDate).toLocaleDateString('en-IN') : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">End Date</div>
                  <div className="flex items-center gap-2 text-zinc-200 text-sm">
                    <Calendar size={16} />
                    {task.endDate ? new Date(task.endDate).toLocaleDateString('en-IN') : '—'}
                  </div>
                </div>
              </div>

              {task.assigner && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Owner</div>
                  <p className="text-zinc-200">{(task.assigner as any)?.name}</p>
                </div>
              )}

              {task.attachments && task.attachments.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Attachments</div>
                  <div className="space-y-2">
                    {task.attachments.map((att: any) => (
                      <a
                        key={att._id || att.url}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300"
                      >
                        <Download size={14} /> {att.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-8">
              <Link
                to={`/tasks/${task._id}/edit`}
                className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 py-4 rounded-2xl font-semibold text-white transition-colors"
              >
                <Pencil size={18} /> Edit Task
              </Link>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center justify-center gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 py-4 px-6 rounded-2xl font-semibold transition-colors"
                >
                  {deleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                  Delete
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};