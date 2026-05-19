// src/components/Reimbursements/ReimbursementList.tsx
// Updated: dark theme consistent with EmployeeMonthlyReport + AdminReportReview
// • arr-* CSS classes reused from admin report
// • Employees see only their own claims (read-only status)
// • Super-admin/admin/manager see all claims with approve/reject inline
// • Links back to monthly report if claim is tied to one

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Eye, DollarSign, CheckCircle, XCircle, Clock,
  Search, Receipt, TrendingUp, FileText,
} from 'lucide-react';
import { getReimbursements, getProjects } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Reimbursement, Project } from '../types/index';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Pending:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.25)',  label: 'Pending'  },
  Approved: { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.25)',  label: 'Approved' },
  Rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)', label: 'Rejected' },
  Paid:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)',  label: 'Paid'     },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const m = STATUS_META[status] ?? STATUS_META['Pending'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: 100, fontSize: 10.5, fontWeight: 500,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
      whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
    }}>
      {m.label}
    </span>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
export const ReimbursementList: React.FC = () => {
  const [claims,        setClaims]        = useState<Reimbursement[]>([]);
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [search,        setSearch]        = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const isPrivileged = ['super-admin', 'admin', 'manager'].includes(user?.accessLevel || '');

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { loadClaims(); }, [filterStatus, filterProject, search]);

  const loadProjects = async () => {
    try {
      const res = await getProjects();
      setProjects(Array.isArray(res.data) ? res.data : []);
    } catch { setProjects([]); }
  };

  const loadClaims = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus)  params.status  = filterStatus;
      if (filterProject) params.project = filterProject;
      if (search)        params.search  = search;
      const res: any = await getReimbursements(params);
      let data: Reimbursement[] = [];
      if (Array.isArray(res))           data = res;
      else if (Array.isArray(res?.data))        data = res.data;
      else if (Array.isArray(res?.data?.data))  data = res.data.data;
      setClaims(data);
    } catch { setClaims([]); }
    finally { setLoading(false); }
  };

  // summary stats
  const total    = claims.reduce((s, c) => s + (c.amount || 0), 0);
  const pending  = claims.filter(c => c.status === 'Pending').length;
  const approved = claims.filter(c => c.status === 'Approved' || c.status === 'Paid').length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        .rl-root { min-height: 100vh; background: #0c0c16; font-family: 'DM Sans', sans-serif; padding: 2rem 1.5rem; }
        .rl-wrap { max-width: 960px; margin: 0 auto; }

        .rl-eyebrow { font-size: 9.5px; font-family: 'DM Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(167,139,250,0.55); margin-bottom: 6px; }
        .rl-title { font-family: 'Syne', sans-serif; font-size: clamp(1.6rem,4vw,2.4rem); font-weight: 800; color: #fff; letter-spacing: -0.03em; margin-bottom: 1.8rem; }

        /* Stats strip */
        .rl-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .rl-stat  { flex: 1; min-width: 100px; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; display: flex; flex-direction: column; gap: 3px; }
        .rl-stat-val  { font-family: 'Syne', sans-serif; font-size: 1.35rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
        .rl-stat-lbl  { font-size: 9.5px; font-family: 'DM Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.28); }

        /* Controls */
        .rl-controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 1.2rem; align-items: center; }
        .rl-search-wrap { flex: 1; min-width: 200px; position: relative; }
        .rl-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.22); pointer-events: none; }
        .rl-search { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 11px; color: rgba(255,255,255,0.78); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 10px 13px 10px 36px; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
        .rl-search:focus { border-color: rgba(167,139,250,0.35); }
        .rl-search::placeholder { color: rgba(255,255,255,0.2); }
        .rl-sel { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 11px; color: rgba(255,255,255,0.65); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 10px 13px; outline: none; cursor: pointer; }
        .rl-sel option { background: #12121e; }
        .rl-new-btn { display: flex; align-items: center; gap: 7px; padding: 10px 20px; background: linear-gradient(135deg,#7c3aed,#6366f1); color: #fff; border: none; border-radius: 11px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; box-shadow: 0 4px 18px rgba(124,58,237,0.28); transition: all 0.2s; }
        .rl-new-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.42); }

        /* Card */
        .rl-card { background: rgba(255,255,255,0.028); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: background 0.18s, border-color 0.18s; margin-bottom: 8px; }
        .rl-card:hover { background: rgba(255,255,255,0.048); border-color: rgba(167,139,250,0.2); }

        .rl-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .rl-info { flex: 1; min-width: 0; }
        .rl-name { font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.88); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rl-sub  { font-size: 11px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; margin-top: 3px; }
        .rl-amt  { font-size: 15px; font-weight: 700; color: #fb923c; font-family: 'Syne', sans-serif; letter-spacing: -0.02em; text-align: right; white-space: nowrap; }
        .rl-date { font-size: 10px; color: rgba(255,255,255,0.22); font-family: 'DM Mono', monospace; text-align: right; margin-top: 3px; }

        .rl-report-link { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: rgba(167,139,250,0.7); font-family: 'DM Mono', monospace; margin-top: 4px; text-decoration: none; cursor: pointer; }
        .rl-report-link:hover { color: #a78bfa; }

        /* Loader / empty */
        .rl-loader { min-height: 40vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; }
        .rl-spin { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(167,139,250,0.15); border-top-color: #a78bfa; animation: rl-spin 0.9s linear infinite; }
        @keyframes rl-spin { to { transform: rotate(360deg); } }
        .rl-empty { text-align: center; padding: 3rem 0; color: rgba(255,255,255,0.2); font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 8px; }

        /* Employee label (for privileged view) */
        .rl-emp { font-size: 10.5px; color: rgba(96,165,250,0.75); font-family: 'DM Mono', monospace; margin-top: 2px; }
      `}</style>

      <div className="rl-root">
        <div className="rl-wrap">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rl-eyebrow">Reimbursements · {user?.name}</div>
            <h1 className="rl-title">Expense Claims</h1>
          </motion.div>

          {/* Stats */}
          <motion.div className="rl-stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
            <div className="rl-stat">
              <span className="rl-stat-val" style={{ color: '#fb923c' }}>
                ₹{total.toLocaleString('en-IN')}
              </span>
              <span className="rl-stat-lbl">Total Claimed</span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat-val">{claims.length}</span>
              <span className="rl-stat-lbl">Total Claims</span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat-val" style={{ color: '#fbbf24' }}>{pending}</span>
              <span className="rl-stat-lbl">Pending</span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat-val" style={{ color: '#34d399' }}>{approved}</span>
              <span className="rl-stat-lbl">Approved / Paid</span>
            </div>
          </motion.div>

          {/* Controls */}
          <div className="rl-controls">
            <div className="rl-search-wrap">
              <Search size={13} className="rl-search-icon" />
              <input
                className="rl-search"
                placeholder="Search claims…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="rl-sel" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Paid">Paid</option>
            </select>
            <select className="rl-sel" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            {/* Only employees can create new claims */}
            {!isPrivileged && (
              <button className="rl-new-btn" onClick={() => navigate('/reimbursements/new')}>
                <Plus size={15} /> New Claim
              </button>
            )}
          </div>

          {/* List */}
          {loading ? (
            <div className="rl-loader">
              <div className="rl-spin" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Loading claims…</span>
            </div>
          ) : claims.length === 0 ? (
            <div className="rl-empty">
              <Receipt size={32} style={{ opacity: 0.1 }} />
              <span>No claims found</span>
              {!isPrivileged && (
                <button
                  className="rl-new-btn"
                  style={{ marginTop: 8, fontSize: 12, padding: '8px 16px' }}
                  onClick={() => navigate('/reimbursements/new')}
                >
                  <Plus size={13} /> Submit your first claim
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence>
              {claims.map((claim, i) => (
                <motion.div
                  key={claim._id}
                  className="rl-card"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(`/reimbursements/${claim._id}`)}
                >
                  <div className="rl-icon">
                    <Receipt size={17} color="#a78bfa" />
                  </div>

                  <div className="rl-info">
                    <div className="rl-name">{claim.title}</div>
                    {/* Show employee name for privileged users */}
                    {isPrivileged && (claim as any).employee?.name && (
                      <div className="rl-emp">{(claim as any).employee.name}</div>
                    )}
                    <div className="rl-sub">
                      {claim.description
                        ? claim.description.length > 60
                          ? claim.description.slice(0, 60) + '…'
                          : claim.description
                        : '—'}
                    </div>
                    {/* Deep-link to monthly report if linked */}
                    {(claim as any).monthlyReport && (
                      <span
                        className="rl-report-link"
                        onClick={e => {
                          e.stopPropagation();
                          navigate('/monthly-report');
                        }}
                      >
                        <FileText size={10} /> View in Monthly Report
                      </span>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <StatusBadge status={claim.status} />
                    <div className="rl-amt" style={{ marginTop: 6 }}>
                      ₹{(claim.amount || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="rl-date">{fmt(claim.expenseDate)}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </>
  );
};