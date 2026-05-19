import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getProject, createProject, updateProject, getUsers } from '../../api/client';
import type { User, Milestone } from '../types/index';
import {
  Save, X, Plus, Trash2, Calendar, Users, Flag,
  Activity, User as UserIcon, ChevronDown, Briefcase,
  Target, CheckCircle2, Circle, AlertCircle
} from 'lucide-react';

// ─── Reusable field wrapper ───────────────────────────────────────────────────
const Field: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode; hint?: string }> =
  ({ label, icon, children, hint }) => (
    <div className="field-group">
      <label className="field-label">
        {icon && <span className="field-icon">{icon}</span>}
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );

// ─── Priority badge config ────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  Low:    { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', dot: '#4ade80' },
  Medium: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  dot: '#fbbf24' },
  High:   { color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#f87171' },
};
const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  Planned:   { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  Active:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  Completed: { color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  'On Hold': { color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
};

export const ProjectForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    priority: 'Medium',
    status: 'Planned',
    projectManager: '',
    teamMembersIds: [] as string[],
    milestones: [] as Milestone[],
  });
  const [newMilestone, setNewMilestone] = useState({ name: '', dueDate: '' });

  useEffect(() => { loadTeamMembers(); if (id) loadProject(); }, [id]);

  const loadTeamMembers = async () => {
    try {
      // Fetch all users (up to 100) and show only active ones
      const res = await getUsers(1, 100, undefined, undefined);
      const allUsers: User[] = res.data.users ?? res.data ?? [];
      const active = allUsers.filter((u: User) => !u.status || u.status === 'active');
      setTeamMembers(active);
    } catch (err) {
      console.error('Failed to load team members:', err);
    }
  };

  const loadProject = async () => {
    try {
      const res = await getProject(id!);
      const proj = res.data;
      setFormData({
        name: proj.name,
        description: proj.description,
        startDate: proj.startDate?.split('T')[0] || '',
        endDate: proj.endDate?.split('T')[0] || '',
        priority: proj.priority,
        status: proj.status,
        projectManager: typeof proj.projectManager === 'string' ? proj.projectManager : proj.projectManager?._id || '',
        teamMembersIds: (proj.teamMembers || []).map((m: any) => typeof m === 'string' ? m : m._id),
        milestones: proj.milestones || [],
      });
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const projectData = {
      name: formData.name,
      description: formData.description,
      startDate: formData.startDate,
      endDate: formData.endDate || null,
      priority: formData.priority,
      status: formData.status,
      projectManager: formData.projectManager || null,
      teamMembers: formData.teamMembersIds,
      milestones: formData.milestones,
    };
    try {
      if (id) await updateProject(id, projectData);
      else await createProject(projectData);
      navigate('/projects');
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Failed to save project. Please try again.');
    } finally { setLoading(false); }
  };

  const addMilestone = () => {
    if (!newMilestone.name.trim()) return;
    setFormData({
      ...formData,
      milestones: [...formData.milestones, { name: newMilestone.name, dueDate: newMilestone.dueDate, completed: false }]
    });
    setNewMilestone({ name: '', dueDate: '' });
  };

  const toggleMilestone = (index: number) => {
    const updated = formData.milestones.map((m, i) => i === index ? { ...m, completed: !m.completed } : m);
    setFormData({ ...formData, milestones: updated });
  };

  const removeMilestone = (index: number) => {
    setFormData({ ...formData, milestones: formData.milestones.filter((_, i) => i !== index) });
  };

  const set = (key: string, value: any) => setFormData(prev => ({ ...prev, [key]: value }));
  const pc = PRIORITY_CONFIG[formData.priority] || PRIORITY_CONFIG.Medium;
  const sc = STATUS_CONFIG[formData.status] || STATUS_CONFIG.Planned;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        .pf-root {
          min-height: 100vh;
          background: #0a0a0f;
          background-image:
            radial-gradient(ellipse 80% 50% at 20% -20%, rgba(99,102,241,0.15) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 110%, rgba(139,92,246,0.1) 0%, transparent 60%);
          padding: 3rem 1rem 5rem;
          font-family: 'Sora', sans-serif;
        }

        .pf-container { max-width: 720px; margin: 0 auto; }

        /* ── Header ── */
        .pf-header { margin-bottom: 2.5rem; }
        .pf-breadcrumb {
          font-size: 12px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 0.75rem;
          font-family: 'JetBrains Mono', monospace;
        }
        .pf-breadcrumb span { color: rgba(255,255,255,0.6); }
        .pf-title {
          font-size: 2rem;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .pf-title em {
          font-style: normal;
          background: linear-gradient(135deg, #a78bfa, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .pf-subtitle {
          font-size: 14px;
          color: rgba(255,255,255,0.4);
          margin-top: 0.5rem;
          font-weight: 300;
        }

        /* ── Card ── */
        .pf-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          backdrop-filter: blur(20px);
          overflow: hidden;
        }

        /* ── Sections ── */
        .pf-section {
          padding: 2rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .pf-section:last-child { border-bottom: none; }
        .pf-section-title {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pf-section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.06);
        }

        /* ── Fields ── */
        .field-group { display: flex; flex-direction: column; gap: 8px; }
        .field-label {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.02em;
        }
        .field-icon { color: rgba(167,139,250,0.7); display: flex; }
        .field-hint { font-size: 11px; color: rgba(255,255,255,0.25); margin: 0; }

        /* ── Inputs ── */
        .pf-input, .pf-textarea, .pf-select {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: rgba(255,255,255,0.9);
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          padding: 12px 16px;
          width: 100%;
          box-sizing: border-box;
          transition: all 0.2s ease;
          outline: none;
        }
        .pf-input::placeholder, .pf-textarea::placeholder { color: rgba(255,255,255,0.2); }
        .pf-input:focus, .pf-textarea:focus, .pf-select:focus {
          border-color: rgba(167,139,250,0.5);
          background: rgba(167,139,250,0.08);
          box-shadow: 0 0 0 3px rgba(167,139,250,0.08);
        }
        .pf-input:hover, .pf-textarea:hover, .pf-select:hover {
          border-color: rgba(255,255,255,0.18);
        }
        .pf-textarea { resize: vertical; min-height: 100px; line-height: 1.6; }
        .pf-select {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          padding-right: 40px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
        }
        .pf-select option { background: #1a1a2e; color: #fff; }

        /* ── Grid ── */
        .pf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .pf-stack { display: flex; flex-direction: column; gap: 1.25rem; }

        /* ── Priority / Status pills ── */
        .pill-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .pill {
          padding: 7px 16px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.18s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.4);
          border-color: rgba(255,255,255,0.08);
        }
        .pill:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
        .pill.active {
          font-weight: 600;
        }
        .pill-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* ── Team multi-select ── */
        .team-select {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
        }
        .team-member-chip {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .team-member-chip:hover { border-color: rgba(167,139,250,0.3); background: rgba(167,139,250,0.05); }
        .team-member-chip.selected {
          border-color: rgba(167,139,250,0.5);
          background: rgba(167,139,250,0.1);
        }
        .avatar {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #a78bfa);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600; color: #fff;
          flex-shrink: 0;
        }
        .avatar-gray { background: linear-gradient(135deg, #475569, #64748b); }
        .member-name { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 400; truncate: true; }
        .check-box {
          width: 16px; height: 16px;
          border-radius: 4px;
          border: 1.5px solid rgba(255,255,255,0.2);
          margin-left: auto;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }
        .check-box.checked {
          background: #7c3aed;
          border-color: #7c3aed;
        }

        /* ── Milestone ── */
        .milestone-add {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 10px;
          border-radius: 12px;
          border: 1px dashed rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.02);
        }
        .milestone-add .pf-input { border: none; background: transparent; padding: 6px 10px; }
        .milestone-add .pf-input:focus { background: rgba(255,255,255,0.04); box-shadow: none; }
        .milestone-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .milestone-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          transition: border-color 0.18s ease;
        }
        .milestone-item:hover { border-color: rgba(255,255,255,0.12); }
        .milestone-item.done { opacity: 0.5; }
        .milestone-name {
          flex: 1;
          font-size: 14px;
          color: rgba(255,255,255,0.8);
        }
        .milestone-item.done .milestone-name {
          text-decoration: line-through;
          color: rgba(255,255,255,0.35);
        }
        .milestone-date {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          font-family: 'JetBrains Mono', monospace;
        }
        .icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.3);
          padding: 4px;
          border-radius: 6px;
          display: flex;
          transition: all 0.15s ease;
        }
        .icon-btn:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
        .icon-btn.danger:hover { color: #f87171; background: rgba(248,113,113,0.1); }

        /* ── Add milestone btn ── */
        .add-btn {
          background: rgba(124,58,237,0.15);
          border: 1px solid rgba(124,58,237,0.35);
          color: #a78bfa;
          border-radius: 10px;
          padding: 0 14px;
          height: 38px;
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 500;
          cursor: pointer;
          transition: all 0.18s ease;
          white-space: nowrap;
          flex-shrink: 0;
          font-family: 'Sora', sans-serif;
        }
        .add-btn:hover { background: rgba(124,58,237,0.25); border-color: rgba(124,58,237,0.6); }

        /* ── Error ── */
        .pf-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 12px;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.2);
          color: #fca5a5;
          font-size: 14px;
          margin-bottom: 1rem;
        }

        /* ── Actions ── */
        .pf-actions {
          display: flex;
          gap: 12px;
          padding: 1.75rem 2rem;
          border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
        }
        .btn-primary {
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 12px 28px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          display: flex; align-items: center; gap: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(124,58,237,0.35);
          letter-spacing: 0.01em;
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(124,58,237,0.5);
        }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-ghost {
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.5);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 12px 22px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          display: flex; align-items: center; gap: 8px;
          transition: all 0.18s ease;
        }
        .btn-ghost:hover {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.75);
          border-color: rgba(255,255,255,0.18);
        }

        /* ── Date input ── */
        input[type="date"].pf-input::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }

        /* ── Spinner ── */
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .pf-grid-2 { grid-template-columns: 1fr; }
          .pf-section { padding: 1.5rem; }
          .pf-actions { padding: 1.25rem 1.5rem; }
          .pf-title { font-size: 1.5rem; }
          .team-select { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="pf-root">
        <div className="pf-container">

          {/* Header */}
          <motion.div
            className="pf-header"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="pf-breadcrumb">Projects / <span>{id ? 'Edit' : 'New'}</span></div>
            <h1 className="pf-title">
              {id ? <>Edit <em>Project</em></> : <>Create <em>New Project</em></>}
            </h1>
            <p className="pf-subtitle">
              {id ? 'Update project details, team, and milestones.' : 'Define your project scope, assign your team, and set milestones.'}
            </p>
          </motion.div>

          {/* Card */}
          <motion.div
            className="pf-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <form onSubmit={handleSubmit}>

              {/* ── Section: Basics ── */}
              <div className="pf-section pf-stack">
                <div className="pf-section-title">01 — Project basics</div>

                <Field label="Project name" icon={<Briefcase size={13} />}>
                  <input
                    className="pf-input"
                    placeholder="e.g. Customer Portal Redesign"
                    value={formData.name}
                    onChange={e => set('name', e.target.value)}
                    required
                  />
                </Field>

                <Field label="Description">
                  <textarea
                    className="pf-textarea pf-input"
                    placeholder="What's this project about? What are the key goals?"
                    value={formData.description}
                    onChange={e => set('description', e.target.value)}
                  />
                </Field>

                <div className="pf-grid-2">
                  <Field label="Start date" icon={<Calendar size={13} />}>
                    <input
                      type="date"
                      className="pf-input"
                      value={formData.startDate}
                      onChange={e => set('startDate', e.target.value)}
                    />
                  </Field>
                  <Field label="End date" icon={<Calendar size={13} />}>
                    <input
                      type="date"
                      className="pf-input"
                      value={formData.endDate}
                      onChange={e => set('endDate', e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              {/* ── Section: Priority & Status ── */}
              <div className="pf-section pf-stack">
                <div className="pf-section-title">02 — Priority & status</div>

                <Field label="Priority" icon={<Flag size={13} />}>
                  <div className="pill-group">
                    {(['Low', 'Medium', 'High'] as const).map(p => {
                      const cfg = PRIORITY_CONFIG[p];
                      const active = formData.priority === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`pill ${active ? 'active' : ''}`}
                          style={active ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color + '50' } : {}}
                          onClick={() => set('priority', p)}
                        >
                          <span className="pill-dot" style={{ background: active ? cfg.dot : 'rgba(255,255,255,0.2)' }} />
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Status" icon={<Activity size={13} />}>
                  <div className="pill-group">
                    {(['Planned', 'Active', 'Completed', 'On Hold'] as const).map(s => {
                      const cfg = STATUS_CONFIG[s];
                      const active = formData.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          className={`pill ${active ? 'active' : ''}`}
                          style={active ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color + '50' } : {}}
                          onClick={() => set('status', s)}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>

              {/* ── Section: Team ── */}
              <div className="pf-section pf-stack">
                <div className="pf-section-title">03 — Team</div>

                <Field label="Project manager" icon={<UserIcon size={13} />}>
                  <select
                    className="pf-input pf-select"
                    value={formData.projectManager}
                    onChange={e => set('projectManager', e.target.value)}
                  >
                    <option value="">No manager assigned</option>
                    {teamMembers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                  </select>
                </Field>

                <Field label="Team members" icon={<Users size={13} />} hint="Click to toggle selection">
                  {teamMembers.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '13px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px' }}>
                      No team members found
                    </div>
                  ) : (
                    <div className="team-select">
                      {teamMembers.map(u => {
                        const selected = formData.teamMembersIds.includes(u._id);
                        const initials = u.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                        return (
                          <button
                            key={u._id}
                            type="button"
                            className={`team-member-chip ${selected ? 'selected' : ''}`}
                            onClick={() => {
                              const ids = selected
                                ? formData.teamMembersIds.filter(id => id !== u._id)
                                : [...formData.teamMembersIds, u._id];
                              set('teamMembersIds', ids);
                            }}
                          >
                            <div className={`avatar ${selected ? '' : 'avatar-gray'}`}>{initials}</div>
                            <span className="member-name">{u.name}</span>
                            <div className={`check-box ${selected ? 'checked' : ''}`}>
                              {selected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Field>
              </div>

              {/* ── Section: Milestones ── */}
              <div className="pf-section pf-stack">
                <div className="pf-section-title">04 — Milestones</div>

                <div className="milestone-add">
                  <Target size={15} style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0, marginLeft: '4px' }} />
                  <input
                    className="pf-input"
                    placeholder="Milestone name"
                    value={newMilestone.name}
                    onChange={e => setNewMilestone({ ...newMilestone, name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMilestone())}
                  />
                  <input
                    type="date"
                    className="pf-input"
                    style={{ width: '160px', flexShrink: 0 }}
                    value={newMilestone.dueDate}
                    onChange={e => setNewMilestone({ ...newMilestone, dueDate: e.target.value })}
                  />
                  <button type="button" className="add-btn" onClick={addMilestone}>
                    <Plus size={14} /> Add
                  </button>
                </div>

                <AnimatePresence>
                  {formData.milestones.length > 0 && (
                    <div className="milestone-list">
                      {formData.milestones.map((m, idx) => (
                        <motion.div
                          key={idx}
                          className={`milestone-item ${m.completed ? 'done' : ''}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10, height: 0, padding: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <button type="button" className="icon-btn" onClick={() => toggleMilestone(idx)}>
                            {m.completed
                              ? <CheckCircle2 size={16} style={{ color: '#4ade80' }} />
                              : <Circle size={16} style={{ color: 'rgba(255,255,255,0.25)' }} />
                            }
                          </button>
                          <span className="milestone-name">{m.name}</span>
                          {m.dueDate && (
                            <span className="milestone-date">
                              {new Date(m.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          <button type="button" className="icon-btn danger" onClick={() => removeMilestone(idx)}>
                            <Trash2 size={14} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>

                {formData.milestones.length === 0 && (
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '8px 0' }}>
                    No milestones yet — add some above
                  </p>
                )}
              </div>

              {/* ── Actions ── */}
              <div className="pf-actions">
                {error && (
                  <div className="pf-error" style={{ marginBottom: 0, flex: '1 0 100%', order: -1 }}>
                    <AlertCircle size={16} /> {error}
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? <div className="spinner" /> : <Save size={15} />}
                  {loading ? 'Saving…' : id ? 'Update Project' : 'Create Project'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => navigate('/projects')}>
                  <X size={15} /> Cancel
                </button>
              </div>

            </form>
          </motion.div>

        </div>
      </div>
    </>
  );
};