import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, FolderKanban, CheckSquare, Activity,
  Receipt, TrendingUp, ChevronRight, Check, X,
  Clock, AlertCircle, Eye, BarChart2, Star,
  Search, Filter, ChevronDown, Loader2,
  UserCheck, Briefcase, Award, Target,
  ArrowUpRight, ArrowDownRight, Minus,
  RefreshCw, Calendar, DollarSign
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// ── API helpers ──────────────────────────────────────────────────────────────
import {
  getUsers,
  getProjects,
  getTasks,
  getActivities,
  getReimbursements,
  updateReimbursementStatus,
} from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────
type TabId = 'overview' | 'projects' | 'tasks' | 'activities' | 'reimbursements' | 'performance';

interface StatCard { label: string; value: number | string; icon: React.ReactNode; color: string; delta?: number; }

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',        label: 'Overview',        icon: <BarChart2 size={15} /> },
  { id: 'projects',        label: 'Projects',         icon: <FolderKanban size={15} /> },
  { id: 'tasks',           label: 'Tasks',            icon: <CheckSquare size={15} /> },
  { id: 'activities',      label: 'Activities',       icon: <Activity size={15} /> },
  { id: 'reimbursements',  label: 'Reimbursements',   icon: <Receipt size={15} /> },
  { id: 'performance',     label: 'Performance',      icon: <TrendingUp size={15} /> },
];

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  active:     { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  inactive:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  completed:  { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  done:       { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  pending:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  approved:   { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  rejected:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  paid:       { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  planned:    { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'on hold':  { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  cancelled:  { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  'to do':    { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  review:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  inprogress: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  'in progress': { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  'in-progress': { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  open:       { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
};

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#7c3aed,#6366f1)',
  'linear-gradient(135deg,#0891b2,#06b6d4)',
  'linear-gradient(135deg,#059669,#10b981)',
  'linear-gradient(135deg,#d97706,#f59e0b)',
  'linear-gradient(135deg,#db2777,#ec4899)',
];
const avatarGrad = (name: string = '') =>
  AVATAR_GRADIENTS[(name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];
const initials = (name: string = '') =>
  name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

const fmt = (n: number) =>
  n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`;

// ── Component ─────────────────────────────────────────────────────────────────
export const HRDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Data
  const [users, setUsers]                 = useState<any[]>([]);
  const [projects, setProjects]           = useState<any[]>([]);
  const [tasks, setTasks]                 = useState<any[]>([]);
  const [activities, setActivities]       = useState<any[]>([]);
  const [reimbursements, setReimbursements] = useState<any[]>([]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, pRes, tRes, aRes, rRes] = await Promise.allSettled([
        getUsers(1, 100),
        getProjects(),
        getTasks(),
        getActivities(),
        getReimbursements(),
      ]);

      // Some endpoints return a bare array, others wrap it as { key: [...] }.
      // pick() returns an array no matter which shape comes back.
      const pick = (d: any, key: string): any[] => {
        if (Array.isArray(d)) return d;
        if (d && Array.isArray(d[key])) return d[key];
        return [];
      };

      if (uRes.status === 'fulfilled') setUsers(pick(uRes.value.data, 'users'));
      if (pRes.status === 'fulfilled') setProjects(pick(pRes.value.data, 'projects'));
      if (tRes.status === 'fulfilled') setTasks(pick(tRes.value.data, 'tasks'));
      if (aRes.status === 'fulfilled') setActivities(pick(aRes.value.data, 'activities'));
      if (rRes.status === 'fulfilled') setReimbursements(pick(rRes.value.data, 'reimbursements'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Reimbursement actions ─────────────────────────────────────────────────
  const handleReimAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id + action);
    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
    try {
      await updateReimbursementStatus(id, { status: newStatus });
      setReimbursements(prev =>
        prev.map(r => r._id === id ? { ...r, status: newStatus } : r)
      );
      showToast(`Reimbursement ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
    } catch (e: any) {
      showToast(e?.response?.data?.msg || 'Action failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Render-time safety net ────────────────────────────────────────────────
  // Guarantees every collection is an array even if state was somehow set to a
  // non-array (e.g. an unexpected API shape). Prevents `.filter is not a function`.
  const safe = (v: any): any[] => (Array.isArray(v) ? v : []);
  const usersArr          = safe(users);
  const projectsArr       = safe(projects);
  const tasksArr          = safe(tasks);
  const activitiesArr     = safe(activities);
  const reimbursementsArr = safe(reimbursements);

  // ── Derived / filtered data ───────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredProjects     = projectsArr.filter(p => !q || p.name?.toLowerCase().includes(q) || p.status?.toLowerCase().includes(q));
  const filteredTasks        = tasksArr.filter(t => !q || t.title?.toLowerCase().includes(q) || t.status?.toLowerCase().includes(q));
  const filteredActivities   = activitiesArr.filter(a => !q || a.name?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
  const filteredReims        = reimbursementsArr.filter(r => !q || r.title?.toLowerCase().includes(q) || r.status?.toLowerCase().includes(q));

  const pendingReims = reimbursementsArr.filter(r => r.status === 'Pending').length;
  const totalReimAmt = reimbursementsArr.filter(r => r.status === 'Approved').reduce((s, r) => s + (r.amount || 0), 0);
  const activeUsers  = usersArr.filter(u => u.status === 'active').length;
  const doneTasks    = tasksArr.filter(t => t.status === 'Done').length;

  // Performance: tasks done per user
  const perfData = usersArr.map(u => {
    const uid = u._id;
    const assigned  = tasksArr.filter(t => t.assignee === uid || t.assignee?._id === uid).length;
    const completed = tasksArr.filter(t => (t.assignee === uid || t.assignee?._id === uid) && t.status === 'Done').length;
    const rate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
    const userReims = reimbursementsArr.filter(r => r.employee === uid || r.employee?._id === uid).length;
    return { ...u, assigned, completed, rate, userReims };
  }).sort((a, b) => b.rate - a.rate);

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    .hr-root {
      min-height: 100vh;
      background: #0a0a0f;
      background-image:
        radial-gradient(ellipse 80% 50% at 20% -20%, rgba(251,146,60,0.09) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 80% 110%, rgba(99,102,241,0.07) 0%, transparent 60%);
      padding: 2.5rem 1.5rem 5rem;
      font-family: 'Sora', sans-serif;
    }
    .hr-container { max-width: 1100px; margin: 0 auto; }

    /* ── Top bar ── */
    .hr-topbar {
      display: flex; align-items: flex-end; justify-content: space-between;
      margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;
    }
    .hr-breadcrumb {
      font-size: 11px; color: rgba(255,255,255,0.3);
      letter-spacing: 0.1em; text-transform: uppercase;
      font-family: 'JetBrains Mono', monospace; margin-bottom: 0.4rem;
    }
    .hr-title {
      font-size: 1.85rem; font-weight: 700; color: #fff;
      letter-spacing: -0.03em; margin: 0 0 0.25rem;
    }
    .hr-title em {
      font-style: normal;
      background: linear-gradient(135deg, #fb923c, #f59e0b);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .hr-subtitle { font-size: 13px; color: rgba(255,255,255,0.3); font-weight: 300; }
    .hr-refresh {
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px; color: rgba(255,255,255,0.4); cursor: pointer;
      padding: 8px 14px; display: flex; align-items: center; gap: 7px;
      font-size: 13px; font-family: 'Sora', sans-serif;
      transition: all 0.15s ease;
    }
    .hr-refresh:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.75); }

    /* ── Tabs ── */
    .hr-tabs {
      display: flex; gap: 4px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px; padding: 5px;
      margin-bottom: 2rem; overflow-x: auto;
      scrollbar-width: none;
    }
    .hr-tabs::-webkit-scrollbar { display: none; }
    .hr-tab {
      display: flex; align-items: center; gap: 7px;
      padding: 9px 16px; border-radius: 10px;
      font-size: 13px; font-weight: 500; white-space: nowrap;
      cursor: pointer; border: none; background: none;
      color: rgba(255,255,255,0.35); font-family: 'Sora', sans-serif;
      transition: all 0.18s ease; flex-shrink: 0;
    }
    .hr-tab:hover { color: rgba(255,255,255,0.65); background: rgba(255,255,255,0.05); }
    .hr-tab.active {
      background: rgba(251,146,60,0.15);
      color: #fb923c;
      border: 1px solid rgba(251,146,60,0.3);
    }
    .hr-tab-badge {
      background: rgba(251,146,60,0.2); color: #fb923c;
      border-radius: 100px; font-size: 10px; font-weight: 600;
      padding: 1px 7px; line-height: 1.6;
    }

    /* ── Search ── */
    .hr-search-wrap { position: relative; margin-bottom: 1.5rem; }
    .hr-search-icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: rgba(255,255,255,0.25); display: flex; pointer-events: none;
    }
    .hr-search {
      width: 100%; box-sizing: border-box;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; color: rgba(255,255,255,0.85);
      font-family: 'Sora', sans-serif; font-size: 14px;
      padding: 11px 16px 11px 42px; outline: none; transition: all 0.2s;
    }
    .hr-search::placeholder { color: rgba(255,255,255,0.2); }
    .hr-search:focus {
      border-color: rgba(251,146,60,0.4);
      background: rgba(251,146,60,0.05);
      box-shadow: 0 0 0 3px rgba(251,146,60,0.07);
    }

    /* ── Stat grid ── */
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 1.5rem; }
    .stat-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 18px 20px;
      display: flex; flex-direction: column; gap: 8px;
      position: relative; overflow: hidden;
    }
    .stat-card::before {
      content: ''; position: absolute;
      top: 0; left: 0; right: 0; height: 2px;
    }
    .stat-icon {
      width: 34px; height: 34px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 4px;
    }
    .stat-value { font-size: 1.6rem; font-weight: 700; color: #fff; letter-spacing: -0.03em; }
    .stat-label { font-size: 12px; color: rgba(255,255,255,0.35); font-weight: 400; }
    .stat-delta {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; font-family: 'JetBrains Mono', monospace;
      margin-top: 2px;
    }

    /* ── Generic card / table ── */
    .hr-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px; overflow: hidden;
    }
    .hr-card-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(255,255,255,0.02);
    }
    .hr-card-title {
      font-size: 13px; font-weight: 600;
      color: rgba(255,255,255,0.7);
      display: flex; align-items: center; gap: 8px;
    }
    .hr-card-count {
      font-size: 11px; font-family: 'JetBrains Mono', monospace;
      color: rgba(255,255,255,0.25);
    }

    /* Table */
    .hr-table { width: 100%; border-collapse: collapse; }
    .hr-thead th {
      padding: 12px 20px; text-align: left;
      font-size: 10px; font-weight: 500; letter-spacing: 0.1em;
      text-transform: uppercase; color: rgba(255,255,255,0.22);
      font-family: 'JetBrains Mono', monospace;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      background: rgba(255,255,255,0.015); white-space: nowrap;
    }
    .hr-tr {
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 0.12s;
    }
    .hr-tr:last-child { border-bottom: none; }
    .hr-tr:hover { background: rgba(255,255,255,0.025); }
    .hr-td { padding: 13px 20px; vertical-align: middle; }

    /* User cell */
    .user-cell { display: flex; align-items: center; gap: 10px; }
    .u-avatar {
      width: 32px; height: 32px; border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600; color: #fff; flex-shrink: 0;
    }
    .u-name { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.82); }
    .u-sub  { font-size: 11px; color: rgba(255,255,255,0.25); margin-top: 1px; font-family: 'JetBrains Mono', monospace; }

    /* Badge */
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 10px; border-radius: 100px;
      font-size: 11px; font-weight: 500; white-space: nowrap;
    }
    .bdot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

    /* Progress bar */
    .prog-wrap { display: flex; align-items: center; gap: 10px; }
    .prog-bar {
      flex: 1; height: 5px; border-radius: 99px;
      background: rgba(255,255,255,0.07); overflow: hidden;
    }
    .prog-fill { height: 100%; border-radius: 99px; transition: width 0.6s ease; }
    .prog-pct { font-size: 12px; font-family: 'JetBrains Mono', monospace; color: rgba(255,255,255,0.5); min-width: 34px; text-align: right; }

    /* Reim action buttons */
    .reim-actions { display: flex; gap: 6px; }
    .btn-approve {
      padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
      font-family: 'Sora', sans-serif; cursor: pointer; border: none;
      background: rgba(52,211,153,0.12); color: #34d399;
      border: 1px solid rgba(52,211,153,0.25);
      display: flex; align-items: center; gap: 5px;
      transition: all 0.15s;
    }
    .btn-approve:hover { background: rgba(52,211,153,0.22); }
    .btn-approve:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-reject {
      padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
      font-family: 'Sora', sans-serif; cursor: pointer; border: none;
      background: rgba(248,113,113,0.1); color: #f87171;
      border: 1px solid rgba(248,113,113,0.25);
      display: flex; align-items: center; gap: 5px;
      transition: all 0.15s;
    }
    .btn-reject:hover { background: rgba(248,113,113,0.2); }
    .btn-reject:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Read-only notice */
    .readonly-notice {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; color: rgba(255,255,255,0.25);
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
      border-radius: 8px; padding: 5px 10px;
    }

    /* Empty */
    .hr-empty {
      padding: 3.5rem 2rem; text-align: center;
      color: rgba(255,255,255,0.2); font-size: 13px;
    }

    /* Skeleton */
    .hr-skel {
      height: 52px;
      background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.055) 50%, rgba(255,255,255,0.03) 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

    /* Overview mini cards */
    .mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 1.5rem; }
    .mini-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px; padding: 16px 18px;
    }
    .mini-title { font-size: 11px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace; margin-bottom: 12px; }
    .mini-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .mini-row:last-child { border-bottom: none; }
    .mini-key { font-size: 12px; color: rgba(255,255,255,0.45); }
    .mini-val { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); }

    /* Perf star */
    .perf-stars { display: flex; gap: 2px; }
    .star-fill { color: #fbbf24; }
    .star-empty { color: rgba(255,255,255,0.1); }

    /* Toast */
    .hr-toast {
      position: fixed; bottom: 2rem; right: 2rem; z-index: 999;
      padding: 12px 18px; border-radius: 12px;
      font-size: 13px; font-weight: 500;
      display: flex; align-items: center; gap: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    .hr-toast.success { background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.3); color: #6ee7b7; }
    .hr-toast.error   { background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.3); color: #fca5a5; }

    /* Section label */
    .section-label {
      font-size: 10px; font-weight: 500; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(255,255,255,0.25);
      font-family: 'JetBrains Mono', monospace;
      margin: 1.5rem 0 0.75rem;
      display: flex; align-items: center; gap: 8px;
    }
    .section-label::after { content:''; flex:1; height:1px; background:rgba(255,255,255,0.05); }

    @media (max-width:768px) {
      .stat-grid { grid-template-columns: 1fr 1fr; }
      .mini-grid { grid-template-columns: 1fr; }
      .hide-mob { display: none !important; }
    }
    @media (max-width:480px) {
      .stat-grid { grid-template-columns: 1fr; }
    }
  `;

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_COLORS[status?.toLowerCase()] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
    return (
      <span className="badge" style={{ background: cfg.bg, color: cfg.color }}>
        <span className="bdot" style={{ background: cfg.color }} />
        {status ?? '—'}
      </span>
    );
  };

  const SkeletonRows = () => (
    <>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="hr-skel" />)}</>
  );

  // ── Render tabs ───────────────────────────────────────────────────────────
  const renderOverview = () => (
    <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Quick breakdown */}
      <div className="mini-grid">
        <div className="mini-card">
          <div className="mini-title">Team Snapshot</div>
          <div className="mini-row"><span className="mini-key">Total Members</span><span className="mini-val">{usersArr.length}</span></div>
          <div className="mini-row"><span className="mini-key">Active</span><span className="mini-val" style={{ color: '#34d399' }}>{activeUsers}</span></div>
          <div className="mini-row"><span className="mini-key">Inactive</span><span className="mini-val" style={{ color: '#f87171' }}>{usersArr.length - activeUsers}</span></div>
          <div className="mini-row"><span className="mini-key">Departments</span><span className="mini-val">{new Set(usersArr.map(u => u.department).filter(Boolean)).size}</span></div>
        </div>
        <div className="mini-card">
          <div className="mini-title">Work Overview</div>
          <div className="mini-row"><span className="mini-key">Total Projects</span><span className="mini-val">{projectsArr.length}</span></div>
          <div className="mini-row"><span className="mini-key">Active Projects</span><span className="mini-val" style={{ color: '#60a5fa' }}>{projectsArr.filter(p => p.status === 'Active' || p.status === 'In Progress').length}</span></div>
          <div className="mini-row"><span className="mini-key">Tasks Done</span><span className="mini-val" style={{ color: '#34d399' }}>{doneTasks} / {tasksArr.length}</span></div>
          <div className="mini-row"><span className="mini-key">Activities</span><span className="mini-val">{activitiesArr.length}</span></div>
        </div>
        <div className="mini-card">
          <div className="mini-title">Reimbursements</div>
          <div className="mini-row"><span className="mini-key">Pending</span><span className="mini-val" style={{ color: '#fbbf24' }}>{pendingReims}</span></div>
          <div className="mini-row"><span className="mini-key">Approved</span><span className="mini-val" style={{ color: '#34d399' }}>{reimbursementsArr.filter(r => r.status === 'Approved').length}</span></div>
          <div className="mini-row"><span className="mini-key">Rejected</span><span className="mini-val" style={{ color: '#f87171' }}>{reimbursementsArr.filter(r => r.status === 'Rejected').length}</span></div>
          <div className="mini-row"><span className="mini-key">Approved Total</span><span className="mini-val">{fmt(totalReimAmt)}</span></div>
        </div>
        <div className="mini-card">
          <div className="mini-title">Top Performers</div>
          {perfData.slice(0, 4).map(u => (
            <div key={u._id} className="mini-row">
              <span className="mini-key">{u.name?.split(' ')[0]}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 60, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{ width: `${u.rate}%`, height: '100%', borderRadius: 99, background: u.rate >= 75 ? '#34d399' : u.rate >= 40 ? '#fbbf24' : '#f87171' }} />
                </div>
                <span className="mini-val" style={{ fontSize: 12 }}>{u.rate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent pending reims */}
      {pendingReims > 0 && (
        <>
          <div className="section-label">Pending approvals</div>
          <div className="hr-card">
            <table className="hr-table">
              <thead className="hr-thead">
                <tr><th>Employee</th><th>Amount</th><th>Category</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {reimbursementsArr.filter(r => r.status === 'Pending').slice(0, 5).map(r => (
                  <tr key={r._id} className="hr-tr">
                    <td className="hr-td">
                      <div className="user-cell">
                        <div className="u-avatar" style={{ background: avatarGrad(r.employee?.name) }}>
                          {initials(r.employee?.name || '?')}
                        </div>
                        <div>
                          <div className="u-name">{r.employee?.name || 'Unknown'}</div>
                          <div className="u-sub">{r.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hr-td" style={{ color: '#fbbf24', fontWeight: 600 }}>{fmt(r.amount || 0)}</td>
                    <td className="hr-td"><StatusBadge status={r.project?.name || 'general'} /></td>
                    <td className="hr-td">
                      <div className="reim-actions">
                        <button className="btn-approve" disabled={!!actionLoading} onClick={() => handleReimAction(r._id, 'approve')}>
                          {actionLoading === r._id + 'approve' ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Check size={11} />} Approve
                        </button>
                        <button className="btn-reject" disabled={!!actionLoading} onClick={() => handleReimAction(r._id, 'reject')}>
                          {actionLoading === r._id + 'reject' ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <X size={11} />} Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </motion.div>
  );

  const renderProjects = () => (
    <motion.div key="proj" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hr-card">
        <div className="hr-card-header">
          <span className="hr-card-title"><FolderKanban size={14} /> All Projects</span>
          <span className="readonly-notice"><Eye size={11} /> Read-only view</span>
        </div>
        {loading ? <SkeletonRows /> : filteredProjects.length === 0 ? <div className="hr-empty">No projects found</div> : (
          <table className="hr-table">
            <thead className="hr-thead">
              <tr><th>Project</th><th>Status</th><th className="hide-mob">Team</th><th className="hide-mob">Progress</th></tr>
            </thead>
            <tbody>
              {filteredProjects.map((p, i) => (
                <motion.tr key={p._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td">
                    <div className="u-name">{p.name || p.title}</div>
                    <div className="u-sub">{p.description?.slice(0, 60) || '—'}</div>
                  </td>
                  <td className="hr-td"><StatusBadge status={p.status} /></td>
                  <td className="hr-td hide-mob">
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {Array.isArray(p.team) ? `${p.team.length} members` : '—'}
                    </span>
                  </td>
                  <td className="hr-td hide-mob">
                    {typeof p.progress === 'number' ? (
                      <div className="prog-wrap">
                        <div className="prog-bar">
                          <div className="prog-fill" style={{ width: `${p.progress}%`, background: p.progress >= 75 ? '#34d399' : p.progress >= 40 ? '#fbbf24' : '#f87171' }} />
                        </div>
                        <span className="prog-pct">{p.progress}%</span>
                      </div>
                    ) : '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );

  const renderTasks = () => (
    <motion.div key="tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hr-card">
        <div className="hr-card-header">
          <span className="hr-card-title"><CheckSquare size={14} /> All Tasks</span>
          <span className="readonly-notice"><Eye size={11} /> Read-only view</span>
        </div>
        {loading ? <SkeletonRows /> : filteredTasks.length === 0 ? <div className="hr-empty">No tasks found</div> : (
          <table className="hr-table">
            <thead className="hr-thead">
              <tr><th>Task</th><th>Assigned To</th><th>Status</th><th className="hide-mob">Priority</th></tr>
            </thead>
            <tbody>
              {filteredTasks.map((t, i) => (
                <motion.tr key={t._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td">
                    <div className="u-name">{t.title}</div>
                    <div className="u-sub">{t.project?.name || '—'}</div>
                  </td>
                  <td className="hr-td">
                    <div className="user-cell">
                      <div className="u-avatar" style={{ width: 26, height: 26, fontSize: 10, borderRadius: 7, background: avatarGrad(t.assignee?.name || '') }}>
                        {initials(t.assignee?.name || '?')}
                      </div>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t.assignee?.name || 'Unassigned'}</span>
                    </div>
                  </td>
                  <td className="hr-td"><StatusBadge status={t.status} /></td>
                  <td className="hr-td hide-mob">
                    {t.priority ? <StatusBadge status={t.priority} /> : '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );

  const renderActivities = () => (
    <motion.div key="act" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hr-card">
        <div className="hr-card-header">
          <span className="hr-card-title"><Activity size={14} /> All Activities</span>
          <span className="readonly-notice"><Eye size={11} /> Read-only view</span>
        </div>
        {loading ? <SkeletonRows /> : filteredActivities.length === 0 ? <div className="hr-empty">No activities found</div> : (
          <table className="hr-table">
            <thead className="hr-thead">
              <tr><th>Activity</th><th>User</th><th>Status</th><th className="hide-mob">Date</th></tr>
            </thead>
            <tbody>
              {filteredActivities.map((a, i) => (
                <motion.tr key={a._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td">
                    <div className="u-name">{a.name || a.description?.slice(0, 50)}</div>
                    <div className="u-sub">{a.task?.title || a.activityType || '—'}</div>
                  </td>
                  <td className="hr-td">
                    <div className="user-cell">
                      <div className="u-avatar" style={{ width: 26, height: 26, fontSize: 10, borderRadius: 7, background: avatarGrad(a.assignee?.name || '') }}>
                        {initials(a.assignee?.name || '?')}
                      </div>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{a.assignee?.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="hr-td"><StatusBadge status={a.status || 'Pending'} /></td>
                  <td className="hr-td hide-mob" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono' }}>
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );

  const renderReimbursements = () => (
    <motion.div key="reim" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hr-card">
        <div className="hr-card-header">
          <span className="hr-card-title"><Receipt size={14} /> Reimbursements</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono' }}>
            {pendingReims} pending
          </span>
        </div>
        {loading ? <SkeletonRows /> : filteredReims.length === 0 ? <div className="hr-empty">No reimbursements found</div> : (
          <table className="hr-table">
            <thead className="hr-thead">
              <tr><th>Employee</th><th>Title</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredReims.map((r, i) => {
                const isPending = r.status === 'Pending';
                return (
                  <motion.tr key={r._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                    <td className="hr-td">
                      <div className="user-cell">
                        <div className="u-avatar" style={{ background: avatarGrad(r.employee?.name) }}>
                          {initials(r.employee?.name || '?')}
                        </div>
                        <div>
                          <div className="u-name">{r.employee?.name || 'Unknown'}</div>
                          <div className="u-sub">{r.employee?.department || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hr-td">
                      <div className="u-name" style={{ fontSize: 13 }}>{r.title || r.description?.slice(0, 40)}</div>
                      <div className="u-sub">{r.project?.name || '—'}</div>
                    </td>
                    <td className="hr-td" style={{ fontWeight: 600, color: '#fbbf24' }}>{fmt(r.amount || 0)}</td>
                    <td className="hr-td"><StatusBadge status={r.status} /></td>
                    <td className="hr-td">
                      {isPending ? (
                        <div className="reim-actions">
                          <button
                            className="btn-approve"
                            disabled={!!actionLoading}
                            onClick={() => handleReimAction(r._id, 'approve')}
                          >
                            {actionLoading === r._id + 'approve'
                              ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} />
                              : <Check size={11} />}
                            Approve
                          </button>
                          <button
                            className="btn-reject"
                            disabled={!!actionLoading}
                            onClick={() => handleReimAction(r._id, 'reject')}
                          >
                            {actionLoading === r._id + 'reject'
                              ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> 
                              : <X size={11} />}
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
                          {r.status === 'Approved' ? 'Approved ✓' : r.status === 'Rejected' ? 'Rejected ✗' : r.status}
                        </span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );

  const renderPerformance = () => (
    <motion.div key="perf" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hr-card">
        <div className="hr-card-header">
          <span className="hr-card-title"><TrendingUp size={14} /> Employee Performance</span>
          <span className="readonly-notice"><Eye size={11} /> HR view</span>
        </div>
        {loading ? <SkeletonRows /> : perfData.length === 0 ? <div className="hr-empty">No data</div> : (
          <table className="hr-table">
            <thead className="hr-thead">
              <tr><th>#</th><th>Employee</th><th>Tasks Assigned</th><th>Completed</th><th>Completion Rate</th><th className="hide-mob">Reims</th></tr>
            </thead>
            <tbody>
              {perfData.map((u, i) => (
                <motion.tr key={u._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td" style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: 'JetBrains Mono' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </td>
                  <td className="hr-td">
                    <div className="user-cell">
                      <div className="u-avatar" style={{ background: avatarGrad(u.name) }}>{initials(u.name)}</div>
                      <div>
                        <div className="u-name">{u.name}</div>
                        <div className="u-sub">{u.designation || u.accessLevel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hr-td" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{u.assigned}</td>
                  <td className="hr-td" style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>{u.completed}</td>
                  <td className="hr-td" style={{ minWidth: 160 }}>
                    <div className="prog-wrap">
                      <div className="prog-bar">
                        <div
                          className="prog-fill"
                          style={{
                            width: `${u.rate}%`,
                            background: u.rate >= 75
                              ? 'linear-gradient(90deg,#059669,#34d399)'
                              : u.rate >= 40
                              ? 'linear-gradient(90deg,#d97706,#fbbf24)'
                              : 'linear-gradient(90deg,#dc2626,#f87171)',
                          }}
                        />
                      </div>
                      <span className="prog-pct">{u.rate}%</span>
                    </div>
                  </td>
                  <td className="hr-td hide-mob" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    {u.userReims} filed
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );

  return (
    <>
      <style>{CSS}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="hr-root">
        <div className="hr-container">

          {/* Top bar */}
          <motion.div className="hr-topbar" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <div className="hr-breadcrumb">HR Portal / <span style={{ color: 'rgba(255,255,255,0.5)' }}>Dashboard</span></div>
              <h1 className="hr-title">HR <em>Dashboard</em></h1>
              <p className="hr-subtitle">Welcome, {currentUser?.name?.split(' ')[0] ?? 'HR'} — read access across all modules</p>
            </div>
            <button className="hr-refresh" onClick={loadAll}>
              <RefreshCw size={13} /> Refresh
            </button>
          </motion.div>

          {/* Stat cards */}
          <motion.div className="stat-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            {[
              { label: 'Active Members', value: activeUsers, icon: <Users size={15} />, color: '#a78bfa' },
              { label: 'Total Projects', value: projectsArr.length, icon: <FolderKanban size={15} />, color: '#60a5fa' },
              { label: 'Tasks Done', value: `${doneTasks}/${tasksArr.length}`, icon: <CheckSquare size={15} />, color: '#34d399' },
              { label: 'Pending Reims', value: pendingReims, icon: <Receipt size={15} />, color: '#fbbf24' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className="stat-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.06 }}
                style={{ '--accent': s.color } as any}
              >
                <style>{`.stat-card:nth-child(${i + 1})::before { background: ${s.color}; opacity: 0.7; }`}</style>
                <div className="stat-icon" style={{ background: `${s.color}18` }}>
                  <span style={{ color: s.color }}>{s.icon}</span>
                </div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>

          {/* Tabs */}
          <motion.div className="hr-tabs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`hr-tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.icon} {t.label}
                {t.id === 'reimbursements' && pendingReims > 0 && (
                  <span className="hr-tab-badge">{pendingReims}</span>
                )}
              </button>
            ))}
          </motion.div>

          {/* Search (hide on overview) */}
          {activeTab !== 'overview' && (
            <div className="hr-search-wrap">
              <div className="hr-search-icon"><Search size={15} /></div>
              <input
                className="hr-search"
                placeholder={`Search ${activeTab}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {activeTab === 'overview'       && renderOverview()}
            {activeTab === 'projects'       && renderProjects()}
            {activeTab === 'tasks'          && renderTasks()}
            {activeTab === 'activities'     && renderActivities()}
            {activeTab === 'reimbursements' && renderReimbursements()}
            {activeTab === 'performance'    && renderPerformance()}
          </AnimatePresence>

        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`hr-toast ${toast.type}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            {toast.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};