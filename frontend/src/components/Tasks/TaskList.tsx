import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, Edit, Trash2, X, Filter } from 'lucide-react';
import { getTasks, deleteTask, getProjects } from '../../api/client';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import type { Task, Project } from '../types/index';
import { useQuery, invalidate } from '../../hooks/useQuery';

// ─── Toast ────────────────────────────────────────────────────────────────────
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

// ─── Debounce ─────────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Responsive breakpoint (JS-based, not CSS) ─────────────────────────────────
// Replaces the old .tl-desktop/.tl-mobile CSS show/hide pattern, which could
// render BOTH layouts into the DOM simultaneously if the injected <style>
// tag's rules didn't apply (e.g. cascade/order issues) — that was the root
// cause of the "task list shown twice" bug. Conditionally rendering only one
// layout in JS makes that class of bug impossible: only one ever mounts.
const DESKTOP_BREAKPOINT = 768;

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : true,
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    // Run once on mount too, in case the initial SSR/first-paint guess was wrong.
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isDesktop;
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

// ─── Status dot colors ────────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  'Done':        '#34d399',
  'In Progress': '#f59e0b',
  'Review':      '#a78bfa',
  'To Do':       '#60a5fa',
};

// ─── Avatar initials helper ───────────────────────────────────────────────────
const getInitials = (name?: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ─── Component ────────────────────────────────────────────────────────────────
export const TaskList: React.FC = () => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [searchTerm,    setSearchTerm]    = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [showFilters,   setShowFilters]   = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const navigate = useNavigate();
  const { user } = useAuth();
  const isDesktop = useIsDesktop();

  const canCreate = usePermission('tasks', 'create') ||
    ['super-admin', 'admin'].includes(user?.accessLevel || '');

  const canDeleteGlobal = usePermission('tasks', 'delete') ||
    ['super-admin', 'admin'].includes(user?.accessLevel || '');

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: projectsData } = useQuery<Project[]>(
    'projects:list',
    async () => extractProjects(await getProjects()),
  );
  const projects = useMemo(() => projectsData ?? [], [projectsData]);

  const tasksKey = `tasks:list:${filterProject || 'all'}:${filterStatus || 'all'}:${debouncedSearch || ''}`;
  const { data: tasksData, loading: tasksLoading, mutate: mutateTasks } = useQuery<Task[]>(
    tasksKey,
    async () => extractTasks(await getTasks({
      project: filterProject  || undefined,
      status:  filterStatus   || undefined,
      search:  debouncedSearch || undefined,
    })),
  );
  const tasks   = useMemo(() => tasksData ?? [], [tasksData]);
  const loading = tasksLoading;

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task permanently? This cannot be undone.')) return;
    const previous = tasks;
    setDeletingId(id);
    mutateTasks(prev => (prev ?? []).filter(t => t._id !== id));
    try {
      await deleteTask(id);
      notify('Task deleted successfully');
      invalidate('tasks:list', true);
    } catch (err: any) {
      mutateTasks(previous);
      notify(
        err?.response?.data?.msg || err?.response?.data?.message || err?.message || 'Failed to delete task',
        'error',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const hasActiveFilters = searchTerm || filterProject || filterStatus;
  const clearFilters = () => { setSearchTerm(''); setFilterProject(''); setFilterStatus(''); };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .tl-root {
          min-height: 100vh;
          background: #07080e;
          background-image:
            radial-gradient(ellipse 70% 50% at 88%   0%, rgba(124,58,237,0.11) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at  8% 100%, rgba(88,80,236,0.08)  0%, transparent 55%);
          padding: 2rem 1rem 6rem;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,0.84);
        }
        @media (min-width: 768px) { .tl-root { padding: 2.75rem 2rem 6rem; } }

        .tl-surface {
          background: rgba(255,255,255,0.024);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          overflow: hidden;
        }

        /* DB-stored task number — selectable so users can copy-paste it */
        .tl-num {
          font-family: 'JetBrains Mono', 'Fira Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: rgba(124,58,237,0.85);
          background: rgba(124,58,237,0.1);
          border: 1px solid rgba(124,58,237,0.2);
          border-radius: 7px;
          padding: 3px 8px;
          white-space: nowrap;
          user-select: all;
          cursor: text;
          flex-shrink: 0;
        }
        .tl-num.legacy {
          color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.03);
          border-color: rgba(255,255,255,0.07);
        }

        .tl-status {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; padding: 4px 10px;
          border-radius: 20px; white-space: nowrap; letter-spacing: 0.02em;
        }
        .tl-status-dot {
          display: inline-block; width: 5px; height: 5px;
          border-radius: 50%; flex-shrink: 0;
        }

        .tl-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; outline: none; color: #fff;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.15s, background 0.15s;
        }
        .tl-input:focus { border-color: rgba(124,58,237,0.55); background: rgba(255,255,255,0.06); }
        .tl-input option { background: #131418; }

        .tl-table { width: 100%; border-collapse: collapse; }
        .tl-table thead tr { border-bottom: 1px solid rgba(255,255,255,0.055); }
        .tl-table thead th {
          text-align: left; padding: 14px 16px;
          font-size: 10px; font-weight: 700;
          color: rgba(255,255,255,0.25); letter-spacing: 0.13em; text-transform: uppercase; white-space: nowrap;
        }
        .tl-table thead th:first-child { padding-left: 22px; }
        .tl-table thead th:last-child  { padding-right: 22px; text-align: right; }
        .tl-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.038); transition: background 0.12s; }
        .tl-table tbody tr:last-child { border-bottom: none; }
        .tl-table tbody tr:hover { background: rgba(255,255,255,0.025); }
        .tl-table td { padding: 14px 16px; vertical-align: middle; font-size: 13px; }
        .tl-table td:first-child { padding-left: 22px; }
        .tl-table td:last-child  { padding-right: 22px; }

        .tl-card {
          background: rgba(255,255,255,0.024);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 16px;
          transition: background 0.15s, border-color 0.15s;
        }
        .tl-card:hover { background: rgba(255,255,255,0.038); border-color: rgba(255,255,255,0.11); }

        .tl-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 8px;
          color: rgba(255,255,255,0.28); transition: background 0.13s, color 0.13s; flex-shrink: 0;
        }
        .tl-btn:hover      { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.85); }
        .tl-btn.del:hover  { background: rgba(248,113,113,0.12); color: #f87171; }
        .tl-btn:disabled   { opacity: 0.35; cursor: not-allowed; }

        .tl-skel {
          background: linear-gradient(90deg,
            rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 200% 100%;
          animation: tl-shimmer 1.5s infinite ease-in-out; border-radius: 6px;
        }
        @keyframes tl-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        .tl-rule { height: 1px; background: rgba(255,255,255,0.06); margin: 12px 0; }

        .tl-stat {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12px; color: rgba(255,255,255,0.35);
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px; padding: 4px 10px; margin-top: 6px;
        }

        .tl-filter-panel {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 14px; margin-bottom: 16px;
          display: flex; flex-direction: column; gap: 10px;
        }
      `}</style>

      <div className="tl-root">
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.2, margin: 0 }}>Tasks</h1>
              <div className="tl-stat">
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: loading ? 'rgba(255,255,255,0.2)' : '#7c3aed' }} />
                {loading ? 'Loading…' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''}${hasActiveFilters ? ' · filtered' : ''}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!isDesktop && (
                <button
                  onClick={() => setShowFilters(v => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '9px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500,
                    color: hasActiveFilters ? '#a78bfa' : 'rgba(255,255,255,0.55)',
                    background: hasActiveFilters ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${hasActiveFilters ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <Filter size={14} /> {hasActiveFilters ? 'Filtered' : 'Filter'}
                </button>
              )}

              {canCreate && (
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/tasks/new')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                    padding: '9px 18px', borderRadius: 12,
                    color: '#fff', fontWeight: 600, fontSize: 13,
                    boxShadow: '0 6px 20px rgba(124,58,237,0.35)',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  <Plus size={16} /> New Task
                </motion.button>
              )}
            </div>
          </div>

          {/* ── Desktop filters ─────────────────────────────────────────── */}
          {isDesktop && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
                <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)', pointerEvents: 'none' }} />
                <input
                  placeholder="Search tasks…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="tl-input"
                  style={{ width: '100%', paddingLeft: 36, paddingRight: searchTerm ? 34 : 14, paddingTop: 9, paddingBottom: 9, fontSize: 13 }}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)', lineHeight: 0, background: 'none' }}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="tl-input" style={{ padding: '9px 12px', fontSize: 13, flex: '0 1 180px', minWidth: 140 }}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="tl-input" style={{ padding: '9px 12px', fontSize: 13, flex: '0 1 150px', minWidth: 120 }}>
                <option value="">All Status</option>
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Done">Done</option>
              </select>
              {hasActiveFilters && (
                <motion.button initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} onClick={clearFilters}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.38)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, background: 'transparent' }}
                >
                  <X size={12} /> Clear
                </motion.button>
              )}
            </div>
          )}

          {/* ── Mobile filter panel ──────────────────────────────────────── */}
          {!isDesktop && (
            <AnimatePresence>
              {showFilters && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                  <div className="tl-filter-panel">
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)', pointerEvents: 'none' }} />
                      <input placeholder="Search tasks…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="tl-input"
                        style={{ width: '100%', paddingLeft: 33, paddingRight: searchTerm ? 32 : 12, paddingTop: 9, paddingBottom: 9, fontSize: 13, boxSizing: 'border-box' }} />
                      {searchTerm && <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', lineHeight: 0, background: 'none' }}><X size={13} /></button>}
                    </div>
                    <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="tl-input" style={{ width: '100%', padding: '9px 12px', fontSize: 13, boxSizing: 'border-box' }}>
                      <option value="">All Projects</option>
                      {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="tl-input" style={{ width: '100%', padding: '9px 12px', fontSize: 13, boxSizing: 'border-box' }}>
                      <option value="">All Status</option>
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Review">Review</option>
                      <option value="Done">Done</option>
                    </select>
                    {hasActiveFilters && (
                      <button onClick={clearFilters} style={{ width: '100%', padding: '8px', fontSize: 12, fontWeight: 500, color: '#a78bfa', borderRadius: 10, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)' }}>
                        Clear all filters
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* ══════════════════════════════════════════════════════════════
              Only ONE of these renders at a time — driven by useIsDesktop(),
              not CSS. This is the fix for the "task list shown twice" bug:
              previously both the table and the cards lived in the DOM
              simultaneously and a CSS media-query toggle decided visibility,
              which could fail silently. Now only one ever mounts.
          ══════════════════════════════════════════════════════════════ */}
          {isDesktop ? (
            <div className="tl-surface">
              <table className="tl-table">
                <thead>
                  <tr>
                    <th style={{ width: 76 }}>Task #</th>
                    <th>Title</th>
                    <th>Project</th>
                    <th>Owner</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th style={{ width: 96, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i}>
                      <td><div className="tl-skel" style={{ height: 22, width: 54, borderRadius: 7 }} /></td>
                      <td><div className="tl-skel" style={{ height: 13, width: '70%', maxWidth: 260 }} /></td>
                      <td><div className="tl-skel" style={{ height: 13, width: '55%', maxWidth: 120 }} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div className="tl-skel" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                          <div className="tl-skel" style={{ height: 13, width: 72 }} />
                        </div>
                      </td>
                      <td><div className="tl-skel" style={{ height: 13, width: 48 }} /></td>
                      <td><div className="tl-skel" style={{ height: 22, width: 84, borderRadius: 20 }} /></td>
                      <td><div className="tl-skel" style={{ height: 13, width: 64 }} /></td>
                      <td><div className="tl-skel" style={{ height: 13, width: 72, marginLeft: 'auto' }} /></td>
                    </tr>
                  ))}

                  {!loading && tasks.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '60px 24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Search size={20} style={{ color: 'rgba(255,255,255,0.18)' }} />
                          </div>
                          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
                            {hasActiveFilters ? 'No tasks match your filters' : 'No tasks yet — create one to get started'}
                          </p>
                          {hasActiveFilters && <button onClick={clearFilters} style={{ color: '#7c3aed', fontSize: 12, textDecoration: 'underline', background: 'none', cursor: 'pointer' }}>Clear filters</button>}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && (
                    <AnimatePresence>
                      {tasks.map(task => {
                        const canDel     = canDeleteGlobal || (task.assigner as any)?._id?.toString() === user?._id;
                        const isDeleting = deletingId === task._id;
                        return (
                          <motion.tr
                            key={task._id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: isDeleting ? 0.3 : 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                          >
                            {/* DB-persisted task number */}
                            <td>
                              <span className={`tl-num${task.taskNumber == null ? ' legacy' : ''}`}>
                                {task.taskNumber != null ? `TM${String(task.taskNumber).padStart(4, '0')}` : '—'}
                              </span>
                            </td>

                            <td style={{ maxWidth: 300 }}>
                              <span style={{ color: '#fff', fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.title}
                              </span>
                            </td>

                            <td>
                              <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12 }}>
                                {(task.project as any)?.name || '—'}
                              </span>
                            </td>

                            {/* Owner */}
                            <td>
                              {task.assigner ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  <div style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 9, fontWeight: 700, color: '#fff',
                                    flexShrink: 0, letterSpacing: '0.03em',
                                    boxShadow: '0 0 0 1.5px rgba(124,58,237,0.3)',
                                  }}>
                                    {getInitials((task.assigner as any)?.name)}
                                  </div>
                                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                                    {(task.assigner as any)?.name}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>
                              )}
                            </td>

                            <td>
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }} className={PRIORITY_STYLES[task.priority] || 'text-zinc-400'}>
                                {task.priority || '—'}
                              </span>
                            </td>

                            <td>
                              <span className={`tl-status ${STATUS_STYLES[task.status] || 'bg-zinc-500/10 text-zinc-400'}`}>
                                <span className="tl-status-dot" style={{ background: STATUS_DOT[task.status] || 'rgba(255,255,255,0.3)' }} />
                                {task.status}
                              </span>
                            </td>

                            <td style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {task.endDate ? new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                            </td>

                            <td>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                                <button onClick={() => navigate(`/tasks/${task._id}`)}      className="tl-btn"     title="View"><Eye    size={14} /></button>
                                <button onClick={() => navigate(`/tasks/${task._id}/edit`)} className="tl-btn"     title="Edit"><Edit   size={14} /></button>
                                {canDel && (
                                  <button onClick={() => handleDelete(task._id)} disabled={isDeleting} className="tl-btn del" title="Delete">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="tl-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div className="tl-skel" style={{ height: 22, width: 54, borderRadius: 7 }} />
                    <div className="tl-skel" style={{ height: 22, width: 80, borderRadius: 20 }} />
                  </div>
                  <div className="tl-skel" style={{ height: 16, width: '72%', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div className="tl-skel" style={{ height: 12, width: 80 }} />
                    <div className="tl-skel" style={{ height: 12, width: 48 }} />
                  </div>
                  <div className="tl-rule" />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    {[0,1,2].map(k => <div key={k} className="tl-skel" style={{ height: 28, width: 28, borderRadius: 8 }} />)}
                  </div>
                </div>
              ))}

              {!loading && tasks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Search size={20} style={{ color: 'rgba(255,255,255,0.18)' }} />
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
                      {hasActiveFilters ? 'No tasks match your filters' : 'No tasks yet'}
                    </p>
                    {hasActiveFilters && <button onClick={clearFilters} style={{ color: '#7c3aed', fontSize: 13, textDecoration: 'underline', background: 'none', cursor: 'pointer' }}>Clear filters</button>}
                  </div>
                </div>
              )}

              {!loading && (
                <AnimatePresence>
                  {tasks.map(task => {
                    const canDel     = canDeleteGlobal || (task.assigner as any)?._id?.toString() === user?._id;
                    const isDeleting = deletingId === task._id;
                    return (
                      <motion.div
                        key={task._id}
                        className="tl-card"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: isDeleting ? 0.3 : 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, padding: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span className={`tl-num${task.taskNumber == null ? ' legacy' : ''}`}>
                            {task.taskNumber != null ? `TM${String(task.taskNumber).padStart(4, '0')}` : '—'}
                          </span>
                          <span className={`tl-status ${STATUS_STYLES[task.status] || 'bg-zinc-500/10 text-zinc-400'}`}>
                            <span className="tl-status-dot" style={{ background: STATUS_DOT[task.status] || 'rgba(255,255,255,0.3)' }} />
                            {task.status}
                          </span>
                        </div>

                        <p style={{ color: '#fff', fontWeight: 600, fontSize: 14, margin: '0 0 8px', lineHeight: 1.4 }}>
                          {task.title}
                        </p>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 12 }}>
                          {(task.project as any)?.name && (
                            <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>{(task.project as any).name}</span>
                          )}
                          {task.assigner && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <span style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0,
                              }}>
                                {getInitials((task.assigner as any)?.name)}
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                {(task.assigner as any)?.name}
                              </span>
                            </span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 700 }} className={PRIORITY_STYLES[task.priority] || ''}>
                            {task.priority}
                          </span>
                          {task.endDate && (
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                              Due {new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>

                        <div className="tl-rule" />

                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => navigate(`/tasks/${task._id}`)}      className="tl-btn"     title="View"><Eye    size={15} /></button>
                          <button onClick={() => navigate(`/tasks/${task._id}/edit`)} className="tl-btn"     title="Edit"><Edit   size={15} /></button>
                          {canDel && (
                            <button onClick={() => handleDelete(task._id)} disabled={isDeleting} className="tl-btn del" title="Delete">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
};