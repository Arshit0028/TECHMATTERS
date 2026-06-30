// src/components/projects/ProjectView.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getProject, deleteProject } from '../../api/client';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import type { Project } from '../types/index';
import {
  Edit, Trash2, ArrowLeft, Calendar, Users, Flag, Activity,
  User as UserIcon, Briefcase, Target, CheckCircle2, Circle,
  Loader2, TrendingUp, Clock,
} from 'lucide-react';

// ─── Shared config (mirrors ProjectForm/ProjectList) ──────────────────────────
const PRIORITY_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  Low:      { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  dot: '#4ade80' },
  Medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  dot: '#fbbf24' },
  High:     { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  dot: '#fb923c' },
  Critical: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#f87171' },
};
const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  Planned:       { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  Active:        { color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  'In Progress': { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  Completed:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  'On Hold':     { color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  Cancelled:     { color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
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

const initials = (name?: string) =>
  (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

export const ProjectView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const canEdit = usePermission('projects', 'create') || ['super-admin', 'admin'].includes(user?.accessLevel || '');
  const canDelete = usePermission('projects', 'delete') || ['super-admin', 'admin'].includes(user?.accessLevel || '');

  useEffect(() => {
    if (id) load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getProject(id!);
      setProject(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!window.confirm('Delete this project permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteProject(project._id);
      navigate('/projects');
    } catch (err) {
      console.error(err);
      alert('Failed to delete project');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" color="#a78bfa" size={28} />
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)' }}>
        Project not found.
      </div>
    );
  }

  const sc = STATUS_CONFIG[project.status] || STATUS_CONFIG.Planned;
  const pc = PRIORITY_CONFIG[project.priority] || PRIORITY_CONFIG.Medium;
  const pct = project.progress ?? 0;
  const progColor = getProgressColor(pct);
  const team = project.teamMembers || [];
  const updates = [...(project.progressUpdates || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        .pv-root {
          min-height: 100vh;
          background: #0a0a0f;
          background-image:
            radial-gradient(ellipse 80% 50% at 20% -20%, rgba(99,102,241,0.15) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 110%, rgba(139,92,246,0.1) 0%, transparent 60%);
          padding: 3rem 1rem 5rem;
          font-family: 'Sora', sans-serif;
          color: rgba(255,255,255,0.84);
        }
        .pv-container { max-width: 720px; margin: 0 auto; }

        .pv-back {
          display: inline-flex; align-items: center; gap: 8px;
          color: rgba(255,255,255,0.4); font-size: 13px;
          background: none; border: none; cursor: pointer;
          margin-bottom: 1.5rem; transition: color 0.15s;
          font-family: 'Sora', sans-serif;
        }
        .pv-back:hover { color: rgba(255,255,255,0.75); }

        .pv-header { margin-bottom: 2rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .pv-title {
          font-size: 2rem; font-weight: 600; color: #fff;
          letter-spacing: -0.03em; line-height: 1.15;
        }
        .pv-subtitle { font-size: 13px; color: rgba(255,255,255,0.3); margin-top: 8px; font-family: 'JetBrains Mono', monospace; }

        .pv-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          backdrop-filter: blur(20px);
          overflow: hidden;
        }
        .pv-section { padding: 2rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .pv-section:last-child { border-bottom: none; }
        .pv-section-title {
          font-size: 11px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase;
          color: rgba(255,255,255,0.3); font-family: 'JetBrains Mono', monospace;
          margin-bottom: 1.25rem; display: flex; align-items: center; gap: 8px;
        }
        .pv-section-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06); }

        .pv-field-label {
          font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5);
          display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
        }
        .pv-field-icon { color: rgba(167,139,250,0.7); display: flex; }
        .pv-desc { font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.6; white-space: pre-wrap; }

        .pv-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 100px; font-size: 13px; font-weight: 600;
        }
        .pv-badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        .pv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

        .pv-prog-track { height: 6px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; margin-top: 10px; }
        .pv-prog-fill { height: 100%; border-radius: 3px; transition: width 0.8s cubic-bezier(0.34,1.56,0.64,1); }
        .pv-prog-num { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: rgba(255,255,255,0.6); }

        .pv-team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
        .pv-team-chip {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
        }
        .pv-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #a78bfa);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600; color: #fff; flex-shrink: 0;
        }
        .pv-member-name { font-size: 13px; color: rgba(255,255,255,0.7); }

        .pv-milestone-list { display: flex; flex-direction: column; gap: 6px; }
        .pv-milestone-item {
          display: flex; align-items: center; gap: 10px; padding: 12px 14px;
          border-radius: 12px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .pv-milestone-item.done { opacity: 0.5; }
        .pv-milestone-name { flex: 1; font-size: 14px; color: rgba(255,255,255,0.8); }
        .pv-milestone-item.done .pv-milestone-name { text-decoration: line-through; color: rgba(255,255,255,0.35); }
        .pv-milestone-date { font-size: 11px; color: rgba(255,255,255,0.3); font-family: 'JetBrains Mono', monospace; }

        .pv-update-list { display: flex; flex-direction: column; gap: 8px; }
        .pv-update {
          display: flex; gap: 10px; background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.055); border-radius: 12px; padding: 11px 12px;
        }
        .pv-update-avatar {
          width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
          background: linear-gradient(135deg,#7c3aed,#6366f1);
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 700; color: #fff;
        }
        .pv-update-who { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
        .pv-update-who strong { font-size: 12.5px; color: rgba(255,255,255,0.72); }
        .pv-update-note { font-size: 12px; color: rgba(255,255,255,0.42); line-height: 1.5; }
        .pv-update-time { display: flex; align-items: center; gap: 4px; font-size: 10px; color: rgba(255,255,255,0.2); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

        .pv-actions {
          display: flex; gap: 12px; padding: 1.75rem 2rem;
          border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
        }
        .btn-primary {
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          color: #fff; border: none; border-radius: 12px;
          padding: 12px 28px; font-size: 14px; font-weight: 600;
          font-family: 'Sora', sans-serif; cursor: pointer;
          display: flex; align-items: center; gap: 8px;
          transition: all 0.2s ease; box-shadow: 0 4px 20px rgba(124,58,237,0.35);
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(124,58,237,0.5); }
        .btn-danger {
          background: rgba(248,113,113,0.1); color: #f87171;
          border: 1px solid rgba(248,113,113,0.25); border-radius: 12px;
          padding: 12px 22px; font-size: 14px; font-weight: 500;
          font-family: 'Sora', sans-serif; cursor: pointer;
          display: flex; align-items: center; gap: 8px; transition: all 0.18s ease;
        }
        .btn-danger:hover { background: rgba(248,113,113,0.18); }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 640px) {
          .pv-grid-2 { grid-template-columns: 1fr; }
          .pv-section { padding: 1.5rem; }
          .pv-actions { padding: 1.25rem 1.5rem; flex-direction: column; }
          .pv-title { font-size: 1.5rem; }
          .pv-team-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="pv-root">
        <div className="pv-container">
          <button className="pv-back" onClick={() => navigate('/projects')}>
            <ArrowLeft size={15} /> Back to Projects
          </button>

          <motion.div
            className="pv-header"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div>
              <h1 className="pv-title">{project.name}</h1>
              {project.client && <p className="pv-subtitle">{project.client}</p>}
            </div>
            <span className="pv-badge" style={{ background: sc.bg, color: sc.color }}>
              <span className="pv-badge-dot" style={{ background: sc.color }} />
              {project.status}
            </span>
          </motion.div>

          <motion.div
            className="pv-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            {/* Basics */}
            <div className="pv-section">
              <div className="pv-section-title">1 — Project basics</div>

              {project.description && (
                <div style={{ marginBottom: 20 }}>
                  <div className="pv-field-label"><Briefcase size={13} className="pv-field-icon" /> Description</div>
                  <p className="pv-desc">{project.description}</p>
                </div>
              )}

              <div className="pv-grid-2">
                <div>
                  <div className="pv-field-label"><Calendar size={13} className="pv-field-icon" /> Start date</div>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    {project.startDate ? new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <div>
                  <div className="pv-field-label"><Calendar size={13} className="pv-field-icon" /> End date</div>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    {project.endDate ? new Date(project.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Priority / Status / Progress
            <div className="pv-section">
              <div className="pv-section-title">02 — Priority, status & progress</div>
              <div className="pv-grid-2" style={{ marginBottom: 20 }}>
                <div>
                  <div className="pv-field-label"><Flag size={13} className="pv-field-icon" /> Priority</div>
                  <span className="pv-badge" style={{ background: pc.bg, color: pc.color }}>
                    <span className="pv-badge-dot" style={{ background: pc.dot }} />
                    {project.priority}
                  </span>
                </div>
                <div>
                  <div className="pv-field-label"><Activity size={13} className="pv-field-icon" /> Status</div>
                  <span className="pv-badge" style={{ background: sc.bg, color: sc.color }}>
                    <span className="pv-badge-dot" style={{ background: sc.color }} />
                    {project.status}
                  </span>
                </div>
              </div>

              <div>
                <div className="pv-field-label"><TrendingUp size={13} className="pv-field-icon" /> Progress</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="pv-prog-num">{pct}% complete</span>
                  <span className="pv-prog-num">{updates.length} update{updates.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="pv-prog-track">
                  <div className="pv-prog-fill" style={{ width: `${pct}%`, background: progColor }} />
                </div>
              </div>
            </div> */}

            {/* Team */}
            <div className="pv-section">
              <div className="pv-section-title">2 — Team For {project.name}</div>

              <div style={{ marginBottom: 20 }}>
                <div className="pv-field-label"><UserIcon size={13} className="pv-field-icon" /> Project manager</div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                  {typeof project.projectManager === 'object' && project.projectManager
                    ? (project.projectManager as any).name
                    : 'No manager assigned'}
                </p>
              </div>

              <div className="pv-field-label" style={{ marginBottom: 10 }}><Users size={13} className="pv-field-icon" /> Team members</div>
              {team.length === 0 ? (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>No team members assigned</p>
              ) : (
                <div className="pv-team-grid">
                  {team.map((m: any, i: number) => (
                    <div key={m._id || i} className="pv-team-chip">
                      <div className="pv-avatar">{initials(m.name)}</div>
                      <span className="pv-member-name">{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Milestones */}
            <div className="pv-section">
              <div className="pv-section-title">3 — Milestones For {project.name}</div>
              {(!project.milestones || project.milestones.length === 0) ? (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>No milestones recorded</p>
              ) : (
                <div className="pv-milestone-list">
                  {project.milestones.map((m, idx) => (
                    <div key={idx} className={`pv-milestone-item ${m.completed ? 'done' : ''}`}>
                      {m.completed
                        ? <CheckCircle2 size={16} style={{ color: '#4ade80', flexShrink: 0 }} />
                        : <Circle size={16} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />}
                      <span className="pv-milestone-name">{m.name}</span>
                      {m.dueDate && (
                        <span className="pv-milestone-date">
                          {new Date(m.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Progress update history */}
            {updates.length > 0 && (
              <div className="pv-section">
                <div className="pv-section-title">05 — Progress history</div>
                <div className="pv-update-list">
                  {updates.map(u => (
                    <div key={u._id} className="pv-update">
                      <div className="pv-update-avatar">{initials(u.addedBy?.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pv-update-who">
                          <strong>{u.addedBy?.name}</strong>
                        </div>
                        <div className="pv-update-note">{u.note}</div>
                        <div className="pv-update-time"><Clock size={9} /> {timeAgo(u.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pv-actions">
              {canEdit && (
                <Link to={`/projects/${project._id}/edit`} className="btn-primary" style={{ textDecoration: 'none' }}>
                  <Edit size={15} /> Edit Project
                </Link>
              )}
              {canDelete && (
                <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                  Delete
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};