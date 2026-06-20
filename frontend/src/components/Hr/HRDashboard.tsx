import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, FolderKanban, CheckSquare, Activity,
  Receipt, TrendingUp, Check, X,
  AlertCircle, Eye, BarChart2,
  Search, Loader2, RefreshCw,
  Sun, Moon, FileText, FolderOpen,
  Download, Clock, ChevronLeft, ChevronRight,
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
  getAllEmployees,
} from '../../api/client';

// ── Employee-report deps (ported from AdminDashboard) ─────────────────────────
import type { User, Project, Activity as ActivityType } from '../types/index';
import { downloadCSV } from '../utils/exportCSV';
import { downloadPDF } from '../utils/exportPDF';

// ── Types ─────────────────────────────────────────────────────────────────────
type TabId = 'overview' | 'projects' | 'tasks' | 'reports' | 'activities' | 'reimbursements' | 'performance';
type Theme = 'light' | 'dark';
type WorkFilter = 'ongoing' | 'all' | 'done';
type ReimFilter = 'pending' | 'all';
type ReportTab = 'updates' | 'activities' | 'summary';

interface EmployeeReportData { projects: Project[]; activities: ActivityType[]; }

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',        label: 'Overview',          icon: <BarChart2 size={15} /> },
  { id: 'projects',        label: 'Projects',           icon: <FolderKanban size={15} /> },
  { id: 'tasks',           label: 'Tasks',              icon: <CheckSquare size={15} /> },
  { id: 'reports',         label: 'Employee Reports',   icon: <FileText size={15} /> },
  { id: 'activities',      label: 'Activities',         icon: <Activity size={15} /> },
  { id: 'reimbursements',  label: 'Reimbursements',     icon: <Receipt size={15} /> },
  { id: 'performance',     label: 'Performance',        icon: <TrendingUp size={15} /> },
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EMP_PER_PAGE = 12;
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 4 + i); // ...→ current+1

// Map any status / priority string → a semantic badge variant that adapts to theme.
const STATUS_VARIANT: Record<string, string> = {
  active: 'success', completed: 'success', done: 'success', approved: 'success', paid: 'success',
  inactive: 'danger', rejected: 'danger', cancelled: 'danger',
  pending: 'warn', 'on hold': 'warn',
  review: 'info', inprogress: 'info', 'in progress': 'info', 'in-progress': 'info',
  planned: 'purple', 'to do': 'purple', open: 'purple',
  high: 'danger', medium: 'warn', low: 'info',
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

const fmt = (n: number) => (n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`); // currency
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const timeAgo = (d: string) => {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

// Progress → theme-aware colour var
const progressVar = (pct: number) =>
  pct >= 80 ? 'var(--c-green)' : pct >= 50 ? 'var(--c-amber)' : pct >= 25 ? 'var(--c-blue)' : 'var(--c-slate)';

// "Ongoing" = anything not finished/cancelled. "Done" = finished.
const isDoneStatus = (s: string = '') => ['done', 'completed'].includes(s.toLowerCase());
const isOngoingStatus = (s: string = '') =>
  !['done', 'completed', 'cancelled'].includes(s.toLowerCase());

// ── Component ─────────────────────────────────────────────────────────────────
export const HRDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Theme (white default) — persisted to localStorage.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hr-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'light';
  });
  useEffect(() => { try { localStorage.setItem('hr-theme', theme); } catch { /* ignore */ } }, [theme]);

  // Focus filters
  const [projFilter, setProjFilter] = useState<WorkFilter>('ongoing');
  const [taskFilter, setTaskFilter] = useState<WorkFilter>('ongoing');
  const [reimFilter, setReimFilter] = useState<ReimFilter>('pending');

  // Core data
  const [users, setUsers]                 = useState<any[]>([]);
  const [projects, setProjects]           = useState<any[]>([]);
  const [tasks, setTasks]                 = useState<any[]>([]);
  const [activities, setActivities]       = useState<any[]>([]);
  const [reimbursements, setReimbursements] = useState<any[]>([]);

  // Employee-report state (lazy-loaded on Reports tab)
  const [employees, setEmployees]         = useState<User[]>([]);
  const [empLoaded, setEmpLoaded]         = useState(false);
  const [empLoading, setEmpLoading]       = useState(false);
  const [empSearch, setEmpSearch]         = useState('');
  const [empPage, setEmpPage]             = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [reportData, setReportData]       = useState<EmployeeReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [exporting, setExporting]         = useState<'pdf' | 'csv' | null>(null);
  const [repYear, setRepYear]             = useState(new Date().getFullYear());
  const [repMonth, setRepMonth]           = useState(new Date().getMonth() + 1);
  const [showReport, setShowReport]       = useState(false);
  const [repTab, setRepTab]               = useState<ReportTab>('updates');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, pRes, tRes, aRes, rRes] = await Promise.allSettled([
        getUsers(1, 100), getProjects(), getTasks(), getActivities(), getReimbursements(),
      ]);
      // Endpoints differ in shape: bare arrays, { key: [...] }, or { data: [...] }.
      // pick() returns an array no matter which wrapper key the API uses.
      const pick = (d: any, ...keys: string[]): any[] => {
        if (Array.isArray(d)) return d;
        for (const k of keys) if (d && Array.isArray(d[k])) return d[k];
        return [];
      };
      if (uRes.status === 'fulfilled') setUsers(pick(uRes.value.data, 'users', 'data'));
      if (pRes.status === 'fulfilled') setProjects(pick(pRes.value.data, 'projects', 'data'));
      if (tRes.status === 'fulfilled') setTasks(pick(tRes.value.data, 'tasks', 'data'));
      if (aRes.status === 'fulfilled') setActivities(pick(aRes.value.data, 'activities', 'data'));
      if (rRes.status === 'fulfilled') setReimbursements(pick(rRes.value.data, 'data', 'reimbursements'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Lazy-load full employee roster when Reports tab is first opened ─────────
  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    try {
      const emps = await getAllEmployees();
      setEmployees(Array.isArray(emps) ? emps : []);
      setEmpLoaded(true);
    } catch (e) {
      console.error(e);
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  }, []);
  useEffect(() => { if (activeTab === 'reports' && !empLoaded) loadEmployees(); }, [activeTab, empLoaded, loadEmployees]);
  useEffect(() => { setEmpPage(1); }, [empSearch]);

  // ── Reimbursement actions ─────────────────────────────────────────────────
  const handleReimAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id + action);
    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
    try {
      await updateReimbursementStatus(id, { status: newStatus });
      setReimbursements(prev => prev.map(r => r._id === id ? { ...r, status: newStatus } : r));
      showToast(`Reimbursement ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
    } catch (e: any) {
      showToast(e?.response?.data?.msg || 'Action failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Fetch a single employee's projects + activities for month/year ─────────
  const fetchReport = async (emp: User, y: number, m: number) => {
    setReportLoading(true);
    setReportData(null);
    try {
      const [pRes, aRes] = await Promise.all([
        getProjects(),
        getActivities({ assignee: emp._id }),
      ]);

      const pData = pRes.data as Project[] | { projects: Project[]; pagination: unknown };
      const allProjects: Project[] = Array.isArray(pData) ? pData : (pData.projects ?? []);

      // Only projects where this employee is a team member or the manager.
      const empProjects = allProjects.filter(p => {
        const members = (p.teamMembers || []).map((tm: any) => (typeof tm === 'string' ? tm : tm._id));
        const managerId = typeof p.projectManager === 'string' ? p.projectManager : p.projectManager?._id || '';
        return members.includes(emp._id) || managerId === emp._id;
      });

      // Keep only progress updates inside the chosen month/year.
      const projectsThisMonth = empProjects
        .map(p => ({
          ...p,
          progressUpdates: (p.progressUpdates || []).filter(u => {
            const d = new Date(u.createdAt);
            return d.getFullYear() === y && d.getMonth() + 1 === m;
          }),
        }))
        .filter(p => p.progressUpdates.length > 0);

      const allActivities: ActivityType[] = Array.isArray(aRes.data) ? aRes.data : [];
      const activitiesThisMonth = allActivities.filter(a => {
        const ref = a.startDate || a.createdAt;
        if (!ref) return false;
        const d = new Date(ref);
        return d.getFullYear() === y && d.getMonth() + 1 === m;
      });

      setReportData({ projects: projectsThisMonth, activities: activitiesThisMonth });
    } catch (err) {
      console.error(err);
      setReportData({ projects: [], activities: [] });
    } finally {
      setReportLoading(false);
    }
  };

  const handleViewReport = (emp: User) => {
    setSelectedEmployee(emp);
    setShowReport(true);
    setRepTab('updates');
    fetchReport(emp, repYear, repMonth);
  };
  const handleReportRefresh = () => { if (selectedEmployee) fetchReport(selectedEmployee, repYear, repMonth); };
  const closeReport = () => { setShowReport(false); setSelectedEmployee(null); setReportData(null); };

  const handleDownloadCSV = async () => {
    if (!reportData || !selectedEmployee) return;
    setExporting('csv');
    try {
      downloadCSV(selectedEmployee.name, MONTH_SHORT[repMonth - 1], repYear, reportData.projects, reportData.activities);
    } finally { setExporting(null); }
  };
  const handleDownloadPDF = async () => {
    if (!reportData || !selectedEmployee) return;
    setExporting('pdf');
    try {
      await downloadPDF(selectedEmployee.name, MONTH_SHORT[repMonth - 1], repYear, reportData.projects, reportData.activities);
    } catch (e) { console.error(e); }
    finally { setExporting(null); }
  };

  // ── Render-time safety net ────────────────────────────────────────────────
  const safe = (v: any): any[] => (Array.isArray(v) ? v : []);
  const usersArr          = safe(users);
  const projectsArr       = safe(projects);
  const tasksArr          = safe(tasks);
  const activitiesArr     = safe(activities);
  const reimbursementsArr = safe(reimbursements);

  // ── Derived / filtered data ───────────────────────────────────────────────
  const q = search.toLowerCase();
  const matchSearch = (...fields: (string | undefined)[]) => !q || fields.some(f => f?.toLowerCase().includes(q));

  const filteredProjects = projectsArr
    .filter(p => matchSearch(p.name, p.status))
    .filter(p => projFilter === 'all' ? true : projFilter === 'done' ? isDoneStatus(p.status) : isOngoingStatus(p.status));
  const filteredTasks = tasksArr
    .filter(t => matchSearch(t.title, t.status))
    .filter(t => taskFilter === 'all' ? true : taskFilter === 'done' ? isDoneStatus(t.status) : isOngoingStatus(t.status));
  const filteredActivities = activitiesArr.filter(a => matchSearch(a.name, a.description));
  const filteredReims = reimbursementsArr
    .filter(r => matchSearch(r.title, r.status))
    .filter(r => reimFilter === 'all' ? true : r.status === 'Pending');

  const pendingReims = reimbursementsArr.filter(r => r.status === 'Pending').length;
  const totalReimAmt = reimbursementsArr.filter(r => r.status === 'Approved').reduce((s, r) => s + (r.amount || 0), 0);
  const activeUsers  = usersArr.filter(u => u.status === 'active').length;
  const doneTasks    = tasksArr.filter(t => t.status === 'Done').length;
  const ongoingProjects = projectsArr.filter(p => isOngoingStatus(p.status)).length;
  const ongoingTasks    = tasksArr.filter(t => isOngoingStatus(t.status)).length;

  const perfData = usersArr.map(u => {
    const uid = u._id;
    const assigned  = tasksArr.filter(t => t.assignee === uid || t.assignee?._id === uid).length;
    const completed = tasksArr.filter(t => (t.assignee === uid || t.assignee?._id === uid) && t.status === 'Done').length;
    const rate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
    const userReims = reimbursementsArr.filter(r => r.employee === uid || r.employee?._id === uid).length;
    return { ...u, assigned, completed, rate, userReims };
  }).sort((a, b) => b.rate - a.rate);

  // Employee roster (Reports tab)
  const empQ = empSearch.toLowerCase();
  const empFiltered = employees.filter(e => !empQ || e.name?.toLowerCase().includes(empQ) || e.email?.toLowerCase().includes(empQ));
  const empTotalPages = Math.max(1, Math.ceil(empFiltered.length / EMP_PER_PAGE));
  const empPaginated = empFiltered.slice((empPage - 1) * EMP_PER_PAGE, empPage * EMP_PER_PAGE);

  const totalUpdates    = reportData?.projects.reduce((n, p) => n + (p.progressUpdates?.length || 0), 0) ?? 0;
  const totalActivities = reportData?.activities.length ?? 0;
  const hasReportData   = !!reportData && (reportData.projects.length > 0 || reportData.activities.length > 0);

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    /* ── Theme tokens ── */
    .hr-app {
      --bg-base:#f4f5f7; --bg-glow-1:rgba(249,115,22,0.06); --bg-glow-2:rgba(99,102,241,0.05);
      --surface:#ffffff; --surface-2:#fbfbfc; --surface-3:#f5f6f8; --elevated:#ffffff;
      --border:rgba(15,23,42,0.08); --hover:rgba(15,23,42,0.025); --track:#eceff3;
      --text-1:#0f172a; --text-2:#475569; --text-3:#8a96a8; --text-faint:#aab4c2;
      --accent:#f97316; --accent-soft:rgba(249,115,22,0.1); --accent-border:rgba(249,115,22,0.28);
      --shadow-sm:0 1px 2px rgba(15,23,42,0.05),0 1px 3px rgba(15,23,42,0.05);
      --shadow-md:0 6px 18px rgba(15,23,42,0.07),0 2px 5px rgba(15,23,42,0.04);
      --shadow-lg:0 16px 40px rgba(15,23,42,0.12);
      --c-green:#059669; --c-red:#dc2626; --c-blue:#2563eb; --c-amber:#d97706; --c-slate:#64748b;
      --s-success-t:#047857; --s-success-b:#ecfdf5; --s-success-bd:#a7f3d0;
      --s-danger-t:#b91c1c;  --s-danger-b:#fef2f2;  --s-danger-bd:#fecaca;
      --s-warn-t:#b45309;    --s-warn-b:#fffbeb;    --s-warn-bd:#fde68a;
      --s-info-t:#1d4ed8;    --s-info-b:#eff6ff;    --s-info-bd:#bfdbfe;
      --s-purple-t:#6d28d9;  --s-purple-b:#f5f3ff;  --s-purple-bd:#ddd6fe;
      --s-neutral-t:#475569; --s-neutral-b:#f1f5f9; --s-neutral-bd:#e2e8f0;
    }
    .hr-app[data-theme="dark"] {
      --bg-base:#0a0a0f; --bg-glow-1:rgba(251,146,60,0.09); --bg-glow-2:rgba(99,102,241,0.07);
      --surface:rgba(255,255,255,0.04); --surface-2:rgba(255,255,255,0.02); --surface-3:rgba(255,255,255,0.03); --elevated:#14141d;
      --border:rgba(255,255,255,0.08); --hover:rgba(255,255,255,0.025); --track:rgba(255,255,255,0.07);
      --text-1:#ffffff; --text-2:rgba(255,255,255,0.6); --text-3:rgba(255,255,255,0.32); --text-faint:rgba(255,255,255,0.22);
      --accent:#fb923c; --accent-soft:rgba(251,146,60,0.15); --accent-border:rgba(251,146,60,0.3);
      --shadow-sm:none; --shadow-md:none; --shadow-lg:0 8px 32px rgba(0,0,0,0.45);
      --c-green:#34d399; --c-red:#f87171; --c-blue:#60a5fa; --c-amber:#fbbf24; --c-slate:#94a3b8;
      --s-success-t:#34d399; --s-success-b:rgba(52,211,153,0.12); --s-success-bd:rgba(52,211,153,0.25);
      --s-danger-t:#f87171;  --s-danger-b:rgba(248,113,113,0.1);  --s-danger-bd:rgba(248,113,113,0.25);
      --s-warn-t:#fbbf24;    --s-warn-b:rgba(251,191,36,0.12);    --s-warn-bd:rgba(251,191,36,0.25);
      --s-info-t:#60a5fa;    --s-info-b:rgba(96,165,250,0.12);    --s-info-bd:rgba(96,165,250,0.25);
      --s-purple-t:#a78bfa;  --s-purple-b:rgba(167,139,250,0.12); --s-purple-bd:rgba(167,139,250,0.25);
      --s-neutral-t:#94a3b8; --s-neutral-b:rgba(148,163,184,0.1); --s-neutral-bd:rgba(148,163,184,0.2);
    }

    .hr-root {
      min-height:100vh; background:var(--bg-base);
      background-image:
        radial-gradient(ellipse 80% 50% at 20% -20%, var(--bg-glow-1) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 80% 110%, var(--bg-glow-2) 0%, transparent 60%);
      padding:2.5rem 1.5rem 5rem; font-family:'Sora',sans-serif; transition:background-color .25s ease;
    }
    .hr-container { max-width:1100px; margin:0 auto; }
    .hr-card,.stat-card,.mini-card,.hr-search,.hr-tabs,.hr-refresh,.seg {
      transition:background-color .25s ease,border-color .25s ease,color .25s ease,box-shadow .25s ease;
    }

    /* Top bar */
    .hr-topbar { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:2rem; flex-wrap:wrap; gap:1rem; }
    .hr-breadcrumb { font-size:11px; color:var(--text-faint); letter-spacing:.1em; text-transform:uppercase; font-family:'JetBrains Mono',monospace; margin-bottom:.4rem; }
    .hr-title { font-size:1.85rem; font-weight:700; color:var(--text-1); letter-spacing:-.03em; margin:0 0 .25rem; }
    .hr-title em { font-style:normal; background:linear-gradient(135deg,#fb923c,#f59e0b); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
    .hr-subtitle { font-size:13px; color:var(--text-3); font-weight:300; }
    .hr-actions { display:flex; gap:8px; align-items:center; }
    .hr-refresh { background:var(--surface); border:1px solid var(--border); border-radius:10px; color:var(--text-2); cursor:pointer; padding:8px 14px; display:flex; align-items:center; gap:7px; font-size:13px; font-family:'Sora',sans-serif; box-shadow:var(--shadow-sm); transition:all .15s ease; }
    .hr-refresh:hover { color:var(--text-1); box-shadow:var(--shadow-md); }
    .hr-icon-btn { background:var(--surface); border:1px solid var(--border); border-radius:10px; color:var(--text-2); cursor:pointer; width:38px; height:38px; display:flex; align-items:center; justify-content:center; box-shadow:var(--shadow-sm); transition:all .15s ease; }
    .hr-icon-btn:hover { color:var(--accent); box-shadow:var(--shadow-md); }

    /* Tabs */
    .hr-tabs { display:flex; gap:4px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:5px; box-shadow:var(--shadow-sm); margin-bottom:2rem; overflow-x:auto; scrollbar-width:none; }
    .hr-tabs::-webkit-scrollbar { display:none; }
    .hr-tab { display:flex; align-items:center; gap:7px; padding:9px 16px; border-radius:10px; font-size:13px; font-weight:500; white-space:nowrap; cursor:pointer; border:1px solid transparent; background:none; color:var(--text-3); font-family:'Sora',sans-serif; transition:all .18s ease; flex-shrink:0; }
    .hr-tab:hover { color:var(--text-1); background:var(--hover); }
    .hr-tab.active { background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent-border); }
    .hr-tab-badge { background:var(--accent-soft); color:var(--accent); border-radius:100px; font-size:10px; font-weight:600; padding:1px 7px; line-height:1.6; }

    /* Segmented filter */
    .seg { display:inline-flex; gap:2px; padding:3px; background:var(--surface-3); border:1px solid var(--border); border-radius:9px; }
    .seg-btn { padding:5px 11px; border-radius:6px; font-size:12px; font-weight:500; border:none; background:none; cursor:pointer; color:var(--text-3); font-family:'Sora',sans-serif; transition:all .15s; white-space:nowrap; }
    .seg-btn:hover { color:var(--text-2); }
    .seg-btn.active { background:var(--accent-soft); color:var(--accent); }

    /* Search */
    .hr-search-wrap { position:relative; margin-bottom:1.5rem; }
    .hr-search-icon { position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-faint); display:flex; pointer-events:none; }
    .hr-search { width:100%; box-sizing:border-box; background:var(--surface); border:1px solid var(--border); border-radius:12px; color:var(--text-1); box-shadow:var(--shadow-sm); font-family:'Sora',sans-serif; font-size:14px; padding:11px 16px 11px 42px; outline:none; transition:all .2s; }
    .hr-search::placeholder { color:var(--text-faint); }
    .hr-search:focus { border-color:var(--accent-border); box-shadow:0 0 0 3px var(--accent-soft); }

    /* Stat grid */
    .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:1.5rem; }
    .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px 20px; box-shadow:var(--shadow-sm); display:flex; flex-direction:column; gap:8px; position:relative; overflow:hidden; }
    .stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; }
    .stat-icon { width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; margin-bottom:4px; }
    .stat-value { font-size:1.6rem; font-weight:700; color:var(--text-1); letter-spacing:-.03em; }
    .stat-label { font-size:12px; color:var(--text-3); font-weight:400; }

    /* Card / table */
    .hr-card { background:var(--surface); border:1px solid var(--border); border-radius:18px; overflow:hidden; box-shadow:var(--shadow-sm); }
    .hr-card-header { padding:14px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:12px; background:var(--surface-2); flex-wrap:wrap; }
    .hr-card-title { font-size:13px; font-weight:600; color:var(--text-1); display:flex; align-items:center; gap:8px; }
    .hr-card-head-right { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .hr-table { width:100%; border-collapse:collapse; }
    .hr-thead th { padding:12px 20px; text-align:left; font-size:10px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--text-faint); font-family:'JetBrains Mono',monospace; border-bottom:1px solid var(--border); background:var(--surface-2); white-space:nowrap; }
    .hr-tr { border-bottom:1px solid var(--border); transition:background .12s; }
    .hr-tr:last-child { border-bottom:none; }
    .hr-tr:hover { background:var(--hover); }
    .hr-td { padding:13px 20px; vertical-align:middle; }

    .user-cell { display:flex; align-items:center; gap:10px; }
    .u-avatar { width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff; flex-shrink:0; }
    .u-name { font-size:13px; font-weight:500; color:var(--text-1); }
    .u-sub  { font-size:11px; color:var(--text-3); margin-top:1px; font-family:'JetBrains Mono',monospace; }
    .u-muted { font-size:12px; color:var(--text-2); }

    .badge { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:100px; font-size:11px; font-weight:500; white-space:nowrap; border:1px solid transparent; }
    .bdot { width:5px; height:5px; border-radius:50%; flex-shrink:0; background:currentColor; }
    .badge.success { background:var(--s-success-b); color:var(--s-success-t); border-color:var(--s-success-bd); }
    .badge.danger  { background:var(--s-danger-b);  color:var(--s-danger-t);  border-color:var(--s-danger-bd); }
    .badge.warn    { background:var(--s-warn-b);    color:var(--s-warn-t);    border-color:var(--s-warn-bd); }
    .badge.info    { background:var(--s-info-b);    color:var(--s-info-t);    border-color:var(--s-info-bd); }
    .badge.purple  { background:var(--s-purple-b);  color:var(--s-purple-t);  border-color:var(--s-purple-bd); }
    .badge.neutral { background:var(--s-neutral-b); color:var(--s-neutral-t); border-color:var(--s-neutral-bd); }

    .prog-wrap { display:flex; align-items:center; gap:10px; }
    .prog-bar { flex:1; height:5px; border-radius:99px; background:var(--track); overflow:hidden; }
    .prog-fill { height:100%; border-radius:99px; transition:width .6s ease; }
    .prog-pct { font-size:12px; font-family:'JetBrains Mono',monospace; color:var(--text-2); min-width:34px; text-align:right; }

    .reim-actions { display:flex; gap:6px; }
    .btn-approve,.btn-reject { padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600; font-family:'Sora',sans-serif; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all .15s; }
    .btn-approve { background:var(--s-success-b); color:var(--s-success-t); border:1px solid var(--s-success-bd); }
    .btn-approve:hover:not(:disabled) { filter:brightness(.97); box-shadow:var(--shadow-sm); }
    .btn-reject { background:var(--s-danger-b); color:var(--s-danger-t); border:1px solid var(--s-danger-bd); }
    .btn-reject:hover:not(:disabled) { filter:brightness(.97); box-shadow:var(--shadow-sm); }
    .btn-approve:disabled,.btn-reject:disabled { opacity:.45; cursor:not-allowed; }

    .readonly-notice { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--text-3); background:var(--surface-3); border:1px solid var(--border); border-radius:8px; padding:5px 10px; }
    .hr-empty { padding:3.5rem 2rem; text-align:center; color:var(--text-3); font-size:13px; }
    .hr-skel { height:52px; background:linear-gradient(90deg,var(--surface-3) 25%,var(--hover) 50%,var(--surface-3) 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; border-bottom:1px solid var(--border); }
    @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

    .mini-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:1.5rem; }
    .mini-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 18px; box-shadow:var(--shadow-sm); }
    .mini-title { font-size:11px; color:var(--text-3); text-transform:uppercase; letter-spacing:.1em; font-family:'JetBrains Mono',monospace; margin-bottom:12px; }
    .mini-row { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border); }
    .mini-row:last-child { border-bottom:none; }
    .mini-key { font-size:12px; color:var(--text-2); }
    .mini-val { font-size:13px; font-weight:600; color:var(--text-1); }

    .hr-toast { position:fixed; bottom:2rem; right:2rem; z-index:999; padding:12px 18px; border-radius:12px; font-size:13px; font-weight:500; display:flex; align-items:center; gap:8px; box-shadow:var(--shadow-lg); pointer-events:none; }
    .hr-toast.success { background:var(--s-success-b); border:1px solid var(--s-success-bd); color:var(--s-success-t); }
    .hr-toast.error   { background:var(--s-danger-b);  border:1px solid var(--s-danger-bd);  color:var(--s-danger-t); }

    .section-label { font-size:10px; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); font-family:'JetBrains Mono',monospace; margin:1.5rem 0 .75rem; display:flex; align-items:center; gap:8px; }
    .section-label::after { content:''; flex:1; height:1px; background:var(--border); }

    /* ── Employee Reports: roster ── */
    .hr-report-btn { display:inline-flex; align-items:center; gap:5px; padding:7px 13px; border-radius:9px; background:var(--accent-soft); border:1px solid var(--accent-border); color:var(--accent); font-size:12px; font-weight:600; cursor:pointer; font-family:'Sora',sans-serif; white-space:nowrap; transition:all .15s; }
    .hr-report-btn:hover { filter:brightness(.98); box-shadow:var(--shadow-sm); }
    .hr-mini-search-wrap { position:relative; }
    .hr-mini-search-icon { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--text-faint); pointer-events:none; display:flex; }
    .hr-mini-search { background:var(--surface-3); border:1px solid var(--border); border-radius:9px; color:var(--text-1); font-family:'Sora',sans-serif; font-size:13px; padding:7px 12px 7px 32px; outline:none; width:220px; transition:border-color .2s; }
    .hr-mini-search::placeholder { color:var(--text-faint); }
    .hr-mini-search:focus { border-color:var(--accent-border); }
    .role-badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:100px; font-size:10.5px; font-weight:500; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent-border); }

    .hr-pagination { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-top:1px solid var(--border); flex-wrap:wrap; gap:10px; }
    .hr-page-info { font-size:12px; color:var(--text-3); font-family:'JetBrains Mono',monospace; }
    .hr-page-btns { display:flex; gap:6px; align-items:center; }
    .hr-page-btn { width:32px; height:32px; border-radius:8px; background:var(--surface-3); border:1px solid var(--border); color:var(--text-2); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
    .hr-page-btn:hover:not(:disabled) { color:var(--text-1); box-shadow:var(--shadow-sm); }
    .hr-page-btn:disabled { opacity:.35; cursor:not-allowed; }
    .hr-page-num { height:32px; padding:0 10px; border-radius:8px; background:var(--surface-3); border:1px solid var(--border); color:var(--text-2); display:flex; align-items:center; font-size:12px; font-family:'JetBrains Mono',monospace; }

    /* ── Employee Reports: modal ── */
    .rep-overlay { position:fixed; inset:0; z-index:200; background:rgba(8,8,16,0.55); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:1rem; }
    .rep-modal { background:var(--elevated); border:1px solid var(--border); border-radius:22px; width:100%; max-width:820px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:var(--shadow-lg); }
    .rep-modal-header { display:flex; align-items:flex-start; justify-content:space-between; padding:1.25rem 1.5rem 1rem; border-bottom:1px solid var(--border); }
    .rep-tag { font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--accent); font-family:'JetBrains Mono',monospace; margin-bottom:5px; }
    .rep-modal-name { font-size:17px; font-weight:600; color:var(--text-1); }
    .rep-close { background:var(--surface-3); border:none; border-radius:8px; color:var(--text-2); cursor:pointer; padding:7px; display:flex; transition:all .15s; }
    .rep-close:hover { color:var(--text-1); }
    .rep-controls { display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; padding:1rem 1.5rem; border-bottom:1px solid var(--border); background:var(--surface-2); }
    .rep-field { display:flex; flex-direction:column; gap:5px; }
    .rep-field-label { font-size:10px; color:var(--text-3); letter-spacing:.06em; text-transform:uppercase; font-family:'JetBrains Mono',monospace; }
    .rep-select { background:var(--surface); border:1px solid var(--border); border-radius:9px; color:var(--text-1); font-family:'Sora',sans-serif; font-size:13px; padding:8px 30px 8px 11px; outline:none; appearance:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238a96a8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 9px center; transition:border-color .2s; }
    .rep-select:focus { border-color:var(--accent-border); }
    .rep-select option { background:var(--elevated); color:var(--text-1); }
    .rep-ctrl-btn { padding:8px 14px; border-radius:9px; font-size:12.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; font-family:'Sora',sans-serif; transition:all .18s; border:1px solid; }
    .rep-ctrl-btn:disabled { opacity:.4; cursor:not-allowed; }
    .rep-refresh { background:var(--surface-3); border-color:var(--border); color:var(--text-2); }
    .rep-refresh:hover:not(:disabled) { color:var(--text-1); }
    .rep-csv { background:var(--s-success-b); border-color:var(--s-success-bd); color:var(--s-success-t); }
    .rep-pdf { background:var(--s-danger-b); border-color:var(--s-danger-bd); color:var(--s-danger-t); }
    .rep-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:1rem 1.5rem; }
    .rep-sum-card { background:var(--surface-3); border:1px solid var(--border); border-radius:12px; padding:12px 14px; display:flex; align-items:center; gap:10px; }
    .rep-sum-icon { width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .rep-sum-label { font-size:10px; color:var(--text-3); font-family:'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; margin-bottom:3px; }
    .rep-sum-num { font-size:1.4rem; font-weight:600; color:var(--text-1); letter-spacing:-.03em; }
    .rep-tabs { display:flex; gap:4px; padding:0 1.5rem; border-bottom:1px solid var(--border); overflow-x:auto; scrollbar-width:none; }
    .rep-tabs::-webkit-scrollbar { display:none; }
    .rep-tab { padding:9px 14px; font-size:12px; font-weight:500; border:none; background:none; color:var(--text-3); cursor:pointer; font-family:'Sora',sans-serif; border-bottom:2px solid transparent; transition:all .18s; margin-bottom:-1px; white-space:nowrap; }
    .rep-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
    .rep-tab:not(.active):hover { color:var(--text-1); }
    .rep-content { flex:1; overflow-y:auto; padding:1rem 1.5rem 1.5rem; }
    .rep-list { display:flex; flex-direction:column; gap:8px; }
    .rep-card { background:var(--surface-3); border:1px solid var(--border); border-radius:12px; padding:10px 14px; transition:border-color .18s; }
    .rep-card:hover { border-color:var(--accent-border); }
    .rep-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:5px; }
    .rep-card-name { font-size:13.5px; font-weight:600; color:var(--text-1); }
    .rep-card-sub { font-size:12px; color:var(--text-2); margin-top:2px; line-height:1.5; }
    .rep-card-meta { font-size:10.5px; color:var(--text-3); margin-top:5px; font-family:'JetBrains Mono',monospace; display:flex; flex-wrap:wrap; gap:6px; }
    .rep-pct { font-size:13px; font-weight:700; padding:2px 9px; border-radius:7px; white-space:nowrap; flex-shrink:0; background:var(--surface); border:1px solid var(--border); }
    .rep-track { height:3px; background:var(--track); border-radius:2px; overflow:hidden; margin-top:7px; }
    .rep-fill { height:100%; border-radius:2px; }
    .rep-proj-row { display:flex; align-items:center; gap:12px; background:var(--surface-3); border:1px solid var(--border); border-radius:10px; padding:9px 13px; }
    .rep-proj-name { font-size:13px; font-weight:500; color:var(--text-1); }
    .rep-no-data { text-align:center; padding:2.5rem 0; color:var(--text-3); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:8px; }
    .rep-spinner { width:28px; height:28px; border-radius:50%; border:2px solid var(--accent-soft); border-top-color:var(--accent); animation:spin .9s linear infinite; margin:3rem auto; }

    @media (max-width:768px) { .stat-grid{grid-template-columns:1fr 1fr;} .mini-grid{grid-template-columns:1fr;} .hide-mob{display:none !important;} }
    @media (max-width:640px) { .rep-summary{grid-template-columns:1fr 1fr;} .hr-mini-search{width:150px;} }
    @media (max-width:480px) { .stat-grid{grid-template-columns:1fr;} }
  `;

  const StatusBadge = ({ status }: { status: string }) => {
    const variant = STATUS_VARIANT[(status || '').toLowerCase()] ?? 'neutral';
    return <span className={`badge ${variant}`}>{status ? <><span className="bdot" />{status}</> : '—'}</span>;
  };

  const Seg = <T extends string>({ value, onChange, options }:
    { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) => (
    <div className="seg">
      {options.map(o => (
        <button key={o.v} className={`seg-btn ${value === o.v ? 'active' : ''}`} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );

  const SkeletonRows = () => (<>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="hr-skel" />)}</>);

  const ReimActions = ({ r }: { r: any }) => (
    <div className="reim-actions">
      <button className="btn-approve" disabled={!!actionLoading} onClick={() => handleReimAction(r._id, 'approve')}>
        {actionLoading === r._id + 'approve' ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Check size={11} />} Approve
      </button>
      <button className="btn-reject" disabled={!!actionLoading} onClick={() => handleReimAction(r._id, 'reject')}>
        {actionLoading === r._id + 'reject' ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <X size={11} />} Reject
      </button>
    </div>
  );

  // ── Render tabs ───────────────────────────────────────────────────────────
  const renderOverview = () => (
    <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mini-grid">
        <div className="mini-card">
          <div className="mini-title">Team Snapshot</div>
          <div className="mini-row"><span className="mini-key">Total Members</span><span className="mini-val">{usersArr.length}</span></div>
          <div className="mini-row"><span className="mini-key">Active</span><span className="mini-val" style={{ color: 'var(--c-green)' }}>{activeUsers}</span></div>
          <div className="mini-row"><span className="mini-key">Inactive</span><span className="mini-val" style={{ color: 'var(--c-red)' }}>{usersArr.length - activeUsers}</span></div>
          <div className="mini-row"><span className="mini-key">Departments</span><span className="mini-val">{new Set(usersArr.map(u => u.department).filter(Boolean)).size}</span></div>
        </div>
        <div className="mini-card">
          <div className="mini-title">Work Overview</div>
          <div className="mini-row"><span className="mini-key">Ongoing Projects</span><span className="mini-val" style={{ color: 'var(--c-blue)' }}>{ongoingProjects} / {projectsArr.length}</span></div>
          <div className="mini-row"><span className="mini-key">Ongoing Tasks</span><span className="mini-val" style={{ color: 'var(--c-blue)' }}>{ongoingTasks} / {tasksArr.length}</span></div>
          <div className="mini-row"><span className="mini-key">Tasks Done</span><span className="mini-val" style={{ color: 'var(--c-green)' }}>{doneTasks} / {tasksArr.length}</span></div>
          <div className="mini-row"><span className="mini-key">Activities</span><span className="mini-val">{activitiesArr.length}</span></div>
        </div>
        <div className="mini-card">
          <div className="mini-title">Reimbursements</div>
          <div className="mini-row"><span className="mini-key">Pending</span><span className="mini-val" style={{ color: 'var(--c-amber)' }}>{pendingReims}</span></div>
          <div className="mini-row"><span className="mini-key">Approved</span><span className="mini-val" style={{ color: 'var(--c-green)' }}>{reimbursementsArr.filter(r => r.status === 'Approved').length}</span></div>
          <div className="mini-row"><span className="mini-key">Rejected</span><span className="mini-val" style={{ color: 'var(--c-red)' }}>{reimbursementsArr.filter(r => r.status === 'Rejected').length}</span></div>
          <div className="mini-row"><span className="mini-key">Approved Total</span><span className="mini-val">{fmt(totalReimAmt)}</span></div>
        </div>
        <div className="mini-card">
          <div className="mini-title">Top Performers</div>
          {perfData.slice(0, 4).map(u => (
            <div key={u._id} className="mini-row">
              <span className="mini-key">{u.name?.split(' ')[0]}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 60, height: 4, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                  <div style={{ width: `${u.rate}%`, height: '100%', borderRadius: 99, background: u.rate >= 75 ? 'var(--c-green)' : u.rate >= 40 ? 'var(--c-amber)' : 'var(--c-red)' }} />
                </div>
                <span className="mini-val" style={{ fontSize: 12 }}>{u.rate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pendingReims > 0 && (
        <>
          <div className="section-label">Pending approvals</div>
          <div className="hr-card">
            <table className="hr-table">
              <thead className="hr-thead"><tr><th>Employee</th><th>Amount</th><th>Category</th><th>Actions</th></tr></thead>
              <tbody>
                {reimbursementsArr.filter(r => r.status === 'Pending').slice(0, 5).map(r => (
                  <tr key={r._id} className="hr-tr">
                    <td className="hr-td">
                      <div className="user-cell">
                        <div className="u-avatar" style={{ background: avatarGrad(r.employee?.name) }}>{initials(r.employee?.name || '?')}</div>
                        <div><div className="u-name">{r.employee?.name || 'Unknown'}</div><div className="u-sub">{r.title}</div></div>
                      </div>
                    </td>
                    <td className="hr-td" style={{ color: 'var(--c-amber)', fontWeight: 600 }}>{fmt(r.amount || 0)}</td>
                    <td className="hr-td"><StatusBadge status={r.project?.name || 'general'} /></td>
                    <td className="hr-td"><ReimActions r={r} /></td>
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
          <span className="hr-card-title"><FolderKanban size={14} /> Projects</span>
          <div className="hr-card-head-right">
            <Seg value={projFilter} onChange={setProjFilter} options={[{ v: 'ongoing', label: 'Ongoing' }, { v: 'all', label: 'All' }, { v: 'done', label: 'Done' }]} />
            <span className="readonly-notice"><Eye size={11} /> Read-only</span>
          </div>
        </div>
        {loading ? <SkeletonRows /> : filteredProjects.length === 0 ? <div className="hr-empty">No projects found</div> : (
          <table className="hr-table">
            <thead className="hr-thead"><tr><th>Project</th><th>Status</th><th className="hide-mob">Team</th><th className="hide-mob">Progress</th></tr></thead>
            <tbody>
              {filteredProjects.map((p, i) => (
                <motion.tr key={p._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td"><div className="u-name">{p.name || p.title}</div><div className="u-sub">{p.description?.slice(0, 60) || '—'}</div></td>
                  <td className="hr-td"><StatusBadge status={p.status} /></td>
                  <td className="hr-td hide-mob"><span className="u-muted">{Array.isArray(p.team) ? `${p.team.length} members` : Array.isArray(p.teamMembers) ? `${p.teamMembers.length} members` : '—'}</span></td>
                  <td className="hr-td hide-mob">
                    {typeof p.progress === 'number' ? (
                      <div className="prog-wrap">
                        <div className="prog-bar"><div className="prog-fill" style={{ width: `${p.progress}%`, background: progressVar(p.progress) }} /></div>
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
          <span className="hr-card-title"><CheckSquare size={14} /> Tasks</span>
          <div className="hr-card-head-right">
            <Seg value={taskFilter} onChange={setTaskFilter} options={[{ v: 'ongoing', label: 'Ongoing' }, { v: 'all', label: 'All' }, { v: 'done', label: 'Done' }]} />
            <span className="readonly-notice"><Eye size={11} /> Read-only</span>
          </div>
        </div>
        {loading ? <SkeletonRows /> : filteredTasks.length === 0 ? <div className="hr-empty">No tasks found</div> : (
          <table className="hr-table">
            <thead className="hr-thead"><tr><th>Task</th><th>Owner</th><th>Status</th><th className="hide-mob">Priority</th></tr></thead>
            <tbody>
              {filteredTasks.map((t, i) => {
                // Task creator = `assigner` (Task model has no assignee). Keep fallbacks for safety.
                const ownerName = t.assigner?.name || t.createdBy?.name || t.assignee?.name || t.employee?.name || 'Unknown';
                return (
                  <motion.tr key={t._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                    <td className="hr-td"><div className="u-name">{t.title}</div><div className="u-sub">{t.project?.name || '—'}</div></td>
                    <td className="hr-td">
                      <div className="user-cell">
                        <div className="u-avatar" style={{ width: 26, height: 26, fontSize: 10, borderRadius: 7, background: avatarGrad(ownerName) }}>{initials(ownerName)}</div>
                        <span className="u-muted">{ownerName}</span>
                      </div>
                    </td>
                    <td className="hr-td"><StatusBadge status={t.status} /></td>
                    <td className="hr-td hide-mob">{t.priority ? <StatusBadge status={t.priority} /> : '—'}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );

  const renderReports = () => (
    <motion.div key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hr-card">
        <div className="hr-card-header">
          <span className="hr-card-title"><FileText size={14} /> Employee Reports — every employee, all projects</span>
          <div className="hr-card-head-right">
            <div className="hr-mini-search-wrap">
              <Search size={13} className="hr-mini-search-icon" />
              <input className="hr-mini-search" placeholder="Search name or email…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {empLoading ? <SkeletonRows /> : empPaginated.length === 0 ? (
          <div className="hr-empty">{empSearch ? 'No employees match your search' : 'No employees found'}</div>
        ) : (
          <table className="hr-table">
            <thead className="hr-thead"><tr><th>Employee</th><th className="hide-mob">Role</th><th style={{ textAlign: 'right' }}>Report</th></tr></thead>
            <tbody>
              {empPaginated.map((emp, i) => (
                <motion.tr key={emp._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td">
                    <div className="user-cell">
                      <div className="u-avatar" style={{ background: avatarGrad(emp.name) }}>{initials(emp.name)}</div>
                      <div><div className="u-name">{emp.name}</div><div className="u-sub">{emp.email}</div></div>
                    </div>
                  </td>
                  <td className="hr-td hide-mob"><span className="role-badge">{emp.accessLevel || (emp as any).role || 'Employee'}</span></td>
                  <td className="hr-td" style={{ textAlign: 'right' }}>
                    <button className="hr-report-btn" onClick={() => handleViewReport(emp)}><Eye size={13} /> View Report</button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}

        {!empLoading && empFiltered.length > 0 && (
          <div className="hr-pagination">
            <span className="hr-page-info">{empFiltered.length} employee{empFiltered.length !== 1 ? 's' : ''} · page {empPage} of {empTotalPages}</span>
            <div className="hr-page-btns">
              <button className="hr-page-btn" onClick={() => setEmpPage(p => Math.max(1, p - 1))} disabled={empPage === 1}><ChevronLeft size={14} /></button>
              <div className="hr-page-num">{empPage} / {empTotalPages}</div>
              <button className="hr-page-btn" onClick={() => setEmpPage(p => Math.min(empTotalPages, p + 1))} disabled={empPage === empTotalPages}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );

  const renderActivities = () => (
    <motion.div key="act" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hr-card">
        <div className="hr-card-header">
          <span className="hr-card-title"><Activity size={14} /> Activities</span>
          <span className="readonly-notice"><Eye size={11} /> Read-only</span>
        </div>
        {loading ? <SkeletonRows /> : filteredActivities.length === 0 ? <div className="hr-empty">No activities found</div> : (
          <table className="hr-table">
            <thead className="hr-thead"><tr><th>Activity</th><th>User</th><th>Status</th><th className="hide-mob">Date</th></tr></thead>
            <tbody>
              {filteredActivities.map((a, i) => (
                <motion.tr key={a._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td"><div className="u-name">{a.name || a.description?.slice(0, 50)}</div><div className="u-sub">{a.task?.title || a.activityType || '—'}</div></td>
                  <td className="hr-td">
                    <div className="user-cell">
                      <div className="u-avatar" style={{ width: 26, height: 26, fontSize: 10, borderRadius: 7, background: avatarGrad(a.assignee?.name || '') }}>{initials(a.assignee?.name || '?')}</div>
                      <span className="u-muted">{a.assignee?.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="hr-td"><StatusBadge status={a.status || 'Pending'} /></td>
                  <td className="hr-td hide-mob" style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}</td>
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
          <div className="hr-card-head-right">
            <Seg value={reimFilter} onChange={setReimFilter} options={[{ v: 'pending', label: `Pending (${pendingReims})` }, { v: 'all', label: 'All' }]} />
          </div>
        </div>
        {loading ? <SkeletonRows /> : filteredReims.length === 0 ? <div className="hr-empty">No reimbursements found</div> : (
          <table className="hr-table">
            <thead className="hr-thead"><tr><th>Employee</th><th>Title</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredReims.map((r, i) => {
                const isPending = r.status === 'Pending';
                return (
                  <motion.tr key={r._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                    <td className="hr-td">
                      <div className="user-cell">
                        <div className="u-avatar" style={{ background: avatarGrad(r.employee?.name) }}>{initials(r.employee?.name || '?')}</div>
                        <div><div className="u-name">{r.employee?.name || 'Unknown'}</div><div className="u-sub">{r.employee?.department || '—'}</div></div>
                      </div>
                    </td>
                    <td className="hr-td"><div className="u-name" style={{ fontSize: 13 }}>{r.title || r.description?.slice(0, 40)}</div><div className="u-sub">{r.project?.name || '—'}</div></td>
                    <td className="hr-td" style={{ fontWeight: 600, color: 'var(--c-amber)' }}>{fmt(r.amount || 0)}</td>
                    <td className="hr-td"><StatusBadge status={r.status} /></td>
                    <td className="hr-td">
                      {isPending ? <ReimActions r={r} /> : (
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.status === 'Approved' ? 'Approved ✓' : r.status === 'Rejected' ? 'Rejected ✗' : r.status}</span>
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
            <thead className="hr-thead"><tr><th>#</th><th>Employee</th><th>Assigned</th><th>Completed</th><th>Completion Rate</th><th className="hide-mob">Reims</th></tr></thead>
            <tbody>
              {perfData.map((u, i) => (
                <motion.tr key={u._id} className="hr-tr" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <td className="hr-td" style={{ color: 'var(--text-3)', fontSize: 12, fontFamily: 'JetBrains Mono' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                  <td className="hr-td">
                    <div className="user-cell">
                      <div className="u-avatar" style={{ background: avatarGrad(u.name) }}>{initials(u.name)}</div>
                      <div><div className="u-name">{u.name}</div><div className="u-sub">{u.designation || u.accessLevel}</div></div>
                    </div>
                  </td>
                  <td className="hr-td u-muted">{u.assigned}</td>
                  <td className="hr-td" style={{ fontSize: 13, color: 'var(--c-green)', fontWeight: 600 }}>{u.completed}</td>
                  <td className="hr-td" style={{ minWidth: 160 }}>
                    <div className="prog-wrap">
                      <div className="prog-bar"><div className="prog-fill" style={{ width: `${u.rate}%`, background: u.rate >= 75 ? 'var(--c-green)' : u.rate >= 40 ? 'var(--c-amber)' : 'var(--c-red)' }} /></div>
                      <span className="prog-pct">{u.rate}%</span>
                    </div>
                  </td>
                  <td className="hr-td hide-mob u-muted">{u.userReims} filed</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );

  // ── Employee report modal ──────────────────────────────────────────────────
  const renderReportModal = () => (
    <AnimatePresence>
      {showReport && selectedEmployee && (
        <div className="rep-overlay" onClick={closeReport}>
          <motion.div
            className="rep-modal"
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            <div className="rep-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="u-avatar" style={{ width: 42, height: 42, borderRadius: 11, fontSize: 13, background: avatarGrad(selectedEmployee.name) }}>{initials(selectedEmployee.name)}</div>
                <div><div className="rep-tag">Activity Report</div><div className="rep-modal-name">{selectedEmployee.name}</div></div>
              </div>
              <button className="rep-close" onClick={closeReport}><X size={16} /></button>
            </div>

            <div className="rep-controls">
              <div className="rep-field">
                <span className="rep-field-label">Year</span>
                <select className="rep-select" value={repYear} onChange={e => setRepYear(Number(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="rep-field">
                <span className="rep-field-label">Month</span>
                <select className="rep-select" value={repMonth} onChange={e => setRepMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <button className="rep-ctrl-btn rep-refresh" onClick={handleReportRefresh} disabled={reportLoading}><Clock size={13} /> Refresh</button>
              <button className="rep-ctrl-btn rep-csv" onClick={handleDownloadCSV} disabled={!hasReportData || !!exporting || reportLoading}>
                {exporting === 'csv' ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Download size={13} />} CSV
              </button>
              <button className="rep-ctrl-btn rep-pdf" onClick={handleDownloadPDF} disabled={!hasReportData || !!exporting || reportLoading}>
                {exporting === 'pdf' ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <FileText size={13} />} PDF
              </button>
            </div>

            {reportLoading ? <div className="rep-spinner" /> : (
              <>
                <div className="rep-summary">
                  {[
                    { icon: <FolderOpen size={15} />, color: 'var(--c-blue)', num: reportData?.projects.length ?? 0, label: 'Projects' },
                    { icon: <TrendingUp size={15} />, color: 'var(--c-green)', num: totalUpdates, label: 'Progress Updates' },
                    { icon: <Activity size={15} />, color: 'var(--accent)', num: totalActivities, label: 'Activities' },
                  ].map(s => (
                    <div key={s.label} className="rep-sum-card">
                      <div className="rep-sum-icon" style={{ background: 'var(--surface)', color: s.color }}>{s.icon}</div>
                      <div><div className="rep-sum-label">{s.label}</div><div className="rep-sum-num">{s.num}</div></div>
                    </div>
                  ))}
                </div>

                <div className="rep-tabs">
                  {([
                    { key: 'updates', label: `Progress Updates (${totalUpdates})` },
                    { key: 'activities', label: `Activities (${totalActivities})` },
                    { key: 'summary', label: `Projects (${reportData?.projects.length ?? 0})` },
                  ] as { key: ReportTab; label: string }[]).map(t => (
                    <button key={t.key} className={`rep-tab ${repTab === t.key ? 'active' : ''}`} onClick={() => setRepTab(t.key)}>{t.label}</button>
                  ))}
                </div>

                <div className="rep-content">
                  <AnimatePresence mode="wait">
                    {repTab === 'updates' && (
                      <motion.div key="r-updates" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rep-list">
                        {totalUpdates === 0 ? (
                          <div className="rep-no-data"><TrendingUp size={30} style={{ opacity: 0.3 }} /><span>No progress updates for {MONTH_NAMES[repMonth - 1]} {repYear}</span></div>
                        ) : reportData?.projects.map(project =>
                          (project.progressUpdates || []).slice()
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .map((u, i) => {
                              const col = progressVar(u.percentage);
                              return (
                                <motion.div key={u._id} className="rep-card" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.035 }}>
                                  <div className="rep-card-top">
                                    <div style={{ flex: 1, minWidth: 0 }}><div className="rep-card-name">{project.name}</div><div className="rep-card-sub">{u.note}</div></div>
                                    <span className="rep-pct" style={{ color: col }}>{u.percentage}%</span>
                                  </div>
                                  <div className="rep-track"><div className="rep-fill" style={{ width: `${u.percentage}%`, background: col }} /></div>
                                  <div className="rep-card-meta"><span>👤 {u.addedBy?.name || 'Unknown'}</span><span>·</span><span>{fmtDate(u.createdAt)}</span><span>·</span><span>{timeAgo(u.createdAt)}</span></div>
                                </motion.div>
                              );
                            })
                        )}
                      </motion.div>
                    )}

                    {repTab === 'activities' && (
                      <motion.div key="r-activities" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rep-list">
                        {totalActivities === 0 ? (
                          <div className="rep-no-data"><Activity size={30} style={{ opacity: 0.3 }} /><span>No activities for {MONTH_NAMES[repMonth - 1]} {repYear}</span></div>
                        ) : reportData?.activities.map((a, i) => {
                          const taskTitle = typeof a.task === 'object' ? a.task?.title : 'Unknown Task';
                          return (
                            <motion.div key={a._id} className="rep-card" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.035 }}>
                              <div className="rep-card-top">
                                <div style={{ flex: 1, minWidth: 0 }}><div className="rep-card-name">{a.name}</div><div className="rep-card-sub">{a.description}</div></div>
                                <StatusBadge status={a.status} />
                              </div>
                              <div className="rep-card-meta">
                                <span>Task: {taskTitle}</span><span>·</span><span>{a.activityType}</span><span>·</span><span>Priority: {a.priority}</span>
                                {a.startDate && (<><span>·</span><span>{fmtDate(a.startDate)}{a.endDate ? ` → ${fmtDate(a.endDate)}` : ''}</span></>)}
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}

                    {repTab === 'summary' && (
                      <motion.div key="r-summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rep-list">
                        {(reportData?.projects.length ?? 0) === 0 ? (
                          <div className="rep-no-data"><FolderOpen size={30} style={{ opacity: 0.3 }} /><span>No project data for {MONTH_NAMES[repMonth - 1]} {repYear}</span></div>
                        ) : reportData?.projects.map((p, i) => {
                          const col = progressVar(p.progress ?? 0);
                          const updates = p.progressUpdates || [];
                          const latest = [...updates].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                          return (
                            <motion.div key={p._id} className="rep-proj-row" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="rep-proj-name">{p.name}</div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                                  {updates.length} update{updates.length !== 1 ? 's' : ''} this month{latest ? `  ·  Last: ${fmtDate(latest.createdAt)}` : ''}
                                </div>
                              </div>
                              <div style={{ width: 100 }}><div className="rep-track"><div className="rep-fill" style={{ width: `${p.progress ?? 0}%`, background: col }} /></div></div>
                              <span className="rep-pct" style={{ color: col, fontSize: 12 }}>{p.progress ?? 0}%</span>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="hr-app" data-theme={theme}>
      <style>{CSS}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="hr-root">
        <div className="hr-container">

          <motion.div className="hr-topbar" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <div className="hr-breadcrumb">HR Portal / <span style={{ color: 'var(--text-2)' }}>Dashboard</span></div>
              <h1 className="hr-title">HR <em>Dashboard</em></h1>
              <p className="hr-subtitle">Welcome, {currentUser?.name?.split(' ')[0] ?? 'HR'} — read access across all modules</p>
            </div>
            <div className="hr-actions">
              <button className="hr-icon-btn" title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}>
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button className="hr-refresh" onClick={loadAll}><RefreshCw size={13} /> Refresh</button>
            </div>
          </motion.div>

          <motion.div className="stat-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            {[
              { label: 'Active Members', value: activeUsers, icon: <Users size={15} />, color: '#8b5cf6' },
              { label: 'Ongoing Projects', value: `${ongoingProjects}/${projectsArr.length}`, icon: <FolderKanban size={15} />, color: '#3b82f6' },
              { label: 'Ongoing Tasks', value: `${ongoingTasks}/${tasksArr.length}`, icon: <CheckSquare size={15} />, color: '#10b981' },
              { label: 'Pending Claims', value: pendingReims, icon: <Receipt size={15} />, color: '#f59e0b' },
            ].map((s, i) => (
              <motion.div key={s.label} className="stat-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.06 }}>
                <style>{`.stat-card:nth-child(${i + 1})::before { background: ${s.color}; opacity: 0.8; }`}</style>
                <div className="stat-icon" style={{ background: `${s.color}1f` }}><span style={{ color: s.color }}>{s.icon}</span></div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div className="hr-tabs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            {TABS.map(t => (
              <button key={t.id} className={`hr-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                {t.icon} {t.label}
                {t.id === 'reimbursements' && pendingReims > 0 && <span className="hr-tab-badge">{pendingReims}</span>}
              </button>
            ))}
          </motion.div>

          {activeTab !== 'overview' && activeTab !== 'reports' && (
            <div className="hr-search-wrap">
              <div className="hr-search-icon"><Search size={15} /></div>
              <input className="hr-search" placeholder={`Search ${activeTab}…`} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'overview'       && renderOverview()}
            {activeTab === 'projects'       && renderProjects()}
            {activeTab === 'tasks'          && renderTasks()}
            {activeTab === 'reports'        && renderReports()}
            {activeTab === 'activities'     && renderActivities()}
            {activeTab === 'reimbursements' && renderReimbursements()}
            {activeTab === 'performance'    && renderPerformance()}
          </AnimatePresence>

        </div>
      </div>

      {/* Employee report modal */}
      {renderReportModal()}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div className={`hr-toast ${toast.type}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
            {toast.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};