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
  ArrowUpRight, Layers, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { downloadPDF } from '../utils/exportPDF';
import { downloadCSV } from '../utils/exportCSV';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TeamMember { _id: string; name: string; email: string; accessLevel: string; status: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const userBelongsToProject = (project: Project, userId: string): boolean => {
  if (!userId) return false;

  // Check team members (handles both plain IDs and populated objects)
  const isMember = (project.teamMembers || []).some((m: any) => {
    const id = typeof m === 'string' ? m : m?._id;
    return String(id) === String(userId);
  });

  // Check project manager (handles both plain ID string and populated object)
  const managerId = project.projectManager
    ? (typeof project.projectManager === 'string'
        ? project.projectManager
        : (project.projectManager as any)?._id || '')
    : '';
  const isManager = String(managerId) === String(userId);

  // Check createdBy as fallback
  const createdById = project.createdBy
    ? (typeof project.createdBy === 'string'
        ? project.createdBy
        : (project.createdBy as any)?._id || '')
    : '';
  const isCreator = String(createdById) === String(userId);

  return isMember || isManager || isCreator;
};

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
    typeof project.projectManager === 'string' ? project.projectManager : project.projectManager?._id || ''
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getUsers(1, 100, undefined, undefined)
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
    setSaving(true);
    setError('');
    try {
      const payload = { teamMembers: selected, projectManager: manager || undefined };
      const res = await updateProject(project._id, payload);
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Failed to update team');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const GRAD: Record<string, string> = {
    manager:      'linear-gradient(135deg,#7c3aed,#6366f1)',
    admin:        'linear-gradient(135deg,#d97706,#f59e0b)',
    'super-admin':'linear-gradient(135deg,#dc2626,#f87171)',
    tech:         'linear-gradient(135deg,#0891b2,#06b6d4)',
    entry:        'linear-gradient(135deg,#475569,#64748b)',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 24 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-tag">Team Assignment</div>
            <h2 className="modal-title">{project.name}</h2>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-section">
          <label className="modal-label"><Users size={11} /> Project Manager</label>
          <select className="modal-select" value={manager} onChange={e => setManager(e.target.value)}>
            <option value="">No manager assigned</option>
            {allUsers
              .filter(u => ['manager', 'admin', 'super-admin'].includes(u.accessLevel))
              .map(u => <option key={u._id} value={u._id}>{u.name}</option>)
            }
          </select>
        </div>

        <div className="modal-section" style={{ paddingBottom: 0 }}>
          <label className="modal-label">
            <Users size={11} /> Team Members
            <span className="modal-count">{selected.length} selected</span>
          </label>
          <div className="modal-search-wrap">
            <Search size={13} className="modal-search-icon" />
            <input
              className="modal-search"
              placeholder="Search members…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-list">
          {filtered.length === 0 ? (
            <div className="modal-empty">No members found</div>
          ) : filtered.map(u => {
            const isSel = selected.includes(u._id);
            return (
              <div key={u._id} className={`modal-member ${isSel ? 'selected' : ''}`} onClick={() => toggle(u._id)}>
                <div className="modal-avatar" style={{ background: GRAD[u.accessLevel] || GRAD.entry }}>
                  {getInitials(u.name)}
                </div>
                <div className="modal-member-info">
                  <span className="modal-member-name">{u.name}</span>
                  <span className="modal-member-role">{u.accessLevel} · {u.email}</span>
                </div>
                <div className={`modal-check ${isSel ? 'checked' : ''}`}>
                  {isSel && <Check size={10} strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="modal-error"><AlertCircle size={13} />{error}</div>}

        <div className="modal-footer">
          <button className="modal-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <div className="spinner-sm" /> : <Check size={13} />}
            {saving ? 'Saving…' : 'Assign Team'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS: Record<string, { color: string; bg: string; dot: string }> = {
  Active:       { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  dot: '#34d399' },
  Completed:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  dot: '#60a5fa' },
  'In Progress':{ color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  dot: '#fbbf24' },
  Done:         { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  dot: '#34d399' },
  Approved:     { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  dot: '#34d399' },
  Pending:      { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  dot: '#fbbf24' },
  Rejected:     { color: '#f87171', bg: 'rgba(248,113,113,0.10)', dot: '#f87171' },
  Planned:      { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', dot: '#94a3b8' },
  'On Hold':    { color: '#fb923c', bg: 'rgba(251,146,60,0.10)',  dot: '#fb923c' },
};
const statusStyle = (s: string) => STATUS[s] || STATUS.Planned;

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export const EmployeeDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects]             = useState<Project[]>([]);
  const [tasks, setTasks]                   = useState<Task[]>([]);
  const [activities, setActivities]         = useState<Activity[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading]               = useState(false);
  const [reportYear, setReportYear]         = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth]       = useState(new Date().getMonth() + 1);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [assignProject, setAssignProject]   = useState<Project | null>(null);

  const isManager = ['manager', 'admin', 'super-admin'].includes(user?.accessLevel || '');

  useEffect(() => {
    if (!user?._id) return;
    let cancelled = false;
    loadDashboardData(user._id, () => cancelled);
    return () => { cancelled = true; };
  }, [user?._id]);

  const loadDashboardData = async (userId: string, isCancelled?: () => boolean) => {
    setLoading(true);
    try {
      const [pRes, tRes, aRes, rRes] = await Promise.all([
        getProjects(),
        getTasks({ assignee: userId }),
        getActivities({ assignee: userId }),
        getReimbursements(),
      ]);

      // Unwrap paginated or plain array response
      const pData = pRes.data as Project[] | { projects: Project[]; pagination: unknown };
      const allProjects: Project[] = Array.isArray(pData) ? pData : (pData.projects ?? []);

      // Backend already scopes projects to the requesting user
      const myProjects = allProjects;

      if (isCancelled?.()) return;
      setProjects(myProjects);
      setTasks(Array.isArray(tRes.data) ? tRes.data : []);
      setActivities(Array.isArray(aRes.data) ? aRes.data : []);
      setReimbursements(Array.isArray(rRes.data) ? rRes.data : []);
    } catch (err) {
      if (isCancelled?.()) return;
      console.error('Dashboard load error:', err);
    } finally {
      if (!isCancelled?.()) setLoading(false);
    }
  };

  const handleGenerateReport = async (format: 'pdf' | 'csv') => {
    if (projects.length === 0 && activities.length === 0) {
      alert('No project or activity data found for this period.');
      return;
    }
    setGeneratingReport(true);
    const monthLabel = new Date(reportYear, reportMonth - 1).toLocaleString('default', { month: 'long' });
    try {
      if (format === 'pdf') {
        await downloadPDF(user?.name || 'Employee', monthLabel, reportYear, projects, activities);
      } else {
        downloadCSV(user?.name || 'Employee', monthLabel, reportYear, projects, activities);
      }
    } catch { alert('Failed to generate report'); }
    finally { setGeneratingReport(false); }
  };

  const onTeamSaved = (updated: Project) => {
    setProjects(prev => prev.map(p => p._id === updated._id ? updated : p));
  };

  const completedStatuses = ['Review', 'Done', 'Completed'];
  const tasksDone = tasks.filter(t => completedStatuses.includes(t.status)).length;
  const tasksPct  = tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0;

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div className="pulse-ring" />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>Loading workspace…</div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .db-root {
          min-height: 100vh;
          background: #080810;
          background-image:
            radial-gradient(ellipse 70% 55% at 10% 0%, rgba(88,80,236,0.14) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at 90% 100%, rgba(124,58,237,0.09) 0%, transparent 55%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='1' cy='1' r='0.6' fill='rgba(255,255,255,0.025)'/%3E%3C/svg%3E");
          padding: 2.75rem 1.75rem 6rem;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,0.85);
        }
        .db-container { max-width: 1080px; margin: 0 auto; }

        /* ── Welcome ─────────────────────────────── */
        .db-welcome { margin-bottom: 3rem; }
        .db-eyebrow {
          font-family: 'DM Mono', monospace;
          font-size: 10px; letter-spacing: 0.14em;
          text-transform: uppercase; color: rgba(255,255,255,0.22);
          margin-bottom: 10px;
        }
        .db-greeting {
          font-size: 2.1rem; font-weight: 600; letter-spacing: -0.04em;
          line-height: 1.12; color: #fff;
        }
        .db-greeting em {
          font-style: normal;
          background: linear-gradient(110deg,#c4b5fd 20%,#818cf8 80%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .db-sub { font-size: 13.5px; color: rgba(255,255,255,0.3); margin-top: 8px; font-weight: 300; }

        /* ── Stats ───────────────────────────────── */
        .db-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 2.5rem; }
        .stat-card {
          background: rgba(255,255,255,0.038);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px; padding: 1.2rem 1.25rem;
          position: relative; overflow: hidden;
          transition: border-color 0.25s, transform 0.2s;
        }
        .stat-card::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% -20%, var(--glow) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.3s;
          pointer-events: none;
        }
        .stat-card:hover { border-color: rgba(255,255,255,0.13); transform: translateY(-2px); }
        .stat-card:hover::before { opacity: 1; }
        .stat-icon {
          width: 34px; height: 34px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 14px;
        }
        .stat-num { font-size: 2.1rem; font-weight: 600; letter-spacing: -0.04em; color: #fff; line-height: 1; }
        .stat-label { font-size: 11.5px; color: rgba(255,255,255,0.32); margin-top: 5px; }
        .stat-bar { height: 2px; background: rgba(255,255,255,0.07); border-radius: 1px; margin-top: 14px; overflow: hidden; }
        .stat-bar-fill { height: 100%; border-radius: 1px; transition: width 1.2s cubic-bezier(0.34,1.56,0.64,1); }

        /* ── Section ─────────────────────────────── */
        .db-section { margin-bottom: 2.75rem; }
        .sec-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .sec-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
          color: rgba(255,255,255,0.28);
        }
        .sec-link {
          font-size: 12px; color: rgba(167,139,250,0.75);
          background: none; border: none; cursor: pointer;
          display: flex; align-items: center; gap: 3px;
          font-family: 'DM Sans', sans-serif; font-weight: 500;
          transition: color 0.15s; letter-spacing: 0.02em;
        }
        .sec-link:hover { color: #c4b5fd; }

        /* ── Project cards ───────────────────────── */
        .proj-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
        .proj-card {
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px; padding: 1.2rem;
          cursor: pointer; display: flex; flex-direction: column; gap: 11px;
          transition: all 0.22s ease;
          position: relative; overflow: hidden;
        }
        .proj-card::after {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(167,139,250,0.35), transparent);
          opacity: 0; transition: opacity 0.3s;
        }
        .proj-card:hover { border-color: rgba(167,139,250,0.22); transform: translateY(-3px); background: rgba(167,139,250,0.04); }
        .proj-card:hover::after { opacity: 1; }
        .proj-name { font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.88); line-height: 1.35; }
        .proj-desc { font-size: 12px; color: rgba(255,255,255,0.3); line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .proj-progress-label { font-size: 10px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; margin-bottom: 5px; }
        .proj-progress-bar { height: 2px; background: rgba(255,255,255,0.07); border-radius: 1px; overflow: hidden; }
        .proj-progress-fill { height: 100%; background: linear-gradient(90deg,#7c3aed,#818cf8); border-radius: 1px; transition: width 1s ease; }
        .proj-team-row { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
        .proj-avatars { display: flex; }
        .proj-avatar {
          width: 21px; height: 21px; border-radius: 50%;
          background: linear-gradient(135deg,#7c3aed,#6366f1);
          display: flex; align-items: center; justify-content: center;
          font-size: 8px; font-weight: 700; color: #fff;
          border: 1.5px solid #080810; margin-left: -5px;
          letter-spacing: 0;
        }
        .proj-avatar:first-child { margin-left: 0; }
        .proj-no-team { font-size: 11px; color: rgba(255,255,255,0.18); font-style: italic; }
        .assign-btn {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 9px; border-radius: 7px;
          background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.28);
          color: #a78bfa; font-size: 11px; font-weight: 500;
          cursor: pointer; transition: all 0.18s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .assign-btn:hover { background: rgba(124,58,237,0.22); border-color: rgba(167,139,250,0.5); }

        /* ── Task rows ───────────────────────────── */
        .task-list { display: flex; flex-direction: column; gap: 7px; }
        .task-row {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 13px; padding: 11px 15px;
          transition: border-color 0.18s, background 0.18s;
        }
        .task-row:hover { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); }
        .task-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .task-title { font-size: 13.5px; color: rgba(255,255,255,0.72); font-weight: 400; flex: 1; }
        .task-project { font-size: 10.5px; color: rgba(255,255,255,0.22); font-family: 'DM Mono', monospace; margin-top: 2px; }
        .badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 100px;
          font-size: 10.5px; font-weight: 500; white-space: nowrap;
        }

        /* ── Report card ─────────────────────────── */
        .report-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; padding: 1.75rem 1.75rem;
          margin-bottom: 2.75rem;
          position: relative; overflow: hidden;
        }
        .report-card::before {
          content: ''; position: absolute; bottom: -30px; right: -30px;
          width: 160px; height: 160px; border-radius: 50%;
          background: radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%);
          pointer-events: none;
        }
        .report-header { display: flex; align-items: center; gap: 11px; margin-bottom: 1.5rem; }
        .report-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(167,139,250,0.1);
          display: flex; align-items: center; justify-content: center; color: #a78bfa;
        }
        .report-title { font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.82); }
        .report-sub { font-size: 12px; color: rgba(255,255,255,0.28); margin-top: 2px; }
        .report-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
        .report-field { display: flex; flex-direction: column; gap: 6px; }
        .report-label { font-size: 10.5px; color: rgba(255,255,255,0.3); letter-spacing: 0.06em; text-transform: uppercase; font-family: 'DM Mono', monospace; }
        .report-select {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: rgba(255,255,255,0.78);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 9px 32px 9px 12px; outline: none; cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          transition: border-color 0.2s;
        }
        .report-select:focus { border-color: rgba(167,139,250,0.4); }
        .report-select option { background: #12121e; }
        .report-btn {
          background: linear-gradient(135deg,#7c3aed,#6366f1);
          color: #fff; border: none; border-radius: 10px;
          padding: 10px 20px; font-size: 13px; font-weight: 600;
          font-family: 'DM Sans', sans-serif; cursor: pointer;
          display: flex; align-items: center; gap: 7px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(124,58,237,0.28);
        }
        .report-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(124,58,237,0.42); }
        .report-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        /* ── Quick actions ───────────────────────── */
        .qa-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 11px; }
        .qa-btn {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 16px; padding: 1.25rem 1rem;
          text-align: center; cursor: pointer;
          transition: all 0.2s ease;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          font-family: 'DM Sans', sans-serif;
        }
        .qa-btn:hover { border-color: rgba(167,139,250,0.28); background: rgba(167,139,250,0.05); transform: translateY(-2px); }
        .qa-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; }
        .qa-label { font-size: 12px; color: rgba(255,255,255,0.42); font-weight: 400; }

        /* ── Modal ───────────────────────────────── */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.72); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .modal-box {
          background: #111120; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 22px; width: 100%; max-width: 490px;
          display: flex; flex-direction: column; max-height: 88vh; overflow: hidden;
        }
        .modal-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 1.4rem 1.4rem 0.9rem; border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .modal-tag { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(167,139,250,0.65); font-family: 'DM Mono', monospace; margin-bottom: 4px; }
        .modal-title { font-size: 16px; font-weight: 600; color: #fff; line-height: 1.25; }
        .modal-close {
          background: rgba(255,255,255,0.06); border: none; border-radius: 8px;
          color: rgba(255,255,255,0.38); cursor: pointer; padding: 6px;
          display: flex; transition: all 0.15s;
        }
        .modal-close:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.75); }
        .modal-section { padding: 1rem 1.4rem; }
        .modal-label {
          font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.35);
          letter-spacing: 0.09em; text-transform: uppercase; font-family: 'DM Mono', monospace;
          display: flex; align-items: center; gap: 5px; margin-bottom: 8px;
        }
        .modal-count {
          margin-left: auto; font-size: 10.5px; color: rgba(167,139,250,0.8);
          background: rgba(167,139,250,0.1); border-radius: 100px; padding: 2px 8px; letter-spacing: 0;
        }
        .modal-select {
          width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: rgba(255,255,255,0.78); font-family: 'DM Sans', sans-serif;
          font-size: 13px; padding: 9px 34px 9px 12px; outline: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 11px center; transition: border-color 0.2s;
        }
        .modal-select:focus { border-color: rgba(167,139,250,0.4); }
        .modal-select option { background: #12121e; }
        .modal-search-wrap { position: relative; }
        .modal-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.22); pointer-events: none; }
        .modal-search {
          width: 100%; box-sizing: border-box;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: rgba(255,255,255,0.78); font-family: 'DM Sans', sans-serif;
          font-size: 13px; padding: 8px 12px 8px 34px; outline: none; transition: border-color 0.2s;
        }
        .modal-search::placeholder { color: rgba(255,255,255,0.18); }
        .modal-search:focus { border-color: rgba(167,139,250,0.38); }
        .modal-list {
          flex: 1; overflow-y: auto; padding: 6px 1.4rem;
          max-height: 270px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .modal-empty { text-align: center; color: rgba(255,255,255,0.18); font-size: 13px; padding: 2rem 0; }
        .modal-member {
          display: flex; align-items: center; gap: 9px;
          padding: 9px 11px; border-radius: 10px; border: 1px solid transparent;
          cursor: pointer; transition: all 0.15s; margin-bottom: 3px;
        }
        .modal-member:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.07); }
        .modal-member.selected { background: rgba(124,58,237,0.09); border-color: rgba(124,58,237,0.28); }
        .modal-avatar {
          width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .modal-member-info { flex: 1; min-width: 0; }
        .modal-member-name { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.78); display: block; }
        .modal-member-role { font-size: 10.5px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; }
        .modal-check {
          width: 17px; height: 17px; border-radius: 5px;
          border: 1.5px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.04);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; color: #fff; transition: all 0.15s;
        }
        .modal-check.checked { background: #7c3aed; border-color: #7c3aed; }
        .modal-error {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 1.4rem; color: #fca5a5; font-size: 12.5px;
          background: rgba(248,113,113,0.07); border-top: 1px solid rgba(248,113,113,0.13);
        }
        .modal-footer {
          display: flex; gap: 9px; padding: 1rem 1.4rem;
          border-top: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.015);
        }
        .modal-btn-ghost {
          flex: 1; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: rgba(255,255,255,0.45); font-family: 'DM Sans', sans-serif;
          font-size: 13px; font-weight: 500; cursor: pointer; padding: 10px; transition: all 0.18s;
        }
        .modal-btn-ghost:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.72); }
        .modal-btn-primary {
          flex: 2; background: linear-gradient(135deg,#7c3aed,#6366f1); border: none;
          border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif;
          font-size: 13px; font-weight: 600; cursor: pointer; padding: 10px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          transition: all 0.2s; box-shadow: 0 4px 18px rgba(124,58,237,0.28);
        }
        .modal-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.42); }
        .modal-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        /* ── Divider ─────────────────────────────── */
        .divider { height: 1px; background: rgba(255,255,255,0.055); margin: 0 0 2.5rem; }

        /* ── Empty state ─────────────────────────── */
        .empty-state {
          text-align: center; color: rgba(255,255,255,0.18);
          font-size: 13px; padding: 2.5rem 0;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .empty-icon { opacity: 0.15; }

        /* ── Spinner / loading ───────────────────── */
        .pulse-ring {
          width: 36px; height: 36px; border-radius: 50%;
          border: 2px solid rgba(167,139,250,0.18);
          border-top-color: #a78bfa;
          animation: spin 0.9s linear infinite;
        }
        .spinner-sm {
          width: 13px; height: 13px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.25);
          border-top-color: #fff; animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Responsive ──────────────────────────── */
        @media (max-width: 860px) {
          .proj-grid { grid-template-columns: repeat(2,1fr); }
          .db-stats  { grid-template-columns: repeat(2,1fr); }
          .qa-grid   { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 540px) {
          .proj-grid { grid-template-columns: 1fr; }
          .db-stats  { grid-template-columns: repeat(2,1fr); }
          .qa-grid   { grid-template-columns: repeat(2,1fr); }
          .db-greeting { font-size: 1.65rem; }
          .db-root { padding: 2rem 1rem 5rem; }
        }
      `}</style>

      <div className="db-root">
        <div className="db-container">

          {/* ── Welcome ── */}
          <motion.div
            className="db-welcome"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="db-eyebrow">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <h1 className="db-greeting">{greeting}, <em>{user?.name?.split(' ')[0]}</em> 👋</h1>
            <p className="db-sub">Here's your workspace overview for today</p>
          </motion.div>

          {/* ── Stats ── */}
          <motion.div
            className="db-stats"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            {[
              { label: 'My Projects',     num: projects.length,       icon: <Layers size={16} />,        iconBg: 'rgba(167,139,250,0.14)', iconColor: '#a78bfa', glow: 'rgba(124,58,237,0.12)', bar: null },
              { label: 'Assigned Tasks',  num: tasks.length,          icon: <CheckSquare size={16} />,   iconBg: 'rgba(52,211,153,0.14)',  iconColor: '#34d399', glow: 'rgba(52,211,153,0.10)', bar: { pct: tasksPct, color: 'linear-gradient(90deg,#059669,#34d399)' } },
              { label: 'Activities',      num: activities.length,     icon: <ActivityIcon size={16} />,  iconBg: 'rgba(96,165,250,0.14)',  iconColor: '#60a5fa', glow: 'rgba(59,130,246,0.10)', bar: null },
              { label: 'Reimbursements',  num: reimbursements.length, icon: <Receipt size={16} />,       iconBg: 'rgba(251,146,60,0.14)',  iconColor: '#fb923c', glow: 'rgba(251,146,60,0.10)', bar: null },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className="stat-card"
                style={{ '--glow': s.glow } as React.CSSProperties}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.13 + i * 0.07, duration: 0.38 }}
              >
                <div className="stat-icon" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                <div className="stat-num">{s.num}</div>
                <div className="stat-label">{s.label}</div>
                {s.bar && (
                  <>
                    <div className="stat-bar">
                      <div className="stat-bar-fill" style={{ width: `${s.bar.pct}%`, background: s.bar.color }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'DM Mono, monospace', marginTop: 4 }}>{s.bar.pct}% complete</div>
                  </>
                )}
              </motion.div>
            ))}
          </motion.div>

          <div className="divider" />

          {/* ── My Projects ── */}
          <div className="db-section">
            <div className="sec-row">
              <span className="sec-label">My projects</span>
              <button className="sec-link" onClick={() => navigate('/projects')}>
                View all <ChevronRight size={12} />
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="empty-state">
                <FolderKanban size={32} className="empty-icon" />
                <span>No projects assigned yet</span>
              </div>
            ) : (
              <div className="proj-grid">
                {projects.slice(0, 6).map((project, i) => {
                  const sc = statusStyle(project.status);
                  const teamArr: any[] = project.teamMembers || [];
                  return (
                    <motion.div
                      key={project._id}
                      className="proj-card"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.065, duration: 0.36 }}
                      onClick={() => navigate(`/projects/${project._id}`)}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div className="proj-name">{project.name}</div>
                        <span className="badge" style={{ background: sc.bg, color: sc.color, flexShrink: 0 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                          {project.status}
                        </span>
                      </div>

                      {project.description && <p className="proj-desc">{project.description}</p>}

                      {project.progress !== undefined && (
                        <div>
                          <div className="proj-progress-label">{project.progress ?? 0}% complete</div>
                          <div className="proj-progress-bar">
                            <div className="proj-progress-fill" style={{ width: `${project.progress ?? 0}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="proj-team-row">
                        {teamArr.length > 0 ? (
                          <div className="proj-avatars">
                            {teamArr.slice(0, 4).map((m: any, idx: number) => {
                              const name = typeof m === 'string'
                                ? m.slice(0, 2).toUpperCase()
                                : (m.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?');
                              return (
                                <div key={idx} className="proj-avatar" title={typeof m === 'object' ? m.name : ''}>{name}</div>
                              );
                            })}
                            {teamArr.length > 4 && (
                              <div className="proj-avatar" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                +{teamArr.length - 4}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="proj-no-team">No team assigned</span>
                        )}

                        {isManager && (
                          <button
                            className="assign-btn"
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

          {/* ── My Tasks ── */}
          <div className="db-section">
            <div className="sec-row">
              <span className="sec-label">My tasks</span>
              <button className="sec-link" onClick={() => navigate('/tasks')}>
                View all <ChevronRight size={12} />
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="empty-state">
                <CheckSquare size={32} className="empty-icon" />
                <span>No tasks assigned</span>
              </div>
            ) : (
              <div className="task-list">
                {tasks.slice(0, 5).map((task, i) => {
                  const sc = statusStyle(task.status);
                  return (
                    <motion.div
                      key={task._id}
                      className="task-row"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.055, duration: 0.34 }}
                    >
                      <div className="task-dot" style={{ background: sc.dot }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="task-title">{task.title}</div>
                        {task.project?.name && <div className="task-project">{task.project.name}</div>}
                      </div>
                      <span className="badge" style={{ background: sc.bg, color: sc.color }}>{task.status}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Monthly Report ── */}
          <motion.div
            className="report-card"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38, duration: 0.4 }}
          >
            <div className="report-header">
              <div className="report-icon"><FileText size={17} /></div>
              <div>
                <div className="report-title">Monthly Report</div>
                <div className="report-sub">Export your time entries as PDF or CSV</div>
              </div>
            </div>
            <div className="report-row">
              <div className="report-field">
                <span className="report-label">Year</span>
                <select className="report-select" value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
                  {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="report-field">
                <span className="report-label">Month</span>
                <select className="report-select" value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <button className="report-btn" onClick={() => handleGenerateReport('pdf')} disabled={generatingReport} style={{ marginRight: 8 }}>
                {generatingReport ? <div className="spinner-sm" /> : <Download size={14} />}
                {generatingReport ? 'Generating…' : 'PDF'}
              </button>
              <button className="report-btn" onClick={() => handleGenerateReport('csv')} disabled={generatingReport} style={{ background: 'linear-gradient(135deg,#059669,#34d399)' }}>
                {generatingReport ? <div className="spinner-sm" /> : <Download size={14} />}
                {generatingReport ? 'Exporting…' : 'CSV'}
              </button>
            </div>
          </motion.div>

          {/* ── Quick Actions ── */}
          <div className="db-section">
            <div className="sec-row" style={{ marginBottom: '1rem' }}>
              <span className="sec-label">Quick actions</span>
            </div>
            <div className="qa-grid">
              {[
                { label: 'New Claim',     icon: <Receipt size={18} />,       bg: 'rgba(251,146,60,0.12)',  color: '#fb923c', path: '/reimbursements/new' },
                { label: 'My Activities', icon: <ActivityIcon size={18} />,  bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', path: '/activities' },
                { label: 'Projects',      icon: <FolderKanban size={18} />,  bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', path: '/projects' },
                { label: 'All Tasks',     icon: <CheckSquare size={18} />,   bg: 'rgba(52,211,153,0.12)',  color: '#34d399', path: '/tasks' },
              ].map((a, i) => (
                <motion.button
                  key={a.label}
                  className="qa-btn"
                  onClick={() => navigate(a.path)}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.42 + i * 0.06, duration: 0.32 }}
                >
                  <div className="qa-icon" style={{ background: a.bg, color: a.color }}>{a.icon}</div>
                  <span className="qa-label">{a.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Assign Team Modal ── */}
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