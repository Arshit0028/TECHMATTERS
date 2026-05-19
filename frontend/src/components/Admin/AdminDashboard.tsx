import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { getAllEmployees, getProjects, getActivities } from '../../api/client';
import type { User, Project, Activity } from '../types/index';
import { downloadCSV } from '../utils/exportCSV';
import { downloadPDF } from '../utils/exportPDF';
import {
  Eye, ChevronLeft, ChevronRight, X,
  Download, Users, Clock, FileText,
  FolderOpen, Search, BarChart2, TrendingUp,
  Activity as ActivityIcon, Loader2
} from 'lucide-react';

const ITEMS_PER_PAGE = 20;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#7c3aed,#6366f1)',
  'linear-gradient(135deg,#0891b2,#06b6d4)',
  'linear-gradient(135deg,#059669,#34d399)',
  'linear-gradient(135deg,#d97706,#fbbf24)',
  'linear-gradient(135deg,#dc2626,#f87171)',
  'linear-gradient(135deg,#7c3aed,#ec4899)',
];

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

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

// ─── Report data shape ────────────────────────────────────────────────────────
interface EmployeeReportData {
  projects: Project[];
  activities: Activity[];
}

export const AdminDashboard: React.FC = () => {
  const [employees, setEmployees]               = useState<User[]>([]);
  const [filtered, setFiltered]                 = useState<User[]>([]);
  const [currentPage, setCurrentPage]           = useState(1);
  const [loading, setLoading]                   = useState(false);
  const [search, setSearch]                     = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [reportData, setReportData]             = useState<EmployeeReportData | null>(null);
  const [reportLoading, setReportLoading]       = useState(false);
  const [exporting, setExporting]               = useState<'pdf' | 'csv' | null>(null);
  const [year, setYear]                         = useState(new Date().getFullYear());
  const [month, setMonth]                       = useState(new Date().getMonth() + 1);
  const [showModal, setShowModal]               = useState(false);
  const [activeTab, setActiveTab]               = useState<'updates' | 'activities' | 'summary'>('updates');

  const { user } = useAuth();

  useEffect(() => {
    if (!user?._id) return;
    setLoading(true);
    getAllEmployees()
      .then(emps => { setEmployees(emps); setFiltered(emps); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?._id]);

  // ── search filter ──
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? employees.filter(e => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)) : employees
    );
    setCurrentPage(1);
  }, [search, employees]);

  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

  // ── Fetch employee's projects + activities for the selected month/year ──────
  const fetchReport = async (emp: User, y: number, m: number) => {
    setReportLoading(true);
    setReportData(null);
    try {
      const [pRes, aRes] = await Promise.all([
        getProjects(),
        getActivities({ assignee: emp._id }),
      ]);

      // Unwrap paginated or plain array
      const pData = pRes.data as Project[] | { projects: Project[]; pagination: unknown };
      const allProjects: Project[] = Array.isArray(pData) ? pData : (pData.projects ?? []);

      // Only projects where this employee is a team member or manager
      const empProjects = allProjects.filter(p => {
        const members = (p.teamMembers || []).map((tm: any) =>
          typeof tm === 'string' ? tm : tm._id
        );
        const managerId = typeof p.projectManager === 'string'
          ? p.projectManager
          : p.projectManager?._id || '';
        return members.includes(emp._id) || managerId === emp._id;
      });

      // Filter to projects with progress updates in this month/year
      const projectsThisMonth = empProjects
        .map(p => ({
          ...p,
          progressUpdates: (p.progressUpdates || []).filter(u => {
            const d = new Date(u.createdAt);
            return d.getFullYear() === y && d.getMonth() + 1 === m;
          }),
        }))
        .filter(p => p.progressUpdates.length > 0);

      // Filter activities by month/year
      const allActivities: Activity[] = Array.isArray(aRes.data) ? aRes.data : [];
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
    setShowModal(true);
    setActiveTab('updates');
    fetchReport(emp, year, month);
  };

  const handleRefresh = () => {
    if (selectedEmployee) fetchReport(selectedEmployee, year, month);
  };

  const handleDownloadCSV = async () => {
    if (!reportData || !selectedEmployee) return;
    setExporting('csv');
    try {
      downloadCSV(
        selectedEmployee.name,
        MONTH_SHORT[month - 1],
        year,
        reportData.projects,
        reportData.activities,
      );
    } finally { setExporting(null); }
  };

  const handleDownloadPDF = async () => {
    if (!reportData || !selectedEmployee) return;
    setExporting('pdf');
    try {
      await downloadPDF(
        selectedEmployee.name,
        MONTH_SHORT[month - 1],
        year,
        reportData.projects,
        reportData.activities,
      );
    } catch (e) { console.error(e); }
    finally { setExporting(null); }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
    setReportData(null);
  };

  const totalUpdates   = reportData?.projects.reduce((n, p) => n + (p.progressUpdates?.length || 0), 0) ?? 0;
  const totalActivities = reportData?.activities.length ?? 0;
  const hasData        = !!reportData && (reportData.projects.length > 0 || reportData.activities.length > 0);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div className="adm-pulse" />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>
        Loading employees…
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .adm-root {
          min-height: 100vh;
          background: #080810;
          background-image:
            radial-gradient(ellipse 65% 50% at 85% 0%, rgba(124,58,237,0.11) 0%, transparent 55%),
            radial-gradient(ellipse 55% 40% at 10% 100%, rgba(88,80,236,0.09) 0%, transparent 55%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='1' cy='1' r='0.6' fill='rgba(255,255,255,0.022)'/%3E%3C/svg%3E");
          padding: 2.75rem 1.75rem 6rem;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,0.82);
        }
        .adm-container { max-width: 1080px; margin: 0 auto; }

        /* ── Header ── */
        .adm-header { margin-bottom: 2.5rem; }
        .adm-eyebrow {
          font-family: 'DM Mono', monospace; font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: rgba(255,255,255,0.22); margin-bottom: 10px;
        }
        .adm-title {
          font-size: 2rem; font-weight: 600; letter-spacing: -0.04em;
          color: #fff; line-height: 1.12;
        }
        .adm-title em {
          font-style: normal;
          background: linear-gradient(110deg,#c4b5fd 20%,#818cf8 80%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .adm-sub { font-size: 13px; color: rgba(255,255,255,0.28); margin-top: 7px; font-weight: 300; }

        /* ── Stat pills ── */
        .adm-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 2.25rem; }
        .adm-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; padding: 10px 16px;
          display: flex; align-items: center; gap: 9px;
        }
        .adm-stat-icon {
          width: 28px; height: 28px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
        }
        .adm-stat-num { font-size: 17px; font-weight: 600; color: #fff; letter-spacing: -0.03em; }
        .adm-stat-label { font-size: 11.5px; color: rgba(255,255,255,0.3); margin-top: 1px; }

        /* ── Search + table card ── */
        .adm-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; overflow: hidden;
        }
        .adm-card-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.06);
          gap: 12px; flex-wrap: wrap;
        }
        .adm-card-title {
          font-family: 'DM Mono', monospace; font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: rgba(255,255,255,0.28);
        }
        .adm-search-wrap { position: relative; }
        .adm-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.22); pointer-events: none; }
        .adm-search {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: rgba(255,255,255,0.78);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 8px 14px 8px 34px; outline: none;
          transition: border-color 0.2s; width: 220px;
        }
        .adm-search::placeholder { color: rgba(255,255,255,0.18); }
        .adm-search:focus { border-color: rgba(167,139,250,0.38); }

        /* ── Table ── */
        .adm-table { width: 100%; border-collapse: collapse; }
        .adm-th {
          padding: 10px 20px; text-align: left;
          font-family: 'DM Mono', monospace; font-size: 9.5px;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(255,255,255,0.22); font-weight: 400;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.055);
        }
        .adm-tr {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.15s;
        }
        .adm-tr:hover { background: rgba(255,255,255,0.025); }
        .adm-tr:last-child { border-bottom: none; }
        .adm-td { padding: 13px 20px; vertical-align: middle; }
        .adm-emp-row { display: flex; align-items: center; gap: 11px; }
        .adm-avatar {
          width: 34px; height: 34px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #fff;
          flex-shrink: 0; letter-spacing: 0.02em;
        }
        .adm-name { font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,0.82); }
        .adm-email { font-size: 11px; color: rgba(255,255,255,0.3); font-family: 'DM Mono', monospace; margin-top: 1px; }
        .adm-role-badge {
          display: inline-flex; align-items: center;
          padding: 3px 10px; border-radius: 100px;
          font-size: 10.5px; font-weight: 500;
          background: rgba(167,139,250,0.1); color: rgba(167,139,250,0.8);
          border: 1px solid rgba(167,139,250,0.15);
        }
        .adm-report-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 14px; border-radius: 9px;
          background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.25);
          color: #a78bfa; font-size: 12px; font-weight: 500;
          cursor: pointer; transition: all 0.18s;
          font-family: 'DM Sans', sans-serif; white-space: nowrap;
        }
        .adm-report-btn:hover { background: rgba(124,58,237,0.22); border-color: rgba(167,139,250,0.45); }

        /* ── Pagination ── */
        .adm-pagination {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.055);
          flex-wrap: wrap; gap: 10px;
        }
        .adm-page-info { font-size: 12px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; }
        .adm-page-btns { display: flex; gap: 6px; }
        .adm-page-btn {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.45); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; font-family: 'DM Sans', sans-serif;
        }
        .adm-page-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
        .adm-page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .adm-page-num {
          height: 32px; padding: 0 10px; border-radius: 8px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.45); display: flex; align-items: center;
          font-size: 12px; font-family: 'DM Mono', monospace;
        }

        /* ── Empty state ── */
        .adm-empty {
          text-align: center; padding: 3rem 0;
          color: rgba(255,255,255,0.2); font-size: 13px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }

        /* ── Modal overlay ── */
        .adm-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .adm-modal {
          background: #111120; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px; width: 100%; max-width: 820px;
          max-height: 92vh; display: flex; flex-direction: column; overflow: hidden;
        }
        .adm-modal-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 1.5rem 1.5rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .adm-modal-tag { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(167,139,250,0.65); font-family: 'DM Mono', monospace; margin-bottom: 5px; }
        .adm-modal-name { font-size: 17px; font-weight: 600; color: #fff; }
        .adm-modal-close {
          background: rgba(255,255,255,0.06); border: none; border-radius: 8px;
          color: rgba(255,255,255,0.38); cursor: pointer; padding: 7px;
          display: flex; transition: all 0.15s;
        }
        .adm-modal-close:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.75); }

        /* ── Modal controls ── */
        .adm-modal-controls {
          display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap;
          padding: 1rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.055);
          background: rgba(255,255,255,0.015);
        }
        .adm-select-field { display: flex; flex-direction: column; gap: 5px; }
        .adm-select-label { font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 0.06em; text-transform: uppercase; font-family: 'DM Mono', monospace; }
        .adm-select {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px; color: rgba(255,255,255,0.78);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 8px 30px 8px 11px; outline: none; appearance: none; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 9px center; transition: border-color 0.2s;
        }
        .adm-select:focus { border-color: rgba(167,139,250,0.4); }
        .adm-select option { background: #12121e; }
        .adm-ctrl-btn {
          padding: 8px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 500;
          cursor: pointer; display: flex; align-items: center; gap: 6px;
          font-family: 'DM Sans', sans-serif; transition: all 0.18s; border: 1px solid;
        }
        .adm-ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .adm-refresh-btn { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); }
        .adm-refresh-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); }
        .adm-csv-btn { background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.25); color: #34d399; }
        .adm-csv-btn:hover:not(:disabled) { background: rgba(52,211,153,0.18); border-color: rgba(52,211,153,0.45); }
        .adm-pdf-btn { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.25); color: #f87171; }
        .adm-pdf-btn:hover:not(:disabled) { background: rgba(248,113,113,0.18); border-color: rgba(248,113,113,0.45); }

        /* ── Summary cards ── */
        .adm-summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 1rem 1.5rem; }
        .adm-sum-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; padding: 12px 14px;
          display: flex; align-items: center; gap: 10px;
        }
        .adm-sum-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .adm-sum-label { font-size: 10px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 3px; }
        .adm-sum-num { font-size: 1.4rem; font-weight: 600; color: #fff; letter-spacing: -0.03em; }

        /* ── Tabs ── */
        .adm-tabs { display: flex; gap: 4px; padding: 0 1.5rem; margin-bottom: 1px; border-bottom: 1px solid rgba(255,255,255,0.055); }
        .adm-tab {
          padding: 9px 16px; font-size: 12px; font-weight: 500; border: none;
          background: none; color: rgba(255,255,255,0.32); cursor: pointer;
          font-family: 'DM Sans', sans-serif; border-bottom: 2px solid transparent;
          transition: all 0.18s; margin-bottom: -1px;
        }
        .adm-tab.active { color: #a78bfa; border-bottom-color: #a78bfa; }
        .adm-tab:not(.active):hover { color: rgba(255,255,255,0.6); }

        /* ── Scrollable content ── */
        .adm-content {
          flex: 1; overflow-y: auto; padding: 1rem 1.5rem 1.5rem;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .adm-list { display: flex; flex-direction: column; gap: 8px; }

        /* ── Report cards ── */
        .adm-rep-card {
          background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.065);
          border-radius: 12px; padding: 10px 14px; transition: border-color 0.18s;
        }
        .adm-rep-card:hover { border-color: rgba(167,139,250,0.18); }
        .adm-rep-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
        .adm-rep-name { font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.85); }
        .adm-rep-sub  { font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 2px; line-height: 1.5; }
        .adm-rep-meta { font-size: 10.5px; color: rgba(255,255,255,0.22); margin-top: 5px; font-family: 'DM Mono', monospace; display: flex; flex-wrap: wrap; gap: 6px; }
        .adm-pct-badge { font-size: 13px; font-weight: 700; padding: 2px 9px; border-radius: 7px; white-space: nowrap; flex-shrink: 0; }
        .adm-status-badge { font-size: 10px; font-weight: 500; padding: 2px 8px; border-radius: 100px; white-space: nowrap; }
        .adm-prog-track { height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; margin-top: 7px; }
        .adm-prog-fill  { height: 100%; border-radius: 2px; }

        /* ── Summary proj row ── */
        .adm-proj-row {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.055);
          border-radius: 10px; padding: 9px 13px;
        }
        .adm-proj-name { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.78); flex: 1; }

        /* ── Empty / no data ── */
        .adm-no-data {
          text-align: center; padding: 2.5rem 0;
          color: rgba(255,255,255,0.2); font-size: 13px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }

        /* ── Loading ── */
        .adm-pulse {
          width: 34px; height: 34px; border-radius: 50%;
          border: 2px solid rgba(167,139,250,0.18); border-top-color: #a78bfa;
          animation: adm-spin 0.9s linear infinite;
        }
        .adm-spinner {
          width: 28px; height: 28px; border-radius: 50%;
          border: 2px solid rgba(167,139,250,0.18); border-top-color: #a78bfa;
          animation: adm-spin 0.9s linear infinite; margin: 3rem auto;
        }
        @keyframes adm-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .adm-root { padding: 2rem 1rem 5rem; }
          .adm-title { font-size: 1.65rem; }
          .adm-summary { grid-template-columns: 1fr 1fr; }
          .adm-search { width: 160px; }
        }
      `}</style>

      <div className="adm-root">
        <div className="adm-container">

          {/* ── Header ── */}
          <motion.div className="adm-header" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div className="adm-eyebrow">Admin Panel · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
            <h1 className="adm-title">Employee <em>Overview</em></h1>
            <p className="adm-sub">View project progress and activities per employee</p>
          </motion.div>

          {/* ── Stats ── */}
          <motion.div className="adm-stats" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {[
              { icon: <Users size={14} />, iconBg: 'rgba(167,139,250,0.15)', iconColor: '#a78bfa', num: employees.length, label: 'Total employees' },
              { icon: <BarChart2 size={14} />, iconBg: 'rgba(52,211,153,0.15)', iconColor: '#34d399', num: ITEMS_PER_PAGE, label: 'Per page' },
              { icon: <FileText size={14} />, iconBg: 'rgba(251,146,60,0.15)', iconColor: '#fb923c', num: totalPages, label: 'Pages' },
            ].map((s, i) => (
              <motion.div key={s.label} className="adm-stat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 + i * 0.07 }}>
                <div className="adm-stat-icon" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                <div>
                  <div className="adm-stat-num">{s.num}</div>
                  <div className="adm-stat-label">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Table card ── */}
          <motion.div className="adm-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <div className="adm-card-header">
              <span className="adm-card-title">All Employees</span>
              <div className="adm-search-wrap">
                <Search size={13} className="adm-search-icon" />
                <input
                  className="adm-search"
                  placeholder="Search name or email…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {paginated.length === 0 ? (
              <div className="adm-empty">
                <Users size={30} style={{ opacity: 0.15 }} />
                <span>{search ? 'No employees match your search' : 'No employees found'}</span>
              </div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th className="adm-th">Employee</th>
                    <th className="adm-th">Role</th>
                    <th className="adm-th" style={{ textAlign: 'right' }}>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((emp, i) => (
                    <motion.tr key={emp._id} className="adm-tr"
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.22 + i * 0.04 }}
                    >
                      <td className="adm-td">
                        <div className="adm-emp-row">
                          <div className="adm-avatar" style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}>
                            {getInitials(emp.name)}
                          </div>
                          <div>
                            <div className="adm-name">{emp.name}</div>
                            <div className="adm-email">{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="adm-td">
                        <span className="adm-role-badge">{emp.accessLevel || emp.role || 'Employee'}</span>
                      </td>
                      <td className="adm-td" style={{ textAlign: 'right' }}>
                        <button className="adm-report-btn" onClick={() => handleViewReport(emp)}>
                          <Eye size={13} /> View Report
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="adm-pagination">
              <span className="adm-page-info">
                {filtered.length} employee{filtered.length !== 1 ? 's' : ''} · page {currentPage} of {totalPages}
              </span>
              <div className="adm-page-btns">
                <button className="adm-page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft size={14} />
                </button>
                <div className="adm-page-num">{currentPage} / {totalPages}</div>
                <button className="adm-page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* ── Report Modal ── */}
      <AnimatePresence>
        {showModal && selectedEmployee && (
          <div className="adm-overlay" onClick={closeModal}>
            <motion.div
              className="adm-modal"
              initial={{ opacity: 0, scale: 0.95, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 24 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="adm-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 11,
                    background: AVATAR_GRADIENTS[0],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {getInitials(selectedEmployee.name)}
                  </div>
                  <div>
                    <div className="adm-modal-tag">Activity Report</div>
                    <div className="adm-modal-name">{selectedEmployee.name}</div>
                  </div>
                </div>
                <button className="adm-modal-close" onClick={closeModal}><X size={16} /></button>
              </div>

              {/* Controls */}
              <div className="adm-modal-controls">
                <div className="adm-select-field">
                  <span className="adm-select-label">Year</span>
                  <select className="adm-select" value={year} onChange={e => { setYear(Number(e.target.value)); }}>
                    {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="adm-select-field">
                  <span className="adm-select-label">Month</span>
                  <select className="adm-select" value={month} onChange={e => { setMonth(Number(e.target.value)); }}>
                    {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <button className="adm-ctrl-btn adm-refresh-btn" onClick={handleRefresh} disabled={reportLoading}>
                  <Clock size={13} /> Refresh
                </button>
                <button className="adm-ctrl-btn adm-csv-btn" onClick={handleDownloadCSV} disabled={!hasData || !!exporting || reportLoading}>
                  {exporting === 'csv' ? <Loader2 size={13} style={{ animation: 'adm-spin 0.7s linear infinite' }} /> : <Download size={13} />}
                  CSV
                </button>
                <button className="adm-ctrl-btn adm-pdf-btn" onClick={handleDownloadPDF} disabled={!hasData || !!exporting || reportLoading}>
                  {exporting === 'pdf' ? <Loader2 size={13} style={{ animation: 'adm-spin 0.7s linear infinite' }} /> : <FileText size={13} />}
                  PDF
                </button>
              </div>

              {reportLoading ? (
                <div className="adm-spinner" />
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="adm-summary">
                    {[
                      { icon: <FolderOpen size={15} />, iconBg: 'rgba(167,139,250,0.14)', iconColor: '#a78bfa', num: reportData?.projects.length ?? 0, label: 'Projects' },
                      { icon: <TrendingUp size={15} />, iconBg: 'rgba(52,211,153,0.14)',  iconColor: '#34d399', num: totalUpdates,                        label: 'Progress Updates' },
                      { icon: <ActivityIcon size={15} />, iconBg: 'rgba(96,165,250,0.14)', iconColor: '#60a5fa', num: totalActivities,                    label: 'Activities' },
                    ].map(s => (
                      <div key={s.label} className="adm-sum-card">
                        <div className="adm-sum-icon" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                        <div>
                          <div className="adm-sum-label">{s.label}</div>
                          <div className="adm-sum-num">{s.num}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tabs */}
                  <div className="adm-tabs">
                    {([
                      { key: 'updates',    label: `Progress Updates (${totalUpdates})` },
                      { key: 'activities', label: `Activities (${totalActivities})` },
                      { key: 'summary',    label: `Projects (${reportData?.projects.length ?? 0})` },
                    ] as const).map(t => (
                      <button key={t.key} className={`adm-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="adm-content">
                    <AnimatePresence mode="wait">

                      {/* Progress Updates */}
                      {activeTab === 'updates' && (
                        <motion.div key="updates" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="adm-list">
                          {totalUpdates === 0 ? (
                            <div className="adm-no-data">
                              <TrendingUp size={30} style={{ opacity: 0.12 }} />
                              <span>No progress updates for {MONTH_NAMES[month - 1]} {year}</span>
                            </div>
                          ) : reportData?.projects.map(project =>
                            (project.progressUpdates || [])
                              .slice()
                              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                              .map((u, i) => {
                                const col = getProgressColor(u.percentage);
                                return (
                                  <motion.div key={u._id} className="adm-rep-card"
                                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.035 }}
                                  >
                                    <div className="adm-rep-card-top">
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="adm-rep-name">{project.name}</div>
                                        <div className="adm-rep-sub">{u.note}</div>
                                      </div>
                                      <span className="adm-pct-badge" style={{ color: col, background: col + '18' }}>
                                        {u.percentage}%
                                      </span>
                                    </div>
                                    <div className="adm-prog-track">
                                      <div className="adm-prog-fill" style={{ width: `${u.percentage}%`, background: col }} />
                                    </div>
                                    <div className="adm-rep-meta">
                                      <span>👤 {u.addedBy?.name || 'Unknown'}</span>
                                      <span>·</span>
                                      <span>{fmt(u.createdAt)}</span>
                                      <span>·</span>
                                      <span>{timeAgo(u.createdAt)}</span>
                                    </div>
                                  </motion.div>
                                );
                              })
                          )}
                        </motion.div>
                      )}

                      {/* Activities */}
                      {activeTab === 'activities' && (
                        <motion.div key="activities" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="adm-list">
                          {totalActivities === 0 ? (
                            <div className="adm-no-data">
                              <ActivityIcon size={30} style={{ opacity: 0.12 }} />
                              <span>No activities for {MONTH_NAMES[month - 1]} {year}</span>
                            </div>
                          ) : reportData?.activities.map((a, i) => {
                            const sm = getStatusMeta(a.status);
                            const taskTitle = typeof a.task === 'object' ? a.task.title : 'Unknown Task';
                            return (
                              <motion.div key={a._id} className="adm-rep-card"
                                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.035 }}
                              >
                                <div className="adm-rep-card-top">
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="adm-rep-name">{a.name}</div>
                                    <div className="adm-rep-sub">{a.description}</div>
                                  </div>
                                  <span className="adm-status-badge" style={{ background: sm.bg, color: sm.color }}>
                                    {a.status}
                                  </span>
                                </div>
                                <div className="adm-rep-meta">
                                  <span>Task: {taskTitle}</span>
                                  <span>·</span>
                                  <span>{a.activityType}</span>
                                  <span>·</span>
                                  <span>Priority: {a.priority}</span>
                                  {a.startDate && (
                                    <><span>·</span><span>{fmt(a.startDate)}{a.endDate ? ` → ${fmt(a.endDate)}` : ''}</span></>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      )}

                      {/* Project summary */}
                      {activeTab === 'summary' && (
                        <motion.div key="summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="adm-list">
                          {(reportData?.projects.length ?? 0) === 0 ? (
                            <div className="adm-no-data">
                              <FolderOpen size={30} style={{ opacity: 0.12 }} />
                              <span>No project data for {MONTH_NAMES[month - 1]} {year}</span>
                            </div>
                          ) : reportData?.projects.map((p, i) => {
                            const col = getProgressColor(p.progress ?? 0);
                            const updates = p.progressUpdates || [];
                            const latest = [...updates].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                            return (
                              <motion.div key={p._id} className="adm-proj-row"
                                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="adm-proj-name">{p.name}</div>
                                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                                    {updates.length} update{updates.length !== 1 ? 's' : ''} this month
                                    {latest ? `  ·  Last: ${fmt(latest.createdAt)}` : ''}
                                  </div>
                                </div>
                                <div style={{ width: 100 }}>
                                  <div className="adm-prog-track">
                                    <div className="adm-prog-fill" style={{ width: `${p.progress ?? 0}%`, background: col }} />
                                  </div>
                                </div>
                                <span className="adm-pct-badge" style={{ color: col, background: col + '18', fontSize: 12 }}>
                                  {p.progress ?? 0}%
                                </span>
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
    </>
  );
};