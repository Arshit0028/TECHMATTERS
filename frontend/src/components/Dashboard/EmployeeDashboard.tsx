import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import {
  getProjects, getTasks, getActivities,
  getReimbursements, getUsers, updateProject
} from '../../api/client';
import type { Project, Task, Activity, Reimbursement } from '../types/index';
import {
  FolderKanban, CheckSquare, Activity as ActivityIcon, Receipt,
  FileText, Download, ChevronRight, Users,
  X, Check, Search, AlertCircle,
  Layers, RefreshCw, TrendingUp, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { downloadPDF } from '../utils/exportPDF';
import { downloadCSV } from '../utils/exportCSV';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TeamMember {
  _id: string; name: string; email: string;
  accessLevel: string; status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const userBelongsToProject = (project: Project, userId: string): boolean => {
  if (!userId) return false;
  const isMember = (project.teamMembers || []).some((m: any) => {
    const id = typeof m === 'string' ? m : m?._id;
    return String(id) === String(userId);
  });
  const managerId = project.projectManager
    ? (typeof project.projectManager === 'string'
        ? project.projectManager
        : (project.projectManager as any)?._id || '')
    : '';
  const createdById = project.createdBy
    ? (typeof project.createdBy === 'string'
        ? project.createdBy
        : (project.createdBy as any)?._id || '')
    : '';
  return isMember || String(managerId) === String(userId) || String(createdById) === String(userId);
};

const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { color: string; bg: string; dot: string }> = {
  Active:        { color: '#059669', bg: 'rgba(16,185,129,0.12)',  dot: '#10b981' },
  Completed:     { color: '#2563eb', bg: 'rgba(59,130,246,0.12)',  dot: '#3b82f6' },
  'In Progress': { color: '#d97706', bg: 'rgba(245,158,11,0.12)',  dot: '#f59e0b' },
  Done:          { color: '#059669', bg: 'rgba(16,185,129,0.12)',  dot: '#10b981' },
  Approved:      { color: '#059669', bg: 'rgba(16,185,129,0.12)',  dot: '#10b981' },
  Pending:       { color: '#d97706', bg: 'rgba(245,158,11,0.12)',  dot: '#f59e0b' },
  Rejected:      { color: '#dc2626', bg: 'rgba(239,68,68,0.12)',   dot: '#ef4444' },
  Planned:       { color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  dot: '#818cf8' },
  'On Hold':     { color: '#ea580c', bg: 'rgba(249,115,22,0.12)',  dot: '#f97316' },
};
const statusStyle = (s: string) => STATUS_MAP[s] || STATUS_MAP.Planned;

// ─── Assign Team Modal ────────────────────────────────────────────────────────
const AssignTeamModal: React.FC<{
  project: Project;
  onClose: () => void;
  onSaved: (updated: Project) => void;
}> = ({ project, onClose, onSaved }) => {
  const [allUsers, setAllUsers] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<string[]>(
    (project.teamMembers || []).map((m: any) => typeof m === 'string' ? m : m._id)
  );
  const [manager, setManager] = useState<string>(
    typeof project.projectManager === 'string'
      ? project.projectManager
      : (project.projectManager as any)?._id || ''
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    getUsers(1, 100)
      .then(res => {
        const users: TeamMember[] = res.data.users ?? res.data ?? [];
        setAllUsers(users.filter(u => u.status === 'active'));
      })
      .catch(() => setError('Failed to load users'));
  }, []);

  const filtered = allUsers.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const res = await updateProject(project._id, { teamMembers: selected, projectManager: manager || undefined });
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Failed to update team');
    } finally { setSaving(false); }
  };

  const GRAD: Record<string, string> = {
    manager:       'linear-gradient(135deg,#7c3aed,#6366f1)',
    admin:         'linear-gradient(135deg,#d97706,#f59e0b)',
    'super-admin': 'linear-gradient(135deg,#dc2626,#f87171)',
    tech:          'linear-gradient(135deg,#0891b2,#06b6d4)',
    entry:         'linear-gradient(135deg,#475569,#64748b)',
  };

  return (
    <div className="edb-modal-overlay" onClick={onClose}>
      <motion.div
        className="edb-modal-box"
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 24 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="edb-modal-header">
          <div>
            <div className="edb-modal-tag">Team Assignment</div>
            <h2 className="edb-modal-title">{project.name}</h2>
          </div>
          <button className="edb-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="edb-modal-section">
          <label className="edb-modal-label"><Users size={11} /> Project Manager</label>
          <select className="edb-modal-select" value={manager} onChange={e => setManager(e.target.value)}>
            <option value="">No manager assigned</option>
            {allUsers
              .filter(u => ['manager','admin','super-admin'].includes(u.accessLevel))
              .map(u => <option key={u._id} value={u._id}>{u.name}</option>)
            }
          </select>
        </div>

        <div className="edb-modal-section" style={{ paddingBottom: 0 }}>
          <label className="edb-modal-label">
            <Users size={11} /> Team Members
            <span className="edb-modal-count">{selected.length} selected</span>
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              className="edb-modal-search"
              placeholder="Search members…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="edb-modal-list">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '2rem 0' }}>
              No members found
            </div>
          ) : filtered.map(u => {
            const isSel = selected.includes(u._id);
            return (
              <div key={u._id} className={`edb-modal-member${isSel ? ' selected' : ''}`} onClick={() => toggle(u._id)}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: GRAD[u.accessLevel] || GRAD.entry, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {getInitials(u.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: 'block' }}>{u.name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{u.accessLevel} · {u.email}</span>
                </div>
                <div className={`edb-modal-check${isSel ? ' checked' : ''}`}>
                  {isSel && <Check size={10} strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 1.4rem', color: 'var(--color-danger-text)', fontSize: 12.5, background: 'var(--color-danger-bg)', borderTop: '1px solid var(--border-default)' }}>
            <AlertCircle size={13} />{error}
          </div>
        )}

        <div className="edb-modal-footer">
          <button className="edb-modal-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="edb-modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving
              ? <div className="edb-spinner-sm" />
              : <Check size={13} />
            }
            {saving ? 'Saving…' : 'Assign Team'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export const EmployeeDashboard: React.FC = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [projects,       setProjects]       = useState<Project[]>([]);
  const [tasks,          setTasks]          = useState<Task[]>([]);
  const [activities,     setActivities]     = useState<Activity[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [refreshTick,    setRefreshTick]    = useState(0);
  const [reportYear,     setReportYear]     = useState(new Date().getFullYear());
  const [reportMonth,    setReportMonth]    = useState(new Date().getMonth() + 1);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [assignProject,  setAssignProject]  = useState<Project | null>(null);

  const isManager = ['manager','admin','super-admin'].includes(user?.accessLevel || '');
  const userId    = user?._id ?? null;

  useEffect(() => {
    if (!userId) return;
    let aborted = false;
    setLoading(true);
    setError('');

    (async () => {
      const [pRes, tRes, aRes, rRes] = await Promise.allSettled([
        getProjects(),
        getTasks({ assignee: userId }),
        getActivities({ assignee: userId }),
        getReimbursements(),
      ]);
      if (aborted) return;

      if (pRes.status === 'fulfilled') {
        const d = pRes.value.data as Project[] | { projects: Project[] };
        setProjects(Array.isArray(d) ? d : (d?.projects ?? []));
      }
      if (tRes.status === 'fulfilled') setTasks(Array.isArray(tRes.value.data) ? tRes.value.data : []);
      if (aRes.status === 'fulfilled') setActivities(Array.isArray(aRes.value.data) ? aRes.value.data : []);
      if (rRes.status === 'fulfilled') setReimbursements(Array.isArray(rRes.value.data) ? rRes.value.data : []);

      const allFailed = [pRes, tRes, aRes, rRes].every(r => r.status === 'rejected');
      if (allFailed) setError('Could not load dashboard data. Please check your connection and try again.');

      setLoading(false);
    })();

    return () => { aborted = true; };
  }, [userId, refreshTick]);

  const handleRefresh = () => setRefreshTick(t => t + 1);

  const handleGenerateReport = async (format: 'pdf' | 'csv') => {
    if (projects.length === 0 && activities.length === 0) {
      alert('No project or activity data found for this period.');
      return;
    }
    setGeneratingReport(true);
    const monthLabel = new Date(reportYear, reportMonth - 1).toLocaleString('default', { month: 'long' });
    try {
      if (format === 'pdf') await downloadPDF(user?.name || 'Employee', monthLabel, reportYear, projects, activities);
      else downloadCSV(user?.name || 'Employee', monthLabel, reportYear, projects, activities);
    } catch { alert('Failed to generate report'); }
    finally { setGeneratingReport(false); }
  };

  const onTeamSaved = (updated: Project) =>
    setProjects(prev => prev.map(p => p._id === updated._id ? updated : p));

  const completedStatuses = ['Review','Done','Completed'];
  const tasksDone = tasks.filter(t => completedStatuses.includes(t.status)).length;
  const tasksPct  = tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const myProjects = projects.filter(p => userBelongsToProject(p, userId || ''));

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, transition: 'background 0.35s' }}>
        <div className="edb-pulse-ring" />
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
          Loading workspace…
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        /* ── Import Inter ─────────────────────────────────────────────────── */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        /* ── Base reset ───────────────────────────────────────────────────── */
        .edb-root *, .edb-root *::before, .edb-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Root layout ──────────────────────────────────────────────────── */
        .edb-root {
          min-height: 100vh;
          background: var(--bg-app);
          padding: 2.5rem 2rem 6rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: var(--text-primary);
          transition: background 0.35s ease, color 0.35s ease;
        }
        .edb-container { max-width: 1100px; margin: 0 auto; }

        /* ── Welcome header ───────────────────────────────────────────────── */
        .edb-welcome {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 16px;
          flex-wrap: wrap; margin-bottom: 2.5rem;
        }
        .edb-eyebrow {
          font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--color-primary);
          margin-bottom: 8px; opacity: 0.8;
        }
        .edb-greeting {
          font-size: 2rem; font-weight: 700;
          letter-spacing: -0.03em; line-height: 1.15;
          color: var(--text-primary);
        }
        .edb-greeting em {
          font-style: normal;
          background: linear-gradient(120deg, var(--color-primary) 20%, #818cf8 80%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .edb-sub { font-size: 14px; color: var(--text-secondary); margin-top: 6px; font-weight: 400; }

        /* ── Refresh button ───────────────────────────────────────────────── */
        .edb-refresh-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px; border-radius: 10px; margin-top: 4px; flex-shrink: 0;
          background: var(--bg-surface); border: 1px solid var(--border-default);
          color: var(--text-secondary); font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 500; cursor: pointer;
          transition: all 0.18s; box-shadow: var(--shadow-xs);
        }
        .edb-refresh-btn:hover:not(:disabled) {
          background: var(--bg-surface-2);
          color: var(--color-primary);
          border-color: var(--color-primary);
          box-shadow: var(--shadow-sm);
        }
        .edb-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .edb-refresh-btn.spinning svg { animation: edb-spin 0.85s linear infinite; }

        /* ── Error banner ─────────────────────────────────────────────────── */
        .edb-error {
          display: flex; align-items: center; gap: 10px;
          background: var(--color-danger-bg);
          border: 1px solid var(--border-default);
          border-left: 4px solid var(--color-danger);
          border-radius: 12px; padding: 14px 18px;
          color: var(--color-danger-text);
          font-size: 13.5px; margin-bottom: 1.5rem;
          box-shadow: var(--shadow-sm);
        }
        .edb-error-retry {
          margin-left: auto; flex-shrink: 0;
          background: var(--color-danger); border: none;
          border-radius: 8px; color: #fff;
          font-family: 'Inter', sans-serif;
          font-size: 12px; font-weight: 600;
          cursor: pointer; padding: 6px 14px; transition: all 0.15s;
        }
        .edb-error-retry:hover { opacity: 0.88; transform: translateY(-1px); }

        /* ── Stats grid ───────────────────────────────────────────────────── */
        .edb-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px; margin-bottom: 2.5rem;
        }
        .edb-stat-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xl);
          padding: 1.4rem 1.5rem;
          box-shadow: var(--shadow-sm);
          transition: all 0.22s ease;
          position: relative; overflow: hidden;
          cursor: default;
        }
        .edb-stat-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--stat-accent, var(--color-primary));
          opacity: 0; transition: opacity 0.22s;
        }
        .edb-stat-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
        .edb-stat-card:hover::before { opacity: 1; }

        .edb-stat-icon {
          width: 42px; height: 42px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px; font-size: 19px;
        }
        .edb-stat-num {
          font-size: 2.2rem; font-weight: 800;
          letter-spacing: -0.04em; color: var(--text-primary); line-height: 1;
        }
        .edb-stat-label {
          font-size: 12px; font-weight: 500;
          color: var(--text-secondary); margin-top: 5px;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .edb-stat-bar {
          height: 3px; background: var(--border-default);
          border-radius: 2px; margin-top: 16px; overflow: hidden;
        }
        .edb-stat-bar-fill {
          height: 100%; border-radius: 2px;
          transition: width 1.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .edb-stat-bar-pct {
          font-size: 11px; color: var(--text-tertiary);
          margin-top: 5px; font-weight: 500;
        }

        /* ── Section headers ──────────────────────────────────────────────── */
        .edb-sec-row {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 1rem;
        }
        .edb-sec-label {
          font-size: 13px; font-weight: 700;
          color: var(--text-primary); letter-spacing: 0.01em;
        }
        .edb-sec-link {
          font-size: 13px; color: var(--color-primary);
          background: none; border: none; cursor: pointer;
          display: flex; align-items: center; gap: 3px;
          font-family: 'Inter', sans-serif; font-weight: 500;
          transition: color 0.15s; padding: 4px 8px;
          border-radius: 8px;
        }
        .edb-sec-link:hover { background: var(--color-primary-light); }

        /* ── Divider ──────────────────────────────────────────────────────── */
        .edb-divider { height: 1px; background: var(--border-default); margin: 0 0 2.5rem; }

        /* ── Project cards ────────────────────────────────────────────────── */
        .edb-proj-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .edb-proj-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xl);
          padding: 1.3rem; cursor: pointer;
          display: flex; flex-direction: column; gap: 12px;
          transition: all 0.22s ease;
          box-shadow: var(--shadow-sm);
        }
        .edb-proj-card:hover {
          border-color: var(--color-primary);
          transform: translateY(-3px);
          box-shadow: var(--shadow-md);
        }
        .edb-proj-name {
          font-size: 14px; font-weight: 600;
          color: var(--text-primary); line-height: 1.35;
        }
        .edb-proj-desc {
          font-size: 12.5px; color: var(--text-secondary);
          line-height: 1.6;
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
        }
        .edb-proj-progress-label {
          font-size: 11px; color: var(--text-tertiary);
          font-weight: 500; margin-bottom: 6px;
        }
        .edb-proj-progress-bar {
          height: 4px; background: var(--border-default);
          border-radius: 2px; overflow: hidden;
        }
        .edb-proj-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-primary), #818cf8);
          border-radius: 2px; transition: width 1s ease;
        }
        .edb-proj-team-row {
          display: flex; align-items: center;
          justify-content: space-between; margin-top: auto;
        }
        .edb-proj-avatars { display: flex; }
        .edb-proj-avatar {
          width: 24px; height: 24px; border-radius: 50%;
          background: linear-gradient(135deg, var(--color-primary), #818cf8);
          display: flex; align-items: center; justify-content: center;
          font-size: 8px; font-weight: 700; color: #fff;
          border: 2px solid var(--bg-surface);
          margin-left: -6px;
        }
        .edb-proj-avatar:first-child { margin-left: 0; }
        .edb-proj-no-team { font-size: 12px; color: var(--text-tertiary); }
        .edb-assign-btn {
          display: flex; align-items: center; gap: 4px;
          padding: 5px 10px; border-radius: 8px;
          background: var(--color-primary-light);
          border: 1px solid var(--color-primary);
          color: var(--color-primary);
          font-size: 11px; font-weight: 600;
          cursor: pointer; transition: all 0.18s;
          font-family: 'Inter', sans-serif;
        }
        .edb-assign-btn:hover { background: var(--color-primary); color: #fff; }

        /* ── Badge ────────────────────────────────────────────────────────── */
        .edb-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 999px;
          font-size: 11px; font-weight: 600; white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .edb-badge-dot {
          width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
        }

        /* ── Task list ────────────────────────────────────────────────────── */
        .edb-task-list { display: flex; flex-direction: column; gap: 8px; }
        .edb-task-row {
          display: flex; align-items: center; gap: 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: 13px 16px;
          transition: all 0.18s;
          box-shadow: var(--shadow-xs);
        }
        .edb-task-row:hover {
          border-color: var(--color-primary);
          box-shadow: var(--shadow-sm);
          transform: translateX(3px);
        }
        .edb-task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .edb-task-title { font-size: 14px; color: var(--text-primary); font-weight: 500; flex: 1; }
        .edb-task-project { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; font-weight: 500; }

        /* ── Report card ──────────────────────────────────────────────────── */
        .edb-report-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xl);
          padding: 1.75rem;
          margin-bottom: 2.75rem;
          box-shadow: var(--shadow-sm);
          position: relative; overflow: hidden;
        }
        .edb-report-card::after {
          content: '';
          position: absolute; bottom: -40px; right: -40px;
          width: 200px; height: 200px; border-radius: 50%;
          background: radial-gradient(circle, rgba(79,70,229,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .edb-report-header { display: flex; align-items: center; gap: 12px; margin-bottom: 1.5rem; }
        .edb-report-icon {
          width: 42px; height: 42px; border-radius: 12px;
          background: var(--color-primary-light);
          display: flex; align-items: center; justify-content: center;
          color: var(--color-primary); flex-shrink: 0;
        }
        .edb-report-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
        .edb-report-sub { font-size: 12.5px; color: var(--text-secondary); margin-top: 2px; }
        .edb-report-controls {
          display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap;
        }
        .edb-report-field { display: flex; flex-direction: column; gap: 6px; }
        .edb-report-label {
          font-size: 11px; font-weight: 600; color: var(--text-tertiary);
          letter-spacing: 0.07em; text-transform: uppercase;
        }
        .edb-report-select {
          background: var(--bg-surface-2);
          border: 1px solid var(--border-default);
          border-radius: 10px; color: var(--text-primary);
          font-family: 'Inter', sans-serif; font-size: 13px;
          padding: 9px 14px; outline: none; cursor: pointer;
          transition: border-color 0.2s; min-width: 120px;
          -webkit-appearance: none;
        }
        .edb-report-select:focus { border-color: var(--color-primary); }

        /* ── Report / action buttons ──────────────────────────────────────── */
        .edb-report-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 20px; border-radius: 10px; border: none;
          font-size: 13px; font-weight: 600;
          font-family: 'Inter', sans-serif; cursor: pointer;
          transition: all 0.2s ease; color: #fff;
          box-shadow: var(--shadow-sm);
        }
        .edb-report-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .edb-report-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .edb-report-btn.pdf { background: linear-gradient(135deg, #4F46E5, #7C3AED); }
        .edb-report-btn.csv { background: linear-gradient(135deg, #059669, #10B981); }

        /* ── Quick actions ────────────────────────────────────────────────── */
        .edb-qa-grid {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 12px;
        }
        .edb-qa-btn {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xl);
          padding: 1.35rem 1rem; text-align: center; cursor: pointer;
          transition: all 0.22s ease;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          font-family: 'Inter', sans-serif;
          box-shadow: var(--shadow-sm);
        }
        .edb-qa-btn:hover {
          border-color: var(--color-primary);
          transform: translateY(-3px);
          box-shadow: var(--shadow-md);
        }
        .edb-qa-icon {
          width: 44px; height: 44px; border-radius: 13px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.22s;
        }
        .edb-qa-btn:hover .edb-qa-icon { transform: scale(1.1); }
        .edb-qa-label { font-size: 12.5px; color: var(--text-secondary); font-weight: 500; }

        /* ── Empty states ─────────────────────────────────────────────────── */
        .edb-empty {
          text-align: center; color: var(--text-tertiary);
          font-size: 13.5px; padding: 2.5rem 0;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          background: var(--bg-surface-2);
          border: 1px dashed var(--border-default);
          border-radius: var(--radius-lg);
        }

        /* ── Modal ────────────────────────────────────────────────────────── */
        .edb-modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: var(--bg-overlay);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .edb-modal-box {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 22px; width: 100%; max-width: 490px;
          display: flex; flex-direction: column;
          max-height: 88vh; overflow: hidden;
          box-shadow: var(--shadow-xl);
        }
        .edb-modal-header {
          display: flex; align-items: flex-start;
          justify-content: space-between;
          padding: 1.4rem 1.4rem 1rem;
          border-bottom: 1px solid var(--border-default);
        }
        .edb-modal-tag {
          font-size: 10px; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--color-primary);
          font-weight: 600; margin-bottom: 4px;
        }
        .edb-modal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .edb-modal-close {
          background: var(--bg-surface-2); border: 1px solid var(--border-default);
          border-radius: 8px; color: var(--text-tertiary);
          cursor: pointer; padding: 6px; display: flex; transition: all 0.15s;
        }
        .edb-modal-close:hover { background: var(--bg-surface-3); color: var(--text-primary); }
        .edb-modal-section { padding: 1rem 1.4rem; }
        .edb-modal-label {
          font-size: 11px; font-weight: 600; color: var(--text-tertiary);
          letter-spacing: 0.08em; text-transform: uppercase;
          display: flex; align-items: center; gap: 5px; margin-bottom: 8px;
        }
        .edb-modal-count {
          margin-left: auto; font-size: 11px; color: var(--color-primary);
          background: var(--color-primary-light); border-radius: 999px;
          padding: 2px 9px; letter-spacing: 0;
        }
        .edb-modal-select {
          width: 100%; background: var(--bg-surface-2);
          border: 1px solid var(--border-default); border-radius: 10px;
          color: var(--text-primary); font-family: 'Inter', sans-serif;
          font-size: 13px; padding: 9px 14px; outline: none;
          transition: border-color 0.2s; -webkit-appearance: none;
        }
        .edb-modal-select:focus { border-color: var(--color-primary); }
        .edb-modal-search {
          width: 100%; background: var(--bg-surface-2);
          border: 1px solid var(--border-default); border-radius: 10px;
          color: var(--text-primary); font-family: 'Inter', sans-serif;
          font-size: 13px; padding: 9px 12px 9px 34px; outline: none;
          transition: border-color 0.2s;
        }
        .edb-modal-search::placeholder { color: var(--text-tertiary); }
        .edb-modal-search:focus { border-color: var(--color-primary); }
        .edb-modal-list {
          flex: 1; overflow-y: auto; padding: 6px 1.4rem;
          max-height: 270px; scrollbar-width: thin;
          scrollbar-color: var(--border-strong) transparent;
        }
        .edb-modal-member {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 11px; border-radius: 10px;
          border: 1px solid transparent; cursor: pointer;
          transition: all 0.15s; margin-bottom: 3px;
        }
        .edb-modal-member:hover { background: var(--bg-surface-2); border-color: var(--border-default); }
        .edb-modal-member.selected { background: var(--color-primary-light); border-color: var(--color-primary); }
        .edb-modal-check {
          width: 18px; height: 18px; border-radius: 5px;
          border: 1.5px solid var(--border-strong);
          background: var(--bg-surface-2);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; color: #fff; transition: all 0.15s;
        }
        .edb-modal-check.checked { background: var(--color-primary); border-color: var(--color-primary); }
        .edb-modal-footer {
          display: flex; gap: 10px; padding: 1rem 1.4rem;
          border-top: 1px solid var(--border-default);
          background: var(--bg-surface-2);
        }
        .edb-modal-btn-ghost {
          flex: 1; background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 10px; color: var(--text-secondary);
          font-family: 'Inter', sans-serif; font-size: 13px;
          font-weight: 500; cursor: pointer; padding: 10px;
          transition: all 0.18s;
        }
        .edb-modal-btn-ghost:hover { background: var(--bg-surface-3); color: var(--text-primary); }
        .edb-modal-btn-primary {
          flex: 2;
          background: linear-gradient(135deg, var(--color-primary), #6366f1);
          border: none; border-radius: 10px; color: #fff;
          font-family: 'Inter', sans-serif; font-size: 13px;
          font-weight: 600; cursor: pointer; padding: 10px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          transition: all 0.2s; box-shadow: 0 4px 14px rgba(79,70,229,0.3);
        }
        .edb-modal-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(79,70,229,0.42); }
        .edb-modal-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        /* ── Utilities ────────────────────────────────────────────────────── */
        .edb-pulse-ring {
          width: 38px; height: 38px; border-radius: 50%;
          border: 2.5px solid var(--border-default);
          border-top-color: var(--color-primary);
          animation: edb-spin 0.85s linear infinite;
        }
        .edb-spinner-sm {
          width: 13px; height: 13px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          animation: edb-spin 0.7s linear infinite;
        }
        @keyframes edb-spin { to { transform: rotate(360deg); } }

        /* ── Responsive ───────────────────────────────────────────────────── */
        @media (max-width: 900px) {
          .edb-proj-grid { grid-template-columns: repeat(2,1fr); }
          .edb-stats     { grid-template-columns: repeat(2,1fr); }
          .edb-qa-grid   { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 560px) {
          .edb-proj-grid { grid-template-columns: 1fr; }
          .edb-greeting  { font-size: 1.6rem; }
          .edb-root      { padding: 1.5rem 1rem 5rem; }
          .edb-qa-grid   { grid-template-columns: repeat(2,1fr); }
        }
      `}</style>

      <div className="edb-root">
        <div className="edb-container">

          {/* ── Welcome ─────────────────────────────────────────────────────── */}
          <motion.div
            className="edb-welcome"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16,1,0.3,1] }}
          >
            <div>
              <div className="edb-eyebrow">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </div>
              <h1 className="edb-greeting">
                {greeting}, <em>{user?.name?.split(' ')[0]}</em> 👋
              </h1>
              <p className="edb-sub">Here's your workspace overview for today</p>
            </div>

            <button
              className={`edb-refresh-btn${loading ? ' spinning' : ''}`}
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh dashboard"
            >
              <RefreshCw size={14} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </motion.div>

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <motion.div className="edb-error" initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              {error}
              <button className="edb-error-retry" onClick={handleRefresh}>Try again</button>
            </motion.div>
          )}

          {/* ── Stats ─────────────────────────────────────────────────────── */}
          <motion.div
            className="edb-stats"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            {[
              {
                label: 'My Projects',
                num:   myProjects.length,
                icon:  <Layers size={18} />,
                iconBg: 'linear-gradient(135deg,rgba(79,70,229,0.15),rgba(129,140,248,0.15))',
                iconColor: '#4F46E5',
                accent: '#4F46E5',
                bar: null,
              },
              {
                label: 'My Tasks',
                num:   tasks.length,
                icon:  <CheckSquare size={18} />,
                iconBg: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(52,211,153,0.15))',
                iconColor: '#059669',
                accent: '#10B981',
                bar: { pct: tasksPct, color: 'linear-gradient(90deg,#059669,#34d399)' },
              },
              {
                label: 'Activities',
                num:   activities.length,
                icon:  <TrendingUp size={18} />,
                iconBg: 'linear-gradient(135deg,rgba(59,130,246,0.15),rgba(96,165,250,0.15))',
                iconColor: '#2563EB',
                accent: '#3B82F6',
                bar: null,
              },
              {
                label: 'Reimbursements',
                num:   reimbursements.length,
                icon:  <Receipt size={18} />,
                iconBg: 'linear-gradient(135deg,rgba(249,115,22,0.15),rgba(251,146,60,0.15))',
                iconColor: '#EA580C',
                accent: '#F97316',
                bar: null,
              },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className="edb-stat-card"
                style={{ '--stat-accent': s.accent } as React.CSSProperties}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.07, duration: 0.38 }}
              >
                <div className="edb-stat-icon" style={{ background: s.iconBg, color: s.iconColor }}>
                  {s.icon}
                </div>
                <div className="edb-stat-num">{s.num}</div>
                <div className="edb-stat-label">{s.label}</div>
                {s.bar && (
                  <>
                    <div className="edb-stat-bar">
                      <div className="edb-stat-bar-fill" style={{ width: `${s.bar.pct}%`, background: s.bar.color }} />
                    </div>
                    <div className="edb-stat-bar-pct">{s.bar.pct}% complete</div>
                  </>
                )}
              </motion.div>
            ))}
          </motion.div>

          <div className="edb-divider" />

          {/* ── My Projects ───────────────────────────────────────────────── */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div className="edb-sec-row">
              <span className="edb-sec-label">My Projects</span>
              <button className="edb-sec-link" onClick={() => navigate('/projects')}>
                View all <ChevronRight size={13} />
              </button>
            </div>

            {myProjects.length === 0 ? (
              <div className="edb-empty">
                <FolderKanban size={32} style={{ color: 'var(--text-tertiary)' }} />
                <span>No projects assigned yet</span>
              </div>
            ) : (
              <div className="edb-proj-grid">
                {myProjects.slice(0, 6).map((project, i) => {
                  const sc      = statusStyle(project.status);
                  const teamArr: any[] = project.teamMembers || [];
                  return (
                    <motion.div
                      key={project._id}
                      className="edb-proj-card"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.18 + i * 0.065, duration: 0.36 }}
                      onClick={() => navigate(`/projects/${project._id}`)}
                    >
                      {/* Name + status badge */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div className="edb-proj-name">{project.name}</div>
                        <span
                          className="edb-badge"
                          style={{ background: sc.bg, color: sc.color, flexShrink: 0 }}
                        >
                          <span className="edb-badge-dot" style={{ background: sc.dot }} />
                          {project.status}
                        </span>
                      </div>

                      {project.description && (
                        <p className="edb-proj-desc">{project.description}</p>
                      )}

                      {project.progress !== undefined && (
                        <div>
                          <div className="edb-proj-progress-label">
                            {project.progress ?? 0}% complete
                          </div>
                          <div className="edb-proj-progress-bar">
                            <div className="edb-proj-progress-fill" style={{ width: `${project.progress ?? 0}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="edb-proj-team-row">
                        {teamArr.length > 0 ? (
                          <div className="edb-proj-avatars">
                            {teamArr.slice(0, 4).map((m: any, idx: number) => {
                              const nm = typeof m === 'string'
                                ? m.slice(0, 2).toUpperCase()
                                : (m.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?');
                              return (
                                <div key={idx} className="edb-proj-avatar" title={typeof m === 'object' ? m.name : ''}>
                                  {nm}
                                </div>
                              );
                            })}
                            {teamArr.length > 4 && (
                              <div className="edb-proj-avatar" style={{ background: 'var(--bg-surface-3)', color: 'var(--text-secondary)' }}>
                                +{teamArr.length - 4}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="edb-proj-no-team">No team assigned</span>
                        )}
                        {isManager && (
                          <button
                            className="edb-assign-btn"
                            onClick={e => { e.stopPropagation(); setAssignProject(project); }}
                          >
                            <Users size={10} /> Assign
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── My Tasks ──────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div className="edb-sec-row">
              <span className="edb-sec-label">My Tasks</span>
              <button className="edb-sec-link" onClick={() => navigate('/tasks')}>
                View all <ChevronRight size={13} />
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="edb-empty">
                <CheckSquare size={32} style={{ color: 'var(--text-tertiary)' }} />
                <span>No tasks yet — create one from the Tasks page</span>
              </div>
            ) : (
              <div className="edb-task-list">
                {tasks.slice(0, 5).map((task, i) => {
                  const sc = statusStyle(task.status);
                  return (
                    <motion.div
                      key={task._id}
                      className="edb-task-row"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.22 + i * 0.055, duration: 0.34 }}
                    >
                      <div className="edb-task-dot" style={{ background: sc.dot }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="edb-task-title">{task.title}</div>
                        {(task.project as any)?.name && (
                          <div className="edb-task-project">{(task.project as any).name}</div>
                        )}
                      </div>
                      <span className="edb-badge" style={{ background: sc.bg, color: sc.color }}>
                        <span className="edb-badge-dot" style={{ background: sc.dot }} />
                        {task.status}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="edb-divider" />

          {/* ── Monthly Report ────────────────────────────────────────────── */}
          <motion.div
            className="edb-report-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            <div className="edb-report-header">
              <div className="edb-report-icon"><FileText size={18} /></div>
              <div>
                <div className="edb-report-title">Monthly Report</div>
                <div className="edb-report-sub">Export your work summary as PDF or CSV</div>
              </div>
            </div>

            <div className="edb-report-controls">
              <div className="edb-report-field">
                <span className="edb-report-label">Year</span>
                <select
                  className="edb-report-select"
                  value={reportYear}
                  onChange={e => setReportYear(Number(e.target.value))}
                >
                  {[2023, 2024, 2025, 2026].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="edb-report-field">
                <span className="edb-report-label">Month</span>
                <select
                  className="edb-report-select"
                  value={reportMonth}
                  onChange={e => setReportMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="edb-report-btn pdf"
                onClick={() => handleGenerateReport('pdf')}
                disabled={generatingReport}
              >
                {generatingReport ? <div className="edb-spinner-sm" /> : <Download size={14} />}
                {generatingReport ? 'Generating…' : 'Export PDF'}
              </button>

              <button
                className="edb-report-btn csv"
                onClick={() => handleGenerateReport('csv')}
                disabled={generatingReport}
              >
                {generatingReport ? <div className="edb-spinner-sm" /> : <Download size={14} />}
                {generatingReport ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </motion.div>

          {/* ── Quick Actions ──────────────────────────────────────────────── */}
          <div>
            <div className="edb-sec-row" style={{ marginBottom: '1rem' }}>
              <span className="edb-sec-label">Quick Actions</span>
            </div>

            <div className="edb-qa-grid">
              {[
                {
                  label: 'New Claim',
                  icon: <Receipt size={20} />,
                  bg: 'linear-gradient(135deg,rgba(249,115,22,0.15),rgba(251,146,60,0.15))',
                  color: '#EA580C',
                  path: '/reimbursements/new',
                },
                {
                  label: 'Activities',
                  icon: <ActivityIcon size={20} />,
                  bg: 'linear-gradient(135deg,rgba(59,130,246,0.15),rgba(96,165,250,0.15))',
                  color: '#2563EB',
                  path: '/activities',
                },
                {
                  label: 'Projects',
                  icon: <FolderKanban size={20} />,
                  bg: 'linear-gradient(135deg,rgba(79,70,229,0.15),rgba(129,140,248,0.15))',
                  color: '#4F46E5',
                  path: '/projects',
                },
                {
                  label: 'All Tasks',
                  icon: <CheckSquare size={20} />,
                  bg: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(52,211,153,0.15))',
                  color: '#059669',
                  path: '/tasks',
                },
              ].map((a, i) => (
                <motion.button
                  key={a.label}
                  className="edb-qa-btn"
                  onClick={() => navigate(a.path)}
                  initial={{ opacity: 0, scale: 0.93 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.32 }}
                >
                  <div className="edb-qa-icon" style={{ background: a.bg, color: a.color }}>
                    {a.icon}
                  </div>
                  <span className="edb-qa-label">{a.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Team assign modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {assignProject && (
          <AssignTeamModal
            project={assignProject}
            onClose={() => setAssignProject(null)}
            onSaved={onTeamSaved}
          />
        )}
      </AnimatePresence>
    </>
  );
};