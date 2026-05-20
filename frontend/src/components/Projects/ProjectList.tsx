// src/components/projects/ProjectList.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Eye, Edit, Trash2, Users, Calendar,
  TrendingUp, FolderKanban, ChevronUp, X, Check,
  AlertCircle, Clock, Zap, ArrowUp, Minus
} from 'lucide-react';
import { getProjects, deleteProject, addProgressUpdate, deleteProgressUpdate } from '../../api/client';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import type { Project, ProgressUpdate } from '../types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getStatusMeta = (status: string) => {
  const map: Record<string, { color: string; bg: string; dot: string }> = {
    Active:        { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  dot: '#34d399' },
    'In Progress': { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  dot: '#fbbf24' },
    Completed:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  dot: '#60a5fa' },
    Planned:       { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', dot: '#94a3b8' },
    'On Hold':     { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  dot: '#fb923c' },
    Cancelled:     { color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#f87171' },
  };
  return map[status] || map.Planned;
};

const getPriorityMeta = (priority: string) => {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    Critical: { color: '#f87171', icon: <Zap size={10} /> },
    High:     { color: '#fb923c', icon: <ArrowUp size={10} /> },
    Medium:   { color: '#fbbf24', icon: <Minus size={10} /> },
    Low:      { color: '#34d399', icon: <ChevronUp size={10} style={{ transform: 'rotate(180deg)' }} /> },
  };
  return map[priority] || map.Medium;
};

const getProgressColor = (pct: number) =>
  pct >= 80 ? 'linear-gradient(90deg,#059669,#34d399)' :
  pct >= 50 ? 'linear-gradient(90deg,#d97706,#fbbf24)' :
  pct >= 25 ? 'linear-gradient(90deg,#7c3aed,#818cf8)' :
              'linear-gradient(90deg,#475569,#64748b)';

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const initials = (name: string) =>
  name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

// ─── Progress Modal ───────────────────────────────────────────────────────────
const ProgressModal: React.FC<{
  project: Project;
  userId: string;
  isAdmin: boolean;
  onClose: () => void;
  onUpdated: (p: Project) => void;
}> = ({ project, userId, isAdmin, onClose, onUpdated }) => {
  const [pct, setPct]           = useState(project.progress ?? 0);
  const [note, setNote]         = useState('');
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  const updates: ProgressUpdate[] = [...(project.progressUpdates || [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleSubmit = async () => {
    if (!note.trim()) { setError('Please add a note describing the update'); return; }
    setSub(true); setError('');
    try {
      const res = await addProgressUpdate(project._id, { percentage: pct, note: note.trim() });
      onUpdated(res.data);
      setNote('');
    } catch (e: any) {
      setError(e.response?.data?.msg || 'Failed to save update');
    } finally { setSub(false); }
  };

  const handleDelete = async (entryId: string) => {
    setDeleting(entryId);
    try {
      const res = await deleteProgressUpdate(project._id, entryId);
      onUpdated(res.data);
    } catch { setError('Failed to delete entry'); }
    finally { setDeleting(null); }
  };

  const col = getProgressColor(pct);

  return (
    <div className="pm-overlay" onClick={onClose}>
      <motion.div
        className="pm-box"
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pm-header">
          <div>
            <div className="pm-tag">Progress Update</div>
            <h2 className="pm-title">{project.name}</h2>
          </div>
          <button className="pm-close" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Current progress ring + big number */}
        {/* <div className="pm-ring-row">
          <div className="pm-ring-wrap">
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
              <circle
                cx="44" cy="44" r="36" fill="none"
                stroke="url(#ringGrad)" strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - (project.progress ?? 0) / 100)}`}
                transform="rotate(-90 44 44)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
              <defs>
                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7c3aed" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
            </svg>
            <div className="pm-ring-num">{project.progress ?? 0}<span>%</span></div>
          </div>
          <div className="pm-ring-info">
            <div className="pm-ring-label">Current Progress</div>
            <div className="pm-ring-sub">{updates.length} update{updates.length !== 1 ? 's' : ''} recorded</div>
            {updates[0] && (
              <div className="pm-ring-last">
                Last by <strong>{updates[0].addedBy?.name}</strong> · {timeAgo(updates[0].createdAt)}
              </div>
            )}
          </div>
        </div> */}

        {/* Slider input */}
        {/* <div className="pm-section">
          <div className="pm-slider-header">
            <span className="pm-section-label">Set New Progress</span>
            <span className="pm-slider-val" style={{ background: col, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {pct}%
            </span>
          </div>
          <div className="pm-slider-wrap">
            <input
              ref={sliderRef}
              type="range" min={0} max={100} value={pct}
              onChange={e => setPct(Number(e.target.value))}
              className="pm-slider"
              style={{ '--fill': `${pct}%`, '--grad': col } as React.CSSProperties}
            />
            <div className="pm-slider-track">
              <div className="pm-slider-fill" style={{ width: `${pct}%`, background: col }} />
            </div>
            <div className="pm-slider-ticks">
              {[0, 25, 50, 75, 100].map(v => (
                <button key={v} className={`pm-tick ${pct === v ? 'active' : ''}`}
                  onClick={() => setPct(v)} style={pct === v ? { color: '#a78bfa' } : {}}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
        </div> */}

        {/* Note */}
        <div className="pm-section">
          <label className="pm-section-label">What did you complete?</label>
          <textarea
            className="pm-textarea"
            placeholder="e.g. Completed API integration for user authentication module, fixed 3 bugs…"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <div className="pm-char">{note.length}/500</div>
        </div>

        {error && (
          <div className="pm-error">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <button className="pm-submit" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <div className="pm-spin" /> : <Check size={14} />}
          {submitting ? 'Saving…' : 'Submit Progress Update'}
        </button>

        {/* History */}
        {updates.length > 0 && (
          <div className="pm-history">
            <div className="pm-history-label">Update History</div>
            <div className="pm-history-list">
              {updates.map((u, i) => (
                <motion.div
                  key={u._id}
                  className="pm-entry"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="pm-entry-left">
                    <div className="pm-entry-avatar">{initials(u.addedBy?.name || '?')}</div>
                    <div>
                      <div className="pm-entry-who">
                        <strong>{u.addedBy?.name}</strong>
                        <span className="pm-entry-role">{u.addedBy?.accessLevel}</span>
                      </div>
                      <div className="pm-entry-note">{u.note}</div>
                      <div className="pm-entry-time"><Clock size={9} /> {timeAgo(u.createdAt)}</div>
                    </div>
                  </div>
                  <div className="pm-entry-right">
                    {/* <div>
  <div
                      className="pm-entry-pct"
                      style={{ background: getProgressColor(u.percentage), WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                    >
                      {u.percentage}%
                    </div>
                    </div> */}
                  
                    {(isAdmin || u.addedBy?._id === userId) && (
                      <button
                        className="pm-entry-del"
                        onClick={() => handleDelete(u._id)}
                        disabled={deleting === u._id}
                      >
                        {deleting === u._id ? <div className="pm-spin-xs" /> : <X size={10} />}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const ProjectList: React.FC = () => {
  const [projects, setProjects]               = useState<Project[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState('');
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterPriority, setFilterPriority]   = useState('');
  const [progressProject, setProgressProject] = useState<Project | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const canCreate = usePermission('projects', 'create') || ['super-admin', 'admin'].includes(user?.accessLevel || '');
  const canDelete = usePermission('projects', 'delete') || ['super-admin', 'admin'].includes(user?.accessLevel || '');
  const isAdmin   = ['super-admin', 'admin'].includes(user?.accessLevel || '');

  const canUpdateProgress = !!user;

  useEffect(() => { loadProjects(); }, [search, filterStatus, filterPriority]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await getProjects({ search, status: filterStatus || undefined, priority: filterPriority || undefined });
      const data = res.data as Project[] | { projects: Project[]; pagination: unknown };
      setProjects(Array.isArray(data) ? data : (data.projects ?? []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this project permanently?')) {
      await deleteProject(id);
      loadProjects();
    }
  };

  const onProgressUpdated = (updated: Project) => {
    setProjects(prev => prev.map(p => p._id === updated._id ? updated : p));
    setProgressProject(updated);
  };

  const STATUSES   = ['Active', 'In Progress', 'Planned', 'On Hold', 'Completed', 'Cancelled'];
  const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .pl-root {
          min-height: 100vh;
          background: #07070f;
          background-image:
            radial-gradient(ellipse 80% 50% at 20% -10%, rgba(124,58,237,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 110%, rgba(52,211,153,0.06) 0%, transparent 60%);
          padding: 3rem 2rem 6rem;
          font-family: 'Instrument Sans', sans-serif;
          color: rgba(255,255,255,0.82);
        }
        .pl-wrap { max-width: 1160px; margin: 0 auto; }

        /* ── Header ── */
        .pl-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 2.5rem; gap: 16px; flex-wrap: wrap; }
        .pl-title {
          font-family: 'Syne', sans-serif;
          font-size: 2.6rem; font-weight: 800; letter-spacing: -0.05em;
          color: #fff; line-height: 1.05;
        }
        .pl-title span {
          background: linear-gradient(120deg, #a78bfa 20%, #34d399 80%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .pl-sub { font-size: 13px; color: rgba(255,255,255,0.28); margin-top: 6px; }
        .pl-new-btn {
          display: flex; align-items: center; gap: 7px;
          background: linear-gradient(135deg,#7c3aed,#6366f1);
          color: #fff; border: none; border-radius: 12px;
          padding: 11px 20px; font-size: 13.5px; font-weight: 600;
          font-family: 'Instrument Sans', sans-serif;
          cursor: pointer; white-space: nowrap;
          box-shadow: 0 6px 28px rgba(124,58,237,0.35);
          transition: all 0.2s ease;
        }
        .pl-new-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 36px rgba(124,58,237,0.5); }

        /* ── Filters ── */
        .pl-filters { display: flex; gap: 10px; margin-bottom: 1.75rem; flex-wrap: wrap; align-items: center; }
        .pl-search-wrap { position: relative; flex: 1; min-width: 220px; }
        .pl-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.22); pointer-events: none; }
        .pl-search {
          width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 11px; color: rgba(255,255,255,0.78);
          font-family: 'Instrument Sans', sans-serif; font-size: 13.5px;
          padding: 10px 14px 10px 36px; outline: none; transition: border-color 0.2s;
        }
        .pl-search::placeholder { color: rgba(255,255,255,0.18); }
        .pl-search:focus { border-color: rgba(167,139,250,0.4); }
        .pl-filter-sel {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 11px; color: rgba(255,255,255,0.6);
          font-family: 'Instrument Sans', sans-serif; font-size: 13px;
          padding: 10px 32px 10px 12px; outline: none; appearance: none; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.25)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          transition: border-color 0.2s;
        }
        .pl-filter-sel:focus { border-color: rgba(167,139,250,0.38); }
        .pl-filter-sel option { background: #0f0f1a; }
        .pl-count {
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: rgba(255,255,255,0.22); white-space: nowrap; padding: 0 4px;
        }

        /* ── Grid ── */
        .pl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }

        /* ── Project Card ── */
        .pl-card {
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; padding: 1.25rem;
          display: flex; flex-direction: column; gap: 12px;
          cursor: pointer; position: relative; overflow: hidden;
          transition: all 0.22s ease;
        }
        .pl-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.3) 50%, transparent 100%);
          opacity: 0; transition: opacity 0.3s;
        }
        .pl-card:hover { border-color: rgba(167,139,250,0.2); transform: translateY(-3px); background: rgba(167,139,250,0.03); }
        .pl-card:hover::before { opacity: 1; }

        .pl-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .pl-card-name { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: #fff; line-height: 1.3; }
        .pl-card-desc { font-size: 12.5px; color: rgba(255,255,255,0.3); line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        .pl-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .pl-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 9px; border-radius: 100px; font-size: 10.5px; font-weight: 500;
        }
        .pl-badge-dot { width: 5px; height: 5px; border-radius: 50%; }

        /* ── Progress bar ── */
        .pl-prog-wrap { display: flex; flex-direction: column; gap: 5px; }
        .pl-prog-row { display: flex; align-items: center; justify-content: space-between; }
        .pl-prog-label { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.28); }
        .pl-prog-val { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.55); }
        .pl-prog-track { height: 4px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; position: relative; }
        .pl-prog-fill { height: 100%; border-radius: 2px; transition: width 1.2s cubic-bezier(0.34,1.56,0.64,1); }
        .pl-prog-glow { position: absolute; right: 0; top: -2px; width: 8px; height: 8px; border-radius: 50%; filter: blur(3px); opacity: 0.8; }

        /* ── Card meta ── */
        .pl-meta { display: flex; flex-direction: column; gap: 5px; }
        .pl-meta-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: rgba(255,255,255,0.28); }

        /* ── Card footer ── */
        .pl-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); }
        .pl-avatars { display: flex; }
        .pl-av {
          width: 22px; height: 22px; border-radius: 50%;
          background: linear-gradient(135deg,#7c3aed,#6366f1);
          border: 2px solid #07070f; margin-left: -6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 8px; font-weight: 700; color: #fff; letter-spacing: 0;
        }
        .pl-av:first-child { margin-left: 0; }
        .pl-actions { display: flex; gap: 4px; }
        .pl-act-btn {
          width: 30px; height: 30px; border-radius: 8px; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s; background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.35);
        }
        .pl-act-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.75); }
        .pl-act-btn.prog { background: rgba(124,58,237,0.1); color: #a78bfa; }
        .pl-act-btn.prog:hover { background: rgba(124,58,237,0.22); }
        .pl-act-btn.del:hover { background: rgba(248,113,113,0.12); color: #f87171; }

        /* ── Empty ── */
        .pl-empty { text-align: center; padding: 4rem 0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .pl-empty-icon { color: rgba(255,255,255,0.08); }
        .pl-empty-text { font-size: 14px; color: rgba(255,255,255,0.22); }

        /* ── Loading ── */
        .pl-loading { display: flex; align-items: center; justify-content: center; padding: 5rem 0; gap: 14px; flex-direction: column; }
        .pl-spin-ring {
          width: 38px; height: 38px; border-radius: 50%;
          border: 2px solid rgba(167,139,250,0.18); border-top-color: #a78bfa;
          animation: pl-spin 0.85s linear infinite;
        }
        @keyframes pl-spin { to { transform: rotate(360deg); } }

        /* ── Progress Modal ── */
        .pm-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.75); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .pm-box {
          background: #0e0e1c; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px; width: 100%; max-width: 520px;
          max-height: 90vh; overflow-y: auto; overflow-x: hidden;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
          font-family: 'Instrument Sans', sans-serif;
        }
        .pm-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 1.5rem 1.5rem 1rem; position: sticky; top: 0;
          background: #0e0e1c; border-bottom: 1px solid rgba(255,255,255,0.06); z-index: 1;
        }
        .pm-tag { font-family: 'DM Mono', monospace; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(167,139,250,0.7); margin-bottom: 4px; }
        .pm-title { font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 700; color: #fff; }
        .pm-close {
          background: rgba(255,255,255,0.06); border: none; border-radius: 8px;
          color: rgba(255,255,255,0.35); cursor: pointer; padding: 7px;
          display: flex; transition: all 0.15s; flex-shrink: 0;
        }
        .pm-close:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.72); }

        /* Progress ring row */
        .pm-ring-row { display: flex; align-items: center; gap: 18px; padding: 1.25rem 1.5rem; }
        .pm-ring-wrap { position: relative; flex-shrink: 0; }
        .pm-ring-num {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; color: #fff;
        }
        .pm-ring-num span { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.4); margin-top: 4px; }
        .pm-ring-label { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.75); }
        .pm-ring-sub { font-size: 11.5px; color: rgba(255,255,255,0.28); margin-top: 3px; font-family: 'DM Mono', monospace; }
        .pm-ring-last { font-size: 11.5px; color: rgba(255,255,255,0.3); margin-top: 6px; }
        .pm-ring-last strong { color: rgba(255,255,255,0.62); }

        /* Slider */
        .pm-section { padding: 0 1.5rem 1.25rem; }
        .pm-slider-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .pm-section-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.32); }
        .pm-slider-val { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; }
        .pm-slider-wrap { position: relative; padding-bottom: 28px; }
        .pm-slider {
          width: 100%; appearance: none; height: 4px; border-radius: 2px;
          background: rgba(255,255,255,0.07); outline: none; cursor: pointer;
          position: relative; z-index: 2;
        }
        .pm-slider::-webkit-slider-thumb {
          appearance: none; width: 18px; height: 18px; border-radius: 50%;
          background: #fff; box-shadow: 0 0 0 3px rgba(124,58,237,0.5), 0 2px 8px rgba(0,0,0,0.5);
          cursor: pointer; transition: box-shadow 0.2s;
        }
        .pm-slider::-webkit-slider-thumb:hover { box-shadow: 0 0 0 5px rgba(124,58,237,0.4), 0 2px 12px rgba(0,0,0,0.5); }
        .pm-slider-track {
          position: absolute; top: 6px; left: 0; right: 0; height: 4px;
          border-radius: 2px; overflow: hidden; pointer-events: none;
        }
        .pm-slider-fill { height: 100%; border-radius: 2px; transition: width 0.1s, background 0.4s; }
        .pm-slider-ticks { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; }
        .pm-tick {
          font-family: 'DM Mono', monospace; font-size: 9.5px; color: rgba(255,255,255,0.22);
          background: none; border: none; cursor: pointer; padding: 2px 0;
          transition: color 0.15s;
        }
        .pm-tick:hover { color: rgba(255,255,255,0.5); }
        .pm-tick.active { font-weight: 600; }

        /* Textarea */
        .pm-textarea {
          width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 12px; color: rgba(255,255,255,0.78); font-family: 'Instrument Sans', sans-serif;
          font-size: 13.5px; padding: 11px 14px; outline: none; resize: vertical;
          min-height: 80px; transition: border-color 0.2s; margin-top: 8px;
        }
        .pm-textarea::placeholder { color: rgba(255,255,255,0.16); }
        .pm-textarea:focus { border-color: rgba(167,139,250,0.38); }
        .pm-char { font-size: 10.5px; color: rgba(255,255,255,0.18); text-align: right; margin-top: 4px; font-family: 'DM Mono', monospace; }

        /* Error */
        .pm-error {
          display: flex; align-items: center; gap: 7px; margin: 0 1.5rem 1rem;
          background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2);
          border-radius: 10px; padding: 10px 13px; font-size: 12.5px; color: #fca5a5;
        }

        /* Submit */
        .pm-submit {
          width: calc(100% - 3rem); margin: 0 1.5rem 1.25rem;
          background: linear-gradient(135deg,#7c3aed,#6366f1); border: none;
          border-radius: 12px; color: #fff; font-family: 'Instrument Sans', sans-serif;
          font-size: 14px; font-weight: 600; padding: 13px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; box-shadow: 0 6px 24px rgba(124,58,237,0.32);
          transition: all 0.2s;
        }
        .pm-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 32px rgba(124,58,237,0.48); }
        .pm-submit:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        /* History */
        .pm-history { border-top: 1px solid rgba(255,255,255,0.06); padding: 1.25rem 1.5rem; }
        .pm-history-label { font-family: 'DM Mono', monospace; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.24); margin-bottom: 12px; }
        .pm-history-list { display: flex; flex-direction: column; gap: 8px; }
        .pm-entry {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
          background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.055);
          border-radius: 12px; padding: 11px 12px;
        }
        .pm-entry-left { display: flex; gap: 10px; flex: 1; min-width: 0; }
        .pm-entry-avatar {
          width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
          background: linear-gradient(135deg,#7c3aed,#6366f1);
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 700; color: #fff;
        }
        .pm-entry-who { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
        .pm-entry-who strong { font-size: 12.5px; color: rgba(255,255,255,0.72); }
        .pm-entry-role {
          font-family: 'DM Mono', monospace; font-size: 9px; padding: 1px 6px;
          background: rgba(167,139,250,0.1); color: rgba(167,139,250,0.7);
          border-radius: 100px;
        }
        .pm-entry-note { font-size: 12px; color: rgba(255,255,255,0.42); line-height: 1.5; }
        .pm-entry-time { display: flex; align-items: center; gap: 4px; font-size: 10px; color: rgba(255,255,255,0.2); margin-top: 4px; font-family: 'DM Mono', monospace; }
        .pm-entry-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .pm-entry-pct { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 800; }
        .pm-entry-del {
          background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.15);
          border-radius: 6px; color: rgba(248,113,113,0.6); cursor: pointer;
          padding: 3px; display: flex; transition: all 0.15s;
        }
        .pm-entry-del:hover { background: rgba(248,113,113,0.15); color: #f87171; }
        .pm-entry-del:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Spinners */
        .pm-spin {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
          animation: pl-spin 0.7s linear infinite;
        }
        .pm-spin-xs {
          width: 9px; height: 9px; border-radius: 50%;
          border: 1.5px solid rgba(248,113,113,0.3); border-top-color: #f87171;
          animation: pl-spin 0.7s linear infinite;
        }

        /* Responsive */
        @media (max-width: 900px) { .pl-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 580px) { .pl-grid { grid-template-columns: 1fr; } .pl-root { padding: 2rem 1rem 5rem; } .pl-title { font-size: 2rem; } }
      `}</style>

      <div className="pl-root">
        <div className="pl-wrap">

          {/* Header */}
          <motion.div className="pl-head" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div>
              <h1 className="pl-title">All <span>Projects</span></h1>
              <p className="pl-sub">Track progress, assign teams, and ship faster</p>
            </div>
            {canCreate && (
              <button className="pl-new-btn" onClick={() => navigate('/projects/new')}>
                <Plus size={16} /> New Project
              </button>
            )}
          </motion.div>

          {/* Filters */}
          <motion.div className="pl-filters" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <div className="pl-search-wrap">
              <Search size={15} className="pl-search-icon" />
              <input
                className="pl-search" type="text"
                placeholder="Search projects…"
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="pl-filter-sel" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="pl-filter-sel" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="pl-count">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          </motion.div>

          {/* Content */}
          {loading ? (
            <div className="pl-loading">
              <div className="pl-spin-ring" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono, monospace' }}>Loading projects…</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="pl-empty">
              <FolderKanban size={48} className="pl-empty-icon" />
              <p className="pl-empty-text">No projects found</p>
              {canCreate && (
                <button onClick={() => navigate('/projects/new')} className="pl-new-btn" style={{ marginTop: 8 }}>
                  <Plus size={15} /> Create project
                </button>
              )}
            </div>
          ) : (
            <div className="pl-grid">
              <AnimatePresence>
                {projects.map((project, idx) => {
                  const sm = getStatusMeta(project.status);
                  const pm = getPriorityMeta(project.priority);
                  const pct = project.progress ?? 0;
                  const progColor = getProgressColor(pct);
                  const teamArr = project.teamMembers || [];
                  const updates = project.progressUpdates || [];
                  const lastUpdate = [...updates].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

                  return (
                    <motion.div
                      key={project._id}
                      className="pl-card"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => navigate(`/projects/${project._id}`)}
                    >
                      {/* Top row */}
                      <div className="pl-card-top">
                        <div className="pl-card-name">{project.name}</div>
                        <div className="pl-badges" onClick={e => e.stopPropagation()}>
                          <span className="pl-badge" style={{ background: sm.bg, color: sm.color }}>
                            <span className="pl-badge-dot" style={{ background: sm.dot }} />
                            {project.status}
                          </span>
                        </div>
                      </div>

                      {project.description && <p className="pl-card-desc">{project.description}</p>}

                      {/* Priority + client */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="pl-badge" style={{ background: `${pm.color}18`, color: pm.color, gap: 3 }}>
                          {pm.icon} {project.priority}
                        </span>
                        {project.client && (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'DM Mono, monospace' }}>
                            {project.client}
                          </span>
                        )}
                      </div>

                      {/* Progress bar
                      <div className="pl-prog-wrap">
                        <div className="pl-prog-row">
                          <span className="pl-prog-label">
                            Progress · {updates.length} update{updates.length !== 1 ? 's' : ''}
                          </span>
                          <span className="pl-prog-val">{pct}%</span>
                        </div>
                        <div className="pl-prog-track">
                          <div className="pl-prog-fill" style={{ width: `${pct}%`, background: progColor }} />
                        </div>
                        {lastUpdate && (
                          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
                            Last: {lastUpdate.note?.slice(0, 40)}{lastUpdate.note?.length > 40 ? '…' : ''} · {timeAgo(lastUpdate.createdAt)}
                          </div>
                        )}
                      </div> */}

                      {/* Meta */}
                      <div className="pl-meta">
                        {project.projectManager && (
                          <div className="pl-meta-row">
                            <Users size={11} />
                            <span>{typeof project.projectManager === 'object' ? (project.projectManager as any).name : 'Assigned'}</span>
                          </div>
                        )}
                        {project.startDate && (
                          <div className="pl-meta-row">
                            <Calendar size={11} />
                            <span>{new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="pl-card-foot" onClick={e => e.stopPropagation()}>
                        <div className="pl-avatars">
                          {teamArr.slice(0, 5).map((m, i) => (
                            <div key={i} className="pl-av" title={typeof m === 'object' ? m.name : ''}>
                              {initials(typeof m === 'object' ? (m.name || '?') : '?')}
                            </div>
                          ))}
                          {teamArr.length > 5 && (
                            <div className="pl-av" style={{ background: 'rgba(255,255,255,0.08)' }}>+{teamArr.length - 5}</div>
                          )}
                          {teamArr.length === 0 && (
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' }}>No team</span>
                          )}
                        </div>
                        <div className="pl-actions">
                          {canUpdateProgress && (
                            <button
                              className="pl-act-btn prog"
                              title="Update progress"
                              onClick={e => { e.stopPropagation(); setProgressProject(project); }}
                            >
                              <TrendingUp size={13} />
                            </button>
                          )}
                          <button className="pl-act-btn" title="View" onClick={() => navigate(`/projects/${project._id}`)}>
                            <Eye size={13} />
                          </button>
                          {canCreate && (
                            <button className="pl-act-btn" title="Edit" onClick={() => navigate(`/projects/${project._id}/edit`)}>
                              <Edit size={13} />
                            </button>
                          )}
                          {canDelete && (
                            <button className="pl-act-btn del" title="Delete" onClick={e => handleDelete(project._id, e)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Progress Modal */}
      <AnimatePresence>
        {progressProject && (
          <ProgressModal
            project={progressProject}
            userId={user?._id || ''}
            isAdmin={isAdmin}
            onClose={() => setProgressProject(null)}
            onUpdated={onProgressUpdated}
          />
        )}
      </AnimatePresence>
    </>
  );
};