// src/components/reports/MonthlyReport.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { getProjects, getActivities } from '../../api/client';
import type { Project, Activity } from '../types/index';
import { downloadCSV } from '../utils/exportCSV';
import { downloadPDF } from '../utils/exportPDF';
import {
  FileText, Download, Calendar, TrendingUp,
  Activity as ActivityIcon, FolderKanban,
  ChevronDown, Clock, CheckCircle2, Loader2,
  AlertCircle
} from 'lucide-react';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

const getProgressColor = (pct: number) =>
  pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : pct >= 25 ? '#818cf8' : '#64748b';

const getStatusMeta = (s: string) => {
  const m: Record<string, { color: string; bg: string }> = {
    Completed:    { color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
    'In Progress':{ color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
    Pending:      { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  };
  return m[s] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' };
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const MonthlyReport: React.FC = () => {
  const { user } = useAuth();
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [projects, setProjects]     = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading]       = useState(false);
  const [exporting, setExporting]   = useState<'pdf' | 'csv' | null>(null);
  const [error, setError]           = useState('');

  // active preview tab
  const [tab, setTab] = useState<'updates' | 'activities' | 'summary'>('updates');

  useEffect(() => {
    if (user?._id) fetchData();
  }, [year, month, user?._id]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [pRes, aRes] = await Promise.all([
        getProjects(),
        getActivities({ assignee: user?._id }),
      ]);

      // unwrap paginated or plain response
      const pData = pRes.data as Project[] | { projects: Project[]; pagination: unknown };
      const allProjects: Project[] = Array.isArray(pData) ? pData : (pData.projects ?? []);

      // Filter projects that have updates in this month/year
      const filtered = allProjects.filter(p => {
        const updates = p.progressUpdates || [];
        return updates.some(u => {
          const d = new Date(u.createdAt);
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        });
      }).map(p => ({
        ...p,
        progressUpdates: (p.progressUpdates || []).filter(u => {
          const d = new Date(u.createdAt);
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        }),
      }));

      // Filter activities by month/year (use createdAt or startDate)
      const allActivities: Activity[] = Array.isArray(aRes.data) ? aRes.data : [];
      const filteredActivities = allActivities.filter(a => {
        const ref = a.startDate || a.createdAt;
        if (!ref) return false;
        const d = new Date(ref);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      });

      setProjects(filtered);
      setActivities(filteredActivities);
    } catch (err) {
      console.error(err);
      setError('Failed to load report data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const totalUpdates = projects.reduce((n, p) => n + (p.progressUpdates?.length || 0), 0);

  const handleDownloadCSV = async () => {
    setExporting('csv');
    try {
      downloadCSV(user?.name || 'Employee', MONTHS[month - 1], year, projects, activities);
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadPDF = async () => {
    setExporting('pdf');
    try {
      await downloadPDF(user?.name || 'Employee', MONTHS[month - 1], year, projects, activities);
    } catch (e) {
      console.error(e);
      setError('PDF generation failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const years = [2023, 2024, 2025, 2026];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .mr-root {
          min-height: 100vh;
          background: #08080f;
          background-image:
            radial-gradient(ellipse 70% 45% at 15% -5%, rgba(124,58,237,0.13) 0%, transparent 55%),
            radial-gradient(ellipse 55% 40% at 85% 105%, rgba(52,211,153,0.06) 0%, transparent 55%);
          padding: 3rem 1.75rem 6rem;
          font-family: 'Instrument Sans', sans-serif;
          color: rgba(255,255,255,0.84);
        }
        .mr-wrap { max-width: 1020px; margin: 0 auto; }

        /* ── Header ── */
        .mr-head { margin-bottom: 2.5rem; }
        .mr-eyebrow {
          font-family: 'DM Mono', monospace; font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: rgba(255,255,255,0.24); margin-bottom: 8px;
        }
        .mr-title {
          font-family: 'Syne', sans-serif;
          font-size: 2.2rem; font-weight: 800;
          letter-spacing: -0.05em; color: #fff; line-height: 1.05;
        }
        .mr-title span {
          background: linear-gradient(120deg,#a78bfa 20%,#34d399 80%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .mr-sub { font-size: 13px; color: rgba(255,255,255,0.3); margin-top: 6px; }

        /* ── Controls bar ── */
        .mr-controls {
          display: flex; align-items: center; gap: 10px;
          flex-wrap: wrap; margin-bottom: 2rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 1rem 1.25rem;
        }
        .mr-select-wrap { position: relative; }
        .mr-select {
          appearance: none; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: rgba(255,255,255,0.75);
          font-family: 'Instrument Sans', sans-serif; font-size: 13px;
          padding: 8px 32px 8px 12px; outline: none; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          transition: border-color 0.2s;
        }
        .mr-select:focus { border-color: rgba(167,139,250,0.45); }
        .mr-select option { background: #10101e; }

        .mr-divider { width: 1px; height: 28px; background: rgba(255,255,255,0.08); margin: 0 4px; }

        .mr-dl-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 18px; border-radius: 10px; border: none;
          font-family: 'Instrument Sans', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.2s ease; white-space: nowrap;
        }
        .mr-dl-btn.csv {
          background: rgba(52,211,153,0.1); color: #34d399;
          border: 1px solid rgba(52,211,153,0.25);
        }
        .mr-dl-btn.csv:hover { background: rgba(52,211,153,0.18); }
        .mr-dl-btn.pdf {
          background: rgba(248,113,113,0.1); color: #f87171;
          border: 1px solid rgba(248,113,113,0.25);
        }
        .mr-dl-btn.pdf:hover { background: rgba(248,113,113,0.18); }
        .mr-dl-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .mr-spacer { flex: 1; }
        .mr-refresh-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.4); font-size: 12px;
          font-family: 'Instrument Sans', sans-serif;
          cursor: pointer; transition: all 0.18s;
        }
        .mr-refresh-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }

        /* ── Stat cards ── */
        .mr-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 2rem; }
        .mr-stat {
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 1.1rem 1.25rem;
          display: flex; align-items: center; gap: 14px;
        }
        .mr-stat-icon {
          width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .mr-stat-num { font-family: 'Syne', sans-serif; font-size: 1.8rem; font-weight: 800; color: #fff; line-height: 1; }
        .mr-stat-label { font-size: 11.5px; color: rgba(255,255,255,0.3); margin-top: 3px; }

        /* ── Tabs ── */
        .mr-tabs { display: flex; gap: 4px; margin-bottom: 1.25rem; }
        .mr-tab {
          padding: 7px 16px; border-radius: 9px; font-size: 12.5px; font-weight: 500;
          border: none; cursor: pointer; font-family: 'Instrument Sans', sans-serif;
          transition: all 0.18s;
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.35);
        }
        .mr-tab.active {
          background: rgba(167,139,250,0.15); color: #a78bfa;
          border: 1px solid rgba(167,139,250,0.28);
        }
        .mr-tab:not(.active):hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.6); }

        /* ── Cards ── */
        .mr-list { display: flex; flex-direction: column; gap: 8px; }

        .mr-card {
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px; padding: 1rem 1.2rem;
          transition: border-color 0.2s;
        }
        .mr-card:hover { border-color: rgba(167,139,250,0.18); }

        .mr-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
        .mr-card-name { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.88); }
        .mr-card-sub  { font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 2px; line-height: 1.5; }
        .mr-card-meta { font-size: 11px; color: rgba(255,255,255,0.22); margin-top: 6px; font-family: 'DM Mono', monospace; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        .mr-pct-badge {
          font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800;
          padding: 3px 10px; border-radius: 8px; white-space: nowrap; flex-shrink: 0;
        }
        .mr-status-badge {
          font-size: 10.5px; font-weight: 500;
          padding: 3px 9px; border-radius: 100px; white-space: nowrap; flex-shrink: 0;
        }

        /* Progress bar inside card */
        .mr-prog-track { height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; margin-top: 8px; }
        .mr-prog-fill  { height: 100%; border-radius: 2px; transition: width 1s ease; }

        /* Project summary row */
        .mr-proj-row {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 12px; padding: 10px 14px;
        }
        .mr-proj-name  { font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.8); flex: 1; }
        .mr-proj-prog  { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.4); }
        .mr-proj-bar-wrap { flex: 1; }

        /* Empty / error states */
        .mr-empty {
          text-align: center; padding: 3.5rem 0;
          color: rgba(255,255,255,0.2); font-size: 13px;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .mr-error {
          display: flex; align-items: center; gap: 8px;
          background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2);
          border-radius: 12px; padding: 12px 16px;
          color: #fca5a5; font-size: 13px; margin-bottom: 1.25rem;
        }

        /* Loading */
        .mr-loading {
          display: flex; align-items: center; justify-content: center;
          padding: 5rem 0; gap: 14px; flex-direction: column;
        }
        .mr-spin {
          width: 36px; height: 36px; border-radius: 50%;
          border: 2px solid rgba(167,139,250,0.18); border-top-color: #a78bfa;
          animation: mr-spin 0.85s linear infinite;
        }
        @keyframes mr-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .mr-stats { grid-template-columns: 1fr; }
          .mr-controls { flex-direction: column; align-items: stretch; }
          .mr-divider { display: none; }
          .mr-title { font-size: 1.65rem; }
        }
      `}</style>

      <div className="mr-root">
        <div className="mr-wrap">

          {/* Header */}
          <motion.div className="mr-head" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="mr-eyebrow">Reports & Analytics</div>
            <h1 className="mr-title">Monthly <span>Report</span></h1>
            <p className="mr-sub">Progress updates and activities for the selected period</p>
          </motion.div>

          {/* Controls */}
          <motion.div className="mr-controls" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            {/* Month */}
            <select className="mr-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>

            {/* Year */}
            <select className="mr-select" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <div className="mr-divider" />

            {/* Download buttons */}
            <button
              className="mr-dl-btn csv"
              onClick={handleDownloadCSV}
              disabled={!!exporting || loading || (projects.length === 0 && activities.length === 0)}
            >
              {exporting === 'csv'
                ? <><Loader2 size={14} style={{ animation: 'mr-spin 0.7s linear infinite' }} /> Exporting…</>
                : <><Download size={14} /> CSV</>
              }
            </button>

            <button
              className="mr-dl-btn pdf"
              onClick={handleDownloadPDF}
              disabled={!!exporting || loading || (projects.length === 0 && activities.length === 0)}
            >
              {exporting === 'pdf'
                ? <><Loader2 size={14} style={{ animation: 'mr-spin 0.7s linear infinite' }} /> Generating…</>
                : <><FileText size={14} /> PDF</>
              }
            </button>

            <div className="mr-spacer" />

            <button className="mr-refresh-btn" onClick={fetchData} disabled={loading}>
              <Calendar size={13} /> Refresh
            </button>
          </motion.div>

          {/* Error */}
          {error && (
            <div className="mr-error">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {loading ? (
            <div className="mr-loading">
              <div className="mr-spin" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono, monospace' }}>
                Loading report…
              </span>
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <motion.div className="mr-stats" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                {[
                  {
                    icon: <FolderKanban size={17} />,
                    iconBg: 'rgba(167,139,250,0.14)', iconColor: '#a78bfa',
                    num: projects.length, label: 'Projects with updates',
                  },
                  {
                    icon: <TrendingUp size={17} />,
                    iconBg: 'rgba(52,211,153,0.14)', iconColor: '#34d399',
                    num: totalUpdates, label: 'Progress updates',
                  },
                  {
                    icon: <ActivityIcon size={17} />,
                    iconBg: 'rgba(96,165,250,0.14)', iconColor: '#60a5fa',
                    num: activities.length, label: 'Activities',
                  },
                ].map((s, i) => (
                  <motion.div key={s.label} className="mr-stat"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 + i * 0.07 }}
                  >
                    <div className="mr-stat-icon" style={{ background: s.iconBg, color: s.iconColor }}>
                      {s.icon}
                    </div>
                    <div>
                      <div className="mr-stat-num">{s.num}</div>
                      <div className="mr-stat-label">{s.label}</div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Tabs */}
              <div className="mr-tabs">
                {([
                  { key: 'updates',    label: `Progress Updates (${totalUpdates})` },
                  { key: 'activities', label: `Activities (${activities.length})` },
                  { key: 'summary',    label: `Project Summary (${projects.length})` },
                ] as const).map(t => (
                  <button key={t.key} className={`mr-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">

                {/* ── Progress Updates tab ── */}
                {tab === 'updates' && (
                  <motion.div key="updates" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mr-list">
                    {totalUpdates === 0 ? (
                      <div className="mr-empty">
                        <TrendingUp size={36} style={{ opacity: 0.15 }} />
                        <span>No progress updates for {MONTHS[month - 1]} {year}</span>
                      </div>
                    ) : projects.map(project =>
                      (project.progressUpdates || [])
                        .slice()
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((u, i) => {
                          const col = getProgressColor(u.percentage);
                          return (
                            <motion.div key={u._id} className="mr-card"
                              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 }}
                            >
                              <div className="mr-card-top">
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="mr-card-name">{project.name}</div>
                                  <div className="mr-card-sub">{u.note}</div>
                                </div>
                                <div className="mr-pct-badge" style={{ color: col, background: col + '18' }}>
                                  {u.percentage}%
                                </div>
                              </div>
                              <div className="mr-prog-track">
                                <div className="mr-prog-fill" style={{ width: `${u.percentage}%`, background: col }} />
                              </div>
                              <div className="mr-card-meta">
                                <span>👤 {u.addedBy?.name || 'Unknown'}</span>
                                <span>·</span>
                                <span><Clock size={9} style={{ display: 'inline', marginRight: 3 }} />{fmt(u.createdAt)}</span>
                                <span>·</span>
                                <span>{timeAgo(u.createdAt)}</span>
                              </div>
                            </motion.div>
                          );
                        })
                    )}
                  </motion.div>
                )}

                {/* ── Activities tab ── */}
                {tab === 'activities' && (
                  <motion.div key="activities" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mr-list">
                    {activities.length === 0 ? (
                      <div className="mr-empty">
                        <ActivityIcon size={36} style={{ opacity: 0.15 }} />
                        <span>No activities for {MONTHS[month - 1]} {year}</span>
                      </div>
                    ) : activities.map((a, i) => {
                      const sm = getStatusMeta(a.status);
                      const taskTitle = typeof a.task === 'object' ? a.task.title : 'Unknown Task';
                      return (
                        <motion.div key={a._id} className="mr-card"
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                        >
                          <div className="mr-card-top">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="mr-card-name">{a.name}</div>
                              <div className="mr-card-sub">{a.description}</div>
                            </div>
                            <span className="mr-status-badge" style={{ background: sm.bg, color: sm.color }}>
                              {a.status}
                            </span>
                          </div>
                          <div className="mr-card-meta">
                            <span>Task: {taskTitle}</span>
                            <span>·</span>
                            <span>{a.activityType}</span>
                            <span>·</span>
                            <span>Priority: {a.priority}</span>
                            {a.startDate && (
                              <>
                                <span>·</span>
                                <span><Clock size={9} style={{ display: 'inline', marginRight: 3 }} />{fmt(a.startDate)}{a.endDate ? ` → ${fmt(a.endDate)}` : ''}</span>
                              </>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}

                {/* ── Project Summary tab ── */}
                {tab === 'summary' && (
                  <motion.div key="summary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mr-list">
                    {projects.length === 0 ? (
                      <div className="mr-empty">
                        <FolderKanban size={36} style={{ opacity: 0.15 }} />
                        <span>No project data for {MONTHS[month - 1]} {year}</span>
                      </div>
                    ) : projects.map((p, i) => {
                      const col = getProgressColor(p.progress ?? 0);
                      const updates = p.progressUpdates || [];
                      const latest = [...updates].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                      return (
                        <motion.div key={p._id} className="mr-proj-row"
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="mr-proj-name">{p.name}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                              {updates.length} update{updates.length !== 1 ? 's' : ''} this month
                              {latest ? `  ·  Last: ${fmt(latest.createdAt)}` : ''}
                            </div>
                          </div>
                          <div style={{ width: 120 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'DM Mono, monospace' }}>Overall</span>
                              <span style={{ fontSize: 10, color: col, fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{p.progress ?? 0}%</span>
                            </div>
                            <div className="mr-prog-track">
                              <div className="mr-prog-fill" style={{ width: `${p.progress ?? 0}%`, background: col }} />
                            </div>
                          </div>
                          <div className="mr-pct-badge" style={{ color: col, background: col + '18', fontSize: 13 }}>
                            {p.progress ?? 0}%
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}

              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </>
  );
};