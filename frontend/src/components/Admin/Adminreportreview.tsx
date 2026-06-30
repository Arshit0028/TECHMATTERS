import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import {
  CheckSquare, Square, X, MessageSquare,
  Users, Receipt, AlertCircle, Clock, CheckCircle2,
  Send, Loader2, ArrowRight, BarChart2,
  Eye, Search, ChevronDown, Award, Zap, Download, Star,
  Activity as ActivityIcon, Sun, Moon, ClipboardList,
} from 'lucide-react';

// ─── Shared sync channel — matches EmployeeMonthlyReport ─────────────────────
const SYNC_CHANNEL = 'monthly-report-sync';

// ─── Theme persistence ────────────────────────────────────────────────────────
const THEME_KEY = 'arr-theme';
type Theme = 'light' | 'dark';
const detectInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    const root = document.documentElement;
    if (root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark') return 'dark';
    const global = localStorage.getItem('theme');
    if (global === 'dark') return 'dark';
  } catch { /* ignore */ }
  return 'light';
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TaskEntry {
  _id: string;
  taskRef?: string | { _id: string; title: string; status: string; priority: string };
  title: string;
  status?: string | null;
  isDone: boolean;
  doneNote: string;
  undoneNote: string;
  assignedBy?: { name: string } | null;
  project?: { name: string } | null;
  dueDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  priority?: string | null;
}
interface NextMonthTask {
  title: string;
  priority: 'Low' | 'Medium' | 'High';
  notes: string;
  projectName?: string | null;
  assigneeName?: string | null;
  activityType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}
interface NextMonthActivity {
  name: string;
  activityType: string;
  priority: 'Low' | 'Medium' | 'High';
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  projectName?: string | null;
}
interface Reimbursement {
  _id: string;
  title: string;
  amount: number;
  status: string;
  expenseDate?: string | null;
}
interface ActivityItem {
  _id: string;
  name: string;
  description?: string | null;
  status: 'Pending' | 'In Progress' | 'Completed';
  activityType: string;
  priority: string;
  startDate?: string | null;
  endDate?: string | null;
  task?: { title: string } | null;
  project?: { name: string } | null;
}

// ─── NEW: AssignedTask type (mirrors AssignedTasks.tsx shape) ─────────────────
interface AssignedTaskUser {
  _id: string;
  name: string;
  email?: string;
}
interface AssignedTaskItem {
  _id: string;
  title: string;
  description?: string | null;
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  project?: { _id: string; name: string } | null;
  dueDate?: string | null;
  assigner?: AssignedTaskUser | null;
  assignee?: AssignedTaskUser | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalNote?: string | null;
  createdAt?: string | null;
}

interface MonthlyReport {
  _id: string;
  month: number;
  year: number;
  status: 'draft' | 'submitted' | 'manager_reviewed' | 'approved' | 'rejected';
  employee: { _id: string; name: string; email: string; accessLevel: string } | null;
  reportingManager?: { _id: string; name: string } | null;
  tasks: TaskEntry[];
  nextMonthPlan: NextMonthTask[];
  nextMonthActivities?: NextMonthActivity[];
  nextMonthFreeText: string;
  reimbursements: Reimbursement[];
  activities?: ActivityItem[];
  submittedAt?: string | null;
  managerRemarks?: string | null;
  adminRemarks?: string | null;
  adminScore?: number | null;
  rejectionNote?: string | null;
  lastMonthNote?: { accomplishments: string; challenges: string; learnings: string } | null;
  // Attached client-side after fetching assigned tasks
  assignedTasks?: AssignedTaskItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const PRIORITY_COLOR: Record<string, string> = {
  Low: '#3b82f6', Medium: '#d97706', High: '#dc2626',
};
const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:            { label: 'Draft',        color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.25)' },
  submitted:        { label: 'Submitted',    color: '#2563eb', bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.28)'   },
  manager_reviewed: { label: 'Mgr Reviewed', color: '#b45309', bg: 'rgba(217,119,6,0.12)',   border: 'rgba(217,119,6,0.28)'   },
  approved:         { label: 'Approved',     color: '#059669', bg: 'rgba(5,150,105,0.12)',   border: 'rgba(5,150,105,0.28)'   },
  rejected:         { label: 'Returned',     color: '#dc2626', bg: 'rgba(220,38,38,0.12)',   border: 'rgba(220,38,38,0.28)'   },
};
const AVATAR_GRADS = [
  'linear-gradient(135deg,#7c3aed,#6366f1)',
  'linear-gradient(135deg,#0891b2,#06b6d4)',
  'linear-gradient(135deg,#059669,#34d399)',
  'linear-gradient(135deg,#d97706,#fbbf24)',
  'linear-gradient(135deg,#dc2626,#f87171)',
  'linear-gradient(135deg,#7c3aed,#ec4899)',
];

// ─── Safe string helpers ──────────────────────────────────────────────────────
const safeName = (obj: { name?: string | null } | null | undefined, fallback = '—'): string =>
  obj?.name?.trim() || fallback;

const initials = (n?: string | null): string => {
  if (!n || typeof n !== 'string') return 'NA';
  return n.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'NA';
};

// ─── Timezone-safe date formatter (UI) ────────────────────────────────────────
const fmt = (d?: string | null): string => {
  if (!d) return '—';
  const datePart = typeof d === 'string' && d.includes('T') ? d.split('T')[0] : d;
  const parts = datePart.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '—';
  const [y, m, day] = parts;
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const taskIsDone = (t: TaskEntry): boolean => t.isDone;
const empName  = (r: MonthlyReport): string => r.employee?.name?.trim()  || 'Unknown Employee';
const empEmail = (r: MonthlyReport): string => r.employee?.email?.trim() || '—';

// ─── Assigned-task approval label ─────────────────────────────────────────────
const AT_APPROVAL: Record<string, { label: string; color: [number,number,number]; bg: [number,number,number] }> = {
  approved: { label: 'Approved', color: [5,150,105],   bg: [209,250,229] },
  pending:  { label: 'Pending',  color: [180,83,9],    bg: [254,243,199] },
  rejected: { label: 'Rejected', color: [185,28,28],   bg: [254,226,226] },
};

// ─── PDF: fmtPDF helper (shared) ──────────────────────────────────────────────
const fmtPDFShared = (d?: string | null, fallback = 'Not set'): string => {
  if (!d) return fallback;
  const part  = d.includes('T') ? d.split('T')[0] : d;
  const parts = part.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return fallback;
  const [yr, mo, dy] = parts;
  return new Date(yr, mo - 1, dy).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

// ─── PDF: Individual Employee (Premium Landscape Layout) ─────────────────────
const downloadEmployeePDF = async (report: MonthlyReport) => {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const ML  = 14;
  const MR  = 14;
  const CW  = pw - ML - MR;

  const monthName    = MONTHS[report.month - 1];
  const employeeName = empName(report);

  const C = {
    violet   : [79,  48, 191] as [number,number,number],
    violetMid: [109, 77, 226] as [number,number,number],
    violetLt : [167,139, 250] as [number,number,number],
    indigo   : [ 79, 70, 229] as [number,number,number],
    teal     : [ 13,148, 136] as [number,number,number],
    emerald  : [  5,150, 105] as [number,number,number],
    amber    : [180,120,  12] as [number,number,number],
    amberLt  : [245,158,  11] as [number,number,number],
    rose     : [190, 18,  60] as [number,number,number],
    sky      : [  3,105, 161] as [number,number,number],
    orange   : [194, 65,  12] as [number,number,number],
    slate50  : [248,250, 252] as [number,number,number],
    slate100 : [241,245, 249] as [number,number,number],
    slate200 : [226,232, 240] as [number,number,number],
    slate400 : [148,163, 184] as [number,number,number],
    slate600 : [ 71, 85, 105] as [number,number,number],
    slate700 : [ 51, 65,  85] as [number,number,number],
    slate800 : [ 30, 41,  59] as [number,number,number],
    slate900 : [ 15, 23,  42] as [number,number,number],
    white    : [255,255, 255] as [number,number,number],
    // new accent for assigned tasks section
    cyan     : [  8,145, 178] as [number,number,number],
  };

  const fill = (x: number, y: number, w: number, h: number, c: [number,number,number]) => {
    doc.setFillColor(...c); doc.rect(x, y, w, h, 'F');
  };
  const strokeRect = (x: number, y: number, w: number, h: number, c: [number,number,number], lw = 0.25) => {
    doc.setDrawColor(...c); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S');
  };
  const hRule = (y: number, x1 = ML, x2 = pw - MR, c: [number,number,number] = C.slate200, lw = 0.18) => {
    doc.setDrawColor(...c); doc.setLineWidth(lw); doc.line(x1, y, x2, y);
  };

  const fmtPDF = fmtPDFShared;
  const money  = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`;

  const tasks      = report.tasks || [];
  const tasksDone  = tasks.filter(t => taskIsDone(t)).length;
  const tasksTotal = tasks.length;
  const taskPct    = tasksTotal ? Math.round(tasksDone / tasksTotal * 100) : 0;
  const acts       = report.activities || [];
  const actDone    = acts.filter(a => a.status === 'Completed').length;
  const nmActs     = report.nextMonthActivities || [];
  const nmPlan     = report.nextMonthPlan || [];
  const reimbs     = report.reimbursements || [];
  const reimbTotal = reimbs.reduce((s, r) => s + (r?.amount || 0), 0);
  const nmMonth    = report.month === 12 ? 1 : report.month + 1;
  const nmYear     = report.month === 12 ? report.year + 1 : report.year;
  const nmLabel    = `${MONTHS[nmMonth - 1]} ${nmYear}`;
  const assignedTasks = report.assignedTasks || [];
  const atDone        = assignedTasks.filter(t => t.status === 'Done').length;

  const thBase = {
    textColor  : C.white as [number,number,number],
    fontStyle  : 'bold' as const,
    fontSize   : 7.5,
    cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
  };
  const tdBase = {
    fontSize   : 8,
    cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
    textColor  : C.slate800 as [number,number,number],
    lineColor  : C.slate200 as [number,number,number],
    lineWidth  : 0.18,
    overflow   : 'linebreak' as const,
  };

  let y = 18;

  const sectionHead = (label: string, accent: [number,number,number], subLabel = '') => {
    if (y > ph - 55) { doc.addPage(); y = 18; }
    fill(ML, y, CW, 9, accent);
    fill(ML, y, 4, 9, C.slate900);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.setCharSpace(0.4);
    doc.text(label, ML + 10, y + 6.3);
    doc.setCharSpace(0);
    if (subLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(220, 210, 255);
      doc.text(subLabel, pw - MR - 2, y + 6.3, { align: 'right' });
    }
    y += 13;
  };

  // PAGE 1 — COVER HEADER
  fill(0, 0, pw, 68, C.slate900);
  fill(0, 0, 5, 68, C.violetMid);
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.03 }));
  doc.triangle(pw - 90, 0, pw, 0, pw, 90, 'F');
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.violetLt);
  doc.setCharSpace(2.5);
  doc.text('MONTHLY PERFORMANCE REPORT', ML + 6, 14);
  doc.setCharSpace(0);
  hRule(17, ML + 6, pw * 0.55, C.violetMid, 0.3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...C.white);
  doc.text(employeeName.toUpperCase(), ML + 6, 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.slate400);
  doc.text(empEmail(report), ML + 6, 42);

  const periodLine =
    `${monthName.toUpperCase()} ${report.year}` +
    (report.reportingManager?.name ? `   |   Manager: ${report.reportingManager.name}` : '');
  doc.setFontSize(8);
  doc.setTextColor(...C.slate400);
  doc.text(periodLine, ML + 6, 50);

  if (report.submittedAt) {
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Submitted: ${fmtPDF(report.submittedAt)}`, ML + 6, 58);
  }

  const sm = STATUS_META[report.status] ?? STATUS_META.draft;
  const badgeW = 48;
  const badgeX = pw - MR - badgeW;
  const statusBgColors: Record<string, [number,number,number]> = {
    approved        : C.emerald,
    submitted       : [37, 99, 235],
    manager_reviewed: [161, 98,  7],
    rejected        : [185, 28, 28],
    draft           : C.slate600,
  };
  const bC = statusBgColors[report.status] ?? C.slate600;
  fill(badgeX, 9, badgeW, 11, bC);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.white);
  doc.setCharSpace(1);
  doc.text(sm.label.toUpperCase(), badgeX + badgeW / 2, 16, { align: 'center' });
  doc.setCharSpace(0);

  if (report.status === 'approved' && typeof report.adminScore === 'number') {
    fill(badgeX, 22, badgeW, 11, C.slate700);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.violetLt);
    doc.text(`SCORE  ${report.adminScore} / 100`, badgeX + badgeW / 2, 29, { align: 'center' });
  }

  // KPI cards — now includes assigned tasks
  const kpis = [
    { label: 'TASKS COMPLETED',   value: `${tasksDone} / ${tasksTotal}`,              sub: `${taskPct}% completion rate`,              accent: C.emerald   },
    { label: 'ACTIVITIES',        value: `${actDone} / ${acts.length}`,               sub: 'completed this month',                     accent: C.indigo    },
    { label: 'ASSIGNED TASKS',    value: `${atDone} / ${assignedTasks.length}`,       sub: `peer tasks (${assignedTasks.length} total)`, accent: C.cyan      },
    { label: 'NEXT MONTH PLAN',   value: `${nmPlan.length + nmActs.length}`,          sub: `items planned for ${nmLabel}`,             accent: C.violetMid },
    { label: 'REIMBURSEMENTS',    value: money(reimbTotal),                           sub: `${reimbs.length} claim(s) submitted`,      accent: C.orange    },
  ];
  const cardW  = (CW - (kpis.length - 1) * 3) / kpis.length;
  const cardY  = 74;
  const cardH  = 38;

  kpis.forEach((k, i) => {
    const cx = ML + i * (cardW + 3);
    fill(cx, cardY, cardW, cardH, C.slate100);
    fill(cx, cardY, 3.5, cardH, k.accent);
    strokeRect(cx, cardY, cardW, cardH, C.slate200);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(...C.slate600);
    doc.setCharSpace(1);
    doc.text(k.label, cx + 9, cardY + 9);
    doc.setCharSpace(0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...k.accent);
    doc.text(k.value, cx + 9, cardY + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.slate600);
    const subLines = doc.splitTextToSize(k.sub, cardW - 14);
    doc.text(subLines, cx + 9, cardY + 30);
  });

  y = cardY + cardH + 12;

  // SECTION A: TASKS
  doc.addPage();
  y = 18;

  sectionHead(
    `A.   ${monthName} ${report.year}  —  Task Report`,
    C.violet,
    `${tasksDone} of ${tasksTotal} completed  (${taskPct}%)`,
  );

  const tCols = { 0: 7, 1: 66, 2: 28, 3: 26, 4: 24, 5: 24, 6: 22, 7: 20 };
  const tNotesW = CW - Object.values(tCols).reduce((a, b) => a + b, 0);

  const ref = (task: TaskEntry): any =>
    task.taskRef && typeof task.taskRef === 'object' ? task.taskRef : null;

  const startOf = (task: TaskEntry): string | null | undefined =>
    task.startDate ?? ref(task)?.startDate ?? null;

  const endOf = (task: TaskEntry): string | null | undefined =>
    task.endDate ?? ref(task)?.endDate ?? task.dueDate ?? ref(task)?.dueDate ?? null;

  const taskRows = tasks.map((task, i) => [
    String(i + 1),
    task.title || '—',
    safeName(task.project),
    safeName(task.assignedBy),
    fmtPDF(startOf(task)),
    fmtPDF(endOf(task)),
    task.status || '—',
    taskIsDone(task) ? 'Done' : 'Pending',
    taskIsDone(task) ? (task.doneNote || '—') : (task.undoneNote || '—'),
  ]);

  autoTable(doc, {
    startY    : y,
    margin    : { left: ML, right: MR },
    head      : [['#', 'Task Title', 'Project', 'Assigned By', 'Start Date', 'End / Due', 'Live Status', 'Result', 'Notes']],
    body      : taskRows.length
      ? taskRows
      : [['—', 'No tasks recorded for this period', '—', '—', '—', '—', '—', '—', '—']],
    theme     : 'grid',
    styles    : { ...tdBase },
    headStyles: { ...thBase, fillColor: C.violet, halign: 'center' as const },
    alternateRowStyles: { fillColor: C.slate50 },
    columnStyles: {
      0: { cellWidth: tCols[0], halign: 'center' as const },
      1: { cellWidth: tCols[1] },
      2: { cellWidth: tCols[2] },
      3: { cellWidth: tCols[3] },
      4: { cellWidth: tCols[4], halign: 'center' as const, fontSize: 7.5 },
      5: { cellWidth: tCols[5], halign: 'center' as const, fontSize: 7.5 },
      6: { cellWidth: tCols[6], halign: 'center' as const },
      7: { cellWidth: tCols[7], halign: 'center' as const },
      8: { cellWidth: tNotesW },
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      if (data.column.index === 7) {
        const val = String(data.cell.raw ?? '');
        const bg: [number,number,number] = val === 'Done' ? C.emerald : C.amberLt;
        doc.setFillColor(...bg);
        doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
        doc.setTextColor(...C.white);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
      }
      if (data.column.index === 6) {
        const val = String(data.cell.raw ?? '');
        const c: [number,number,number] =
          val === 'Done'        ? C.emerald :
          val === 'In Progress' ? [37, 99, 235] :
          val === 'Review'      ? C.amberLt : C.slate600;
        doc.setTextColor(...c);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // SECTION B: ACTIVITIES
  sectionHead(
    'B.   Activities This Month',
    C.indigo,
    `${actDone} of ${acts.length} completed`,
  );

  const aCols = { 0: 7, 1: 72, 2: 40, 3: 22, 4: 26, 5: 26, 6: 26 };
  const aProjW = CW - Object.values(aCols).reduce((a, b) => a + b, 0);

  const actRows = acts.map((a, i) => [
    String(i + 1),
    a.name              || '—',
    a.activityType      || '—',
    a.priority          || '—',
    fmtPDF(a.startDate, '—'),
    fmtPDF(a.endDate, '—'),
    a.status            || '—',
    a.project?.name     || '—',
  ]);

  autoTable(doc, {
    startY    : y,
    margin    : { left: ML, right: MR },
    head      : [['#', 'Activity Name', 'Type', 'Priority', 'Start Date', 'End Date', 'Status', 'Project']],
    body      : actRows.length
      ? actRows
      : [['—', 'No activities recorded', '—', '—', '—', '—', '—', '—']],
    theme     : 'grid',
    styles    : { ...tdBase },
    headStyles: { ...thBase, fillColor: C.indigo, halign: 'center' as const },
    alternateRowStyles: { fillColor: C.slate50 },
    columnStyles: {
      0: { cellWidth: aCols[0], halign: 'center' as const },
      1: { cellWidth: aCols[1] },
      2: { cellWidth: aCols[2] },
      3: { cellWidth: aCols[3], halign: 'center' as const },
      4: { cellWidth: aCols[4], halign: 'center' as const, fontSize: 7.5 },
      5: { cellWidth: aCols[5], halign: 'center' as const, fontSize: 7.5 },
      6: { cellWidth: aCols[6], halign: 'center' as const },
      7: { cellWidth: aProjW },
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      if (data.column.index === 6) {
        const val = String(data.cell.raw ?? '');
        const bg: [number,number,number] =
          val === 'Completed'   ? C.emerald :
          val === 'In Progress' ? [37, 99, 235] : C.amberLt;
        doc.setFillColor(...bg);
        doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
        doc.setTextColor(...C.white);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
      }
      if (data.column.index === 3) {
        const val = String(data.cell.raw ?? '');
        const c: [number,number,number] =
          val === 'High'   ? [185, 28, 28] :
          val === 'Medium' ? C.amberLt     : [37, 99, 235];
        doc.setTextColor(...c);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // SECTION C: NEXT MONTH PLAN
  if (y > ph - 55) { doc.addPage(); y = 18; }

  sectionHead(
    `C.   Next Month Plan  —  ${nmLabel}`,
    C.violetMid,
    `${nmPlan.length} task(s)  ·  ${nmActs.length} activity(ies)`,
  );

  if (nmPlan.length > 0) {
    if (y > ph - 50) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.violetMid);
    doc.setCharSpace(1);
    doc.text('TASK PLAN', ML + 4, y);
    doc.setCharSpace(0);
    y += 5;

    const pCols = { 0: 7, 1: 66, 2: 30, 3: 28, 4: 20, 5: 26, 6: 26 };
    const pNotesW = CW - Object.values(pCols).reduce((a, b) => a + b, 0);

    const planRows = nmPlan.map((item, i) => [
      String(i + 1),
      item.title        || '—',
      item.projectName  || '—',
      item.assigneeName || '—',
      item.priority     || '—',
      fmtPDF(item.startDate),
      fmtPDF(item.endDate),
      item.notes        || '—',
    ]);

    autoTable(doc, {
      startY    : y,
      margin    : { left: ML, right: MR },
      head      : [['#', 'Task / Goal', 'Project', 'Assignee', 'Priority', 'Start Date', 'End Date', 'Notes']],
      body      : planRows,
      theme     : 'grid',
      styles    : { ...tdBase },
      headStyles: { ...thBase, fillColor: C.violetMid, halign: 'center' as const },
      alternateRowStyles: { fillColor: C.slate50 },
      columnStyles: {
        0: { cellWidth: pCols[0], halign: 'center' as const },
        1: { cellWidth: pCols[1] },
        2: { cellWidth: pCols[2] },
        3: { cellWidth: pCols[3] },
        4: { cellWidth: pCols[4], halign: 'center' as const },
        5: { cellWidth: pCols[5], halign: 'center' as const, fontSize: 7.5 },
        6: { cellWidth: pCols[6], halign: 'center' as const, fontSize: 7.5 },
        7: { cellWidth: pNotesW },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw ?? '');
          const c: [number,number,number] =
            val === 'High' ? [185, 28, 28] : val === 'Medium' ? C.amberLt : [37, 99, 235];
          doc.setTextColor(...c); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (nmActs.length > 0) {
    if (y > ph - 50) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.sky);
    doc.setCharSpace(1);
    doc.text('ACTIVITY PLAN', ML + 4, y);
    doc.setCharSpace(0);
    y += 5;

    const naCols = { 0: 7, 1: 66, 2: 30, 3: 28, 4: 20, 5: 26, 6: 26 };
    const naNotesW = CW - Object.values(naCols).reduce((a, b) => a + b, 0);

    const nmActRows = nmActs.map((a, i) => [
      String(i + 1),
      a.name         || '—',
      a.projectName  || '—',
      a.activityType || '—',
      a.priority     || '—',
      fmtPDF(a.startDate, '—'),
      fmtPDF(a.endDate, '—'),
      a.notes        || '—',
    ]);

    autoTable(doc, {
      startY    : y,
      margin    : { left: ML, right: MR },
      head      : [['#', 'Activity', 'Project', 'Type', 'Priority', 'Start Date', 'End Date', 'Notes']],
      body      : nmActRows,
      theme     : 'grid',
      styles    : { ...tdBase },
      headStyles: { ...thBase, fillColor: C.sky, halign: 'center' as const },
      alternateRowStyles: { fillColor: C.slate50 },
      columnStyles: {
        0: { cellWidth: naCols[0], halign: 'center' as const },
        1: { cellWidth: naCols[1] },
        2: { cellWidth: naCols[2] },
        3: { cellWidth: naCols[3] },
        4: { cellWidth: naCols[4], halign: 'center' as const },
        5: { cellWidth: naCols[5], halign: 'center' as const, fontSize: 7.5 },
        6: { cellWidth: naCols[6], halign: 'center' as const, fontSize: 7.5 },
        7: { cellWidth: naNotesW },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw ?? '');
          const c: [number,number,number] =
            val === 'High' ? [185, 28, 28] : val === 'Medium' ? C.amberLt : [37, 99, 235];
          doc.setTextColor(...c); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  if (nmPlan.length === 0 && nmActs.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...C.slate400);
    doc.text('No next-month plan submitted.', ML + 4, y);
    y += 10;
  }

  // SECTION D: REIMBURSEMENTS
  if (reimbs.length > 0) {
    if (y > ph - 55) { doc.addPage(); y = 18; }
    sectionHead(
      'D.   Reimbursements',
      C.teal,
      `Total: ${money(reimbTotal)}   |   ${reimbs.length} claim(s)`,
    );

    const rCols = { 0: 8, 1: 150, 2: 36, 3: 40 };
    const rStatusW = CW - Object.values(rCols).reduce((a, b) => a + b, 0);

    const reimbRows = reimbs.map((r, i) => [
      String(i + 1),
      r.title || '—',
      fmtPDF(r.expenseDate),
      money(r.amount || 0),
      r.status || '—',
    ]);

    autoTable(doc, {
      startY    : y,
      margin    : { left: ML, right: MR },
      head      : [['#', 'Description', 'Date', 'Amount', 'Status']],
      body      : reimbRows,
      theme     : 'grid',
      styles    : { ...tdBase },
      headStyles: { ...thBase, fillColor: C.teal, halign: 'center' as const },
      alternateRowStyles: { fillColor: C.slate50 },
      columnStyles: {
        0: { cellWidth: rCols[0], halign: 'center' as const },
        1: { cellWidth: rCols[1] },
        2: { cellWidth: rCols[2], halign: 'center' as const, fontSize: 7.5 },
        3: { cellWidth: rCols[3], halign: 'right' as const, fontStyle: 'bold' },
        4: { cellWidth: rStatusW, halign: 'center' as const },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw ?? '');
          const bg: [number,number,number] =
            val === 'Approved' ? C.emerald :
            val === 'Paid'     ? [37, 99, 235] :
            val === 'Rejected' ? C.rose : C.amberLt;
          doc.setFillColor(...bg);
          doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
          doc.setTextColor(...C.white);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ─── SECTION E: ASSIGNED TASKS (NEW) ─────────────────────────────────────
  if (assignedTasks.length > 0) {
    if (y > ph - 55) { doc.addPage(); y = 18; }
    sectionHead(
      'E.   Assigned Tasks  —  Peer Collaboration',
      C.cyan,
      `${atDone} of ${assignedTasks.length} done`,
    );

    // Column widths for assigned tasks table
    const atCols = { 0: 7, 1: 68, 2: 32, 3: 32, 4: 22, 5: 22, 6: 22 };
    const atApprovalW = CW - Object.values(atCols).reduce((a, b) => a + b, 0);

    const atRows = assignedTasks.map((t, i) => [
      String(i + 1),
      t.title            || '—',
      t.project?.name    || '—',
      t.assigner?.name   || '—',
      t.priority         || '—',
      fmtPDF(t.dueDate, '—'),
      t.status           || '—',
      t.approvalStatus   || '—',
    ]);

    autoTable(doc, {
      startY    : y,
      margin    : { left: ML, right: MR },
      head      : [['#', 'Task Title', 'Project', 'Assigned By', 'Priority', 'Due Date', 'Status', 'Approval']],
      body      : atRows,
      theme     : 'grid',
      styles    : { ...tdBase },
      headStyles: { ...thBase, fillColor: C.cyan, halign: 'center' as const },
      alternateRowStyles: { fillColor: C.slate50 },
      columnStyles: {
        0: { cellWidth: atCols[0], halign: 'center' as const },
        1: { cellWidth: atCols[1] },
        2: { cellWidth: atCols[2] },
        3: { cellWidth: atCols[3] },
        4: { cellWidth: atCols[4], halign: 'center' as const },
        5: { cellWidth: atCols[5], halign: 'center' as const, fontSize: 7.5 },
        6: { cellWidth: atCols[6], halign: 'center' as const },
        7: { cellWidth: atApprovalW, halign: 'center' as const },
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        // Status column (index 6) — coloured badge
        if (data.column.index === 6) {
          const val = String(data.cell.raw ?? '');
          const bg: [number,number,number] =
            val === 'Done'        ? C.emerald :
            val === 'In Progress' ? [37, 99, 235] : C.amberLt;
          doc.setFillColor(...bg);
          doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
          doc.setTextColor(...C.white);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
        }
        // Approval column (index 7) — coloured badge
        if (data.column.index === 7) {
          const val = String(data.cell.raw ?? '');
          const cfg = AT_APPROVAL[val] ?? AT_APPROVAL.pending;
          doc.setFillColor(...cfg.bg);
          doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
          doc.setTextColor(...cfg.color);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          const label = val.charAt(0).toUpperCase() + val.slice(1);
          doc.text(label, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
        }
        // Priority column (index 4) — coloured text
        if (data.column.index === 4) {
          const val = String(data.cell.raw ?? '');
          const c: [number,number,number] =
            val === 'High'   ? [185, 28, 28] :
            val === 'Medium' ? C.amberLt     : [37, 99, 235];
          doc.setTextColor(...c);
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1.2, { align: 'center' });
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ─── SECTION F: REMARKS & NOTES (was E) ──────────────────────────────────
  const remarkSectionLabel = assignedTasks.length > 0 ? 'F.' : 'E.';

  const hasFeedback =
    report.managerRemarks    ||
    report.adminRemarks      ||
    report.nextMonthFreeText ||
    report.lastMonthNote?.accomplishments;

  if (hasFeedback) {
    if (y > ph - 60) { doc.addPage(); y = 18; }
    sectionHead(`${remarkSectionLabel}   Remarks & Notes`, C.amber);

    const remarkRows: string[][] = [];
    if (report.managerRemarks)                 remarkRows.push(['Manager Remarks',   report.managerRemarks]);
    if (report.adminRemarks)                   remarkRows.push(['Admin Remarks',     report.adminRemarks]);
    if (report.nextMonthFreeText)              remarkRows.push(['Next Month Notes',  report.nextMonthFreeText]);
    if (report.lastMonthNote?.accomplishments) remarkRows.push(['Accomplishments',   report.lastMonthNote.accomplishments]);
    if (report.lastMonthNote?.challenges)      remarkRows.push(['Challenges',        report.lastMonthNote.challenges]);
    if (report.lastMonthNote?.learnings)       remarkRows.push(['Learnings',         report.lastMonthNote.learnings]);

    if (remarkRows.length) {
      autoTable(doc, {
        startY : y,
        margin : { left: ML, right: MR },
        body   : remarkRows,
        theme  : 'plain',
        styles : { ...tdBase, lineColor: C.slate200, lineWidth: 0.18 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 44, textColor: C.slate600 as [number,number,number], fillColor: C.slate100 as [number,number,number] },
          1: { cellWidth: CW - 44 },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 14;
    }
  }

  if (report.status === 'rejected' && report.rejectionNote) {
    if (y > ph - 40) { doc.addPage(); y = 18; }
    fill(ML, y, CW, 8, [185, 28, 28]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text('  REJECTION / RETURN NOTE', ML + 4, y + 5.6);
    y += 10;
    fill(ML, y, CW, 16, [255, 245, 245]);
    strokeRect(ML, y, CW, 16, [254, 202, 202]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(127, 29, 29);
    const rLines = doc.splitTextToSize(report.rejectionNote, CW - 10);
    doc.text(rLines, ML + 5, y + 5);
    y += Math.max(16, rLines.length * 5 + 6) + 10;
  }

  const sigY = ph - 28;
  doc.setPage((doc as any).internal.getNumberOfPages());
  if (y < sigY - 10) {
    hRule(sigY, ML, ML + 72, C.slate600, 0.3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.slate600);
    doc.text('Employee Signature & Date', ML, sigY + 5);

    hRule(sigY, pw / 2, pw / 2 + 72, C.slate600, 0.3);
    doc.text('Reporting Manager Signature', pw / 2, sigY + 5);
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    fill(0, ph - 10, pw, 10, C.slate900);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${employeeName}   |   ${monthName} ${report.year}   |   CONFIDENTIAL`, ML, ph - 3.5);
    doc.text(`Page ${p} of ${totalPages}`, pw / 2, ph - 3.5, { align: 'center' });
    doc.text(`Generated ${new Date().toLocaleDateString('en-IN')}`, pw - MR, ph - 3.5, { align: 'right' });
  }

  doc.save(`${employeeName.replace(/\s+/g, '_')}_${monthName}_${report.year}_Report.pdf`);
};

// ─── PDF: Team Summary ────────────────────────────────────────────────────────
const downloadPDF = async (reports: MonthlyReport[], month: number, year: number) => {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF('landscape');
  doc.setFontSize(18);
  doc.text(`Team Monthly Reports – ${MONTHS[month - 1]} ${year}`, 15, 20);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleDateString('en-IN')}`, 15, 28);

  const rows = reports
    .filter(r => r.employee != null)
    .map(r => {
      const done    = (r.tasks || []).filter(t => taskIsDone(t)).length;
      const total   = (r.tasks || []).length;
      const pct     = total ? Math.round(done / total * 100) : 0;
      const aDone   = (r.activities || []).filter(a => a.status === 'Completed').length;
      const aTotal  = (r.activities || []).length;
      const reimb   = (r.reimbursements || []).reduce((s, rb) => s + (rb?.amount || 0), 0);
      const nmTotal = (r.nextMonthPlan || []).length + (r.nextMonthActivities || []).length;
      const atTotal = (r.assignedTasks || []).length;
      const atDone  = (r.assignedTasks || []).filter(t => t.status === 'Done').length;
      return [
        empName(r), empEmail(r),
        `${done}/${total} (${pct}%)`,
        `${aDone}/${aTotal}`,
        atTotal > 0 ? `${atDone}/${atTotal}` : '—',
        `Rs. ${reimb.toLocaleString('en-IN')}`,
        String(nmTotal),
        STATUS_META[r.status]?.label ?? r.status,
        r.status === 'approved' && typeof r.adminScore === 'number' ? `${r.adminScore}/100` : '—',
      ];
    });

  autoTable(doc, {
    startY: 36,
    head: [['Employee', 'Email', 'Tasks', 'Activities', 'Assigned Tasks', 'Expenses', 'Next Month Plans', 'Status', 'Score']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [124, 58, 237] as [number,number,number], textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 255] as [number,number,number] },
  });
  doc.save(`Team_Reports_${MONTHS[month - 1]}_${year}.pdf`);
};

// ─── Pill ─────────────────────────────────────────────────────────────────────
const Pill: React.FC<{ label: string; val: string | number; color: string }> = ({ label, val, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '9px 14px', background: color + '14', border: `1px solid ${color}33`, borderRadius: 12, minWidth: 64 }}>
    <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'Syne,sans-serif', letterSpacing: '-0.03em', lineHeight: 1 }}>{val}</span>
    <span style={{ fontSize: 9.5, color: 'var(--text-3)', fontFamily: 'DM Mono,monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 5 }}>{label}</span>
  </div>
);

// ─── Panel Section ────────────────────────────────────────────────────────────
const PS: React.FC<{
  icon: React.ReactNode; title: string; badge?: string | number;
  accent?: string; defaultOpen?: boolean; children: React.ReactNode;
}> = ({ icon, title, badge, accent = 'var(--accent)', defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8, background: 'var(--surface-nested)', border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden' }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9.5, fontFamily: 'DM Mono,monospace', letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
          {title}
          {badge !== undefined && (
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 100, background: accent + '22', color: accent, fontFamily: 'DM Sans,sans-serif', letterSpacing: 0, fontWeight: 600 }}>{badge}</span>
          )}
        </span>
        <span style={{ color: 'var(--text-4)', display: 'flex', transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>
          <ChevronDown size={13} />
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 14px 14px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────
const ReportDetail: React.FC<{
  report: MonthlyReport;
  isAdmin: boolean;
  isManager: boolean;
  onClose: () => void;
  onUpdated: (r: MonthlyReport) => void;
}> = ({ report: initialReport, isAdmin, isManager, onClose, onUpdated }) => {

  const [report,            setReport]            = useState<MonthlyReport>(initialReport);
  const [loadingActivities, setLoadingActivities] = useState(false);

  useEffect(() => {
    setLoadingActivities(true);
    api.get(`/monthly-reports/${initialReport._id}`)
      .then(res => {
        if (res.data?._id) {
          setReport(prev => ({
            ...res.data,
            // Preserve already-fetched assigned tasks from the parent list
            assignedTasks: prev.assignedTasks ?? initialReport.assignedTasks ?? [],
          }));
        }
      })
      .catch(err => console.error('Failed to load full report:', err))
      .finally(() => setLoadingActivities(false));
  }, [initialReport._id]);

  useEffect(() => {
    setReport(prev => ({
      ...initialReport,
      activities: (initialReport.activities?.length) ? initialReport.activities : prev.activities,
      nextMonthActivities: (initialReport.nextMonthActivities?.length) ? initialReport.nextMonthActivities : prev.nextMonthActivities,
      assignedTasks: (initialReport.assignedTasks?.length) ? initialReport.assignedTasks : prev.assignedTasks,
    }));
  }, [initialReport]);

  const [tab,            setTab]             = useState<'overview' | 'tasks' | 'activities' | 'plan' | 'reimb' | 'assigned'>('overview');
  const [managerRemarks, setManagerRemarks]  = useState(initialReport.managerRemarks || '');
  const [adminRemarks,   setAdminRemarks]    = useState(initialReport.adminRemarks   || '');
  const [adminScore,     setAdminScore]      = useState<number>(initialReport.adminScore ?? 0);
  const [rejectionNote,  setRejectionNote]   = useState('');
  const [saving,         setSaving]          = useState<string | null>(null);
  const [error,          setError]           = useState('');

  const canManagerReview = isManager && report.status === 'submitted';
  const canAdminApprove  = isAdmin   && ['submitted', 'manager_reviewed'].includes(report.status);
  const canReject        = (isAdmin || isManager) && ['submitted', 'manager_reviewed'].includes(report.status);
  const canReopen        = (isAdmin || isManager) && report.status === 'rejected';

  const tasks      = report.tasks || [];
  const tasksDone  = tasks.filter(t => taskIsDone(t)).length;
  const tasksTotal = tasks.length;
  const taskPct    = tasksTotal ? Math.round(tasksDone / tasksTotal * 100) : 0;
  const acts       = report.activities || [];
  const actDone    = acts.filter(a => a.status === 'Completed').length;
  const nmActs     = report.nextMonthActivities || [];
  const reimbs     = report.reimbursements || [];
  const reimbTotal = reimbs.reduce((s, r) => s + (r?.amount || 0), 0);
  const sm         = STATUS_META[report.status] ?? STATUS_META.draft;
  const assignedTasks = report.assignedTasks || [];
  const atDone        = assignedTasks.filter(t => t.status === 'Done').length;

  const broadcastAdminUpdate = useCallback(() => {
    try {
      const ch = new BroadcastChannel(SYNC_CHANNEL);
      ch.postMessage({ type: 'admin-updated', month: report.month, year: report.year });
      ch.close();
    } catch {}
  }, [report.month, report.year]);

  const act = async (endpoint: string, body: object, label: string) => {
    setSaving(label); setError('');
    try {
      const res = await api.post(`/monthly-reports/${report._id}/${endpoint}`, body);
      onUpdated(res.data);
      broadcastAdminUpdate();
    } catch (err: any) {
      setError(err?.response?.data?.msg || `Failed to ${label}`);
    } finally {
      setSaving(null);
    }
  };

  const TABS = [
    { key: 'overview',  label: 'Overview'                                                     },
    { key: 'tasks',     label: `Tasks (${tasksTotal})`                                        },
    { key: 'activities',label: `Activities (${acts.length})`                                  },
    { key: 'plan',      label: `Next Month (${(report.nextMonthPlan || []).length + nmActs.length})` },
    { key: 'reimb',     label: `Expenses (${reimbs.length})`                                  },
    { key: 'assigned',  label: `Assigned (${assignedTasks.length})`                           },
  ] as const;

  // Approval badge colours for the detail panel UI
  const AT_UI: Record<string, { color: string; bg: string; label: string }> = {
    approved: { color: '#059669', bg: 'rgba(5,150,105,0.12)',  label: 'Approved' },
    pending:  { color: '#b45309', bg: 'rgba(217,119,6,0.12)', label: 'Pending'  },
    rejected: { color: '#dc2626', bg: 'rgba(220,38,38,0.1)',  label: 'Rejected' },
  };

  return (
    <div className="dp-overlay" onClick={onClose}>
      <motion.div
        className="dp-panel"
        initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 80 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dp-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: AVATAR_GRADS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {initials(empName(report))}
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'DM Mono,monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-text)', marginBottom: 3 }}>
                Monthly Report · {MONTHS[report.month - 1]} {report.year}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{empName(report)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'DM Mono,monospace', marginTop: 2 }}>
                {empEmail(report)}{report.reportingManager?.name ? ` · Mgr: ${report.reportingManager.name}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => downloadEmployeePDF(report)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(234,88,12,0.12)', color: '#ea580c', border: '1px solid rgba(234,88,12,0.32)', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <Download size={14} /> PDF
            </button>
            <button className="dp-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-2)', flexWrap: 'wrap' }}>
          <Pill label="Tasks"       val={loadingActivities ? '…' : `${tasksDone}/${tasksTotal}`} color={taskPct >= 70 ? '#059669' : taskPct >= 40 ? '#d97706' : '#dc2626'} />
          <Pill label="Completion"  val={loadingActivities ? '…' : `${taskPct}%`}                color={taskPct >= 70 ? '#059669' : taskPct >= 40 ? '#d97706' : '#dc2626'} />
          <Pill label="Activities"  val={loadingActivities ? '…' : `${actDone}/${acts.length}`}  color="#2563eb" />
          <Pill label="Assigned"    val={`${atDone}/${assignedTasks.length}`}                    color="#0891b2" />
          <Pill label="Plans"       val={(report.nextMonthPlan || []).length}                    color="#7c3aed" />
          <Pill label="Next Acts"   val={nmActs.length}                                          color="#0891b2" />
          <Pill label="Expenses"    val={`₹${reimbTotal.toLocaleString('en-IN')}`}              color="#ea580c" />
          {report.status === 'approved' && typeof report.adminScore === 'number' && (
            <Pill label="Score" val={`${report.adminScore}/100`} color="#059669" />
          )}
        </div>

        <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}>
            {sm.label}
            {report.submittedAt && <span style={{ opacity: 0.7, fontSize: 10 }}>· {fmt(report.submittedAt)}</span>}
          </span>
          {loadingActivities && (
            <span style={{ fontSize: 10, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Loader2 size={11} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> Loading full data…
            </span>
          )}
        </div>

        {error && (
          <div style={{ margin: '8px 16px 0', display: 'flex', gap: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 10, padding: '9px 12px', color: '#dc2626', fontSize: 12.5 }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{error}
          </div>
        )}

        <div className="dp-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`dp-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        <div className="dp-content">
          <AnimatePresence mode="wait">

            {tab === 'overview' && (
              <motion.div key="ov" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, background: 'var(--surface-nested)', border: '1px solid var(--border-2)', borderRadius: 14, padding: '14px 16px' }}>
                  <svg width={64} height={64} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
                    <circle cx={32} cy={32} r={26} fill="none" stroke="var(--track)" strokeWidth={6} />
                    <circle cx={32} cy={32} r={26} fill="none"
                      stroke={taskPct >= 70 ? '#059669' : taskPct >= 40 ? '#d97706' : '#dc2626'}
                      strokeWidth={6} strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 26}`}
                      strokeDashoffset={`${2 * Math.PI * 26 * (1 - taskPct / 100)}`}
                      transform="rotate(-90 32 32)" style={{ transition: 'stroke-dashoffset 1s ease' }}
                    />
                    <text x={32} y={37} textAnchor="middle" style={{ fill: 'var(--text)' }} fontSize={13} fontWeight={700} fontFamily="Syne,sans-serif">{taskPct}%</text>
                  </svg>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Task Completion</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                      {loadingActivities ? 'Loading…' : `${tasksDone} of ${tasksTotal} tasks done`}
                      {acts.length > 0 && <><br />{actDone} of {acts.length} activities done</>}
                      {assignedTasks.length > 0 && <><br />{atDone} of {assignedTasks.length} assigned tasks done</>}
                      {nmActs.length > 0 && <><br />{nmActs.length} activities planned for next month</>}
                    </div>
                  </div>
                </div>

                <PS icon={<CheckSquare size={12} />} title="Task Summary" badge={`${tasksDone}/${tasksTotal}`} accent="#059669">
                  {loadingActivities ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-4)', fontSize: 12 }}>
                      <Loader2 size={14} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> Loading tasks…
                    </div>
                  ) : tasks.slice(0, 6).map(t => {
                    const done = taskIsDone(t);
                    return (
                      <div key={t._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border-2)' }}>
                        <span style={{ color: done ? '#059669' : 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}>
                          {done ? <CheckSquare size={14} /> : <Square size={14} />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: done ? 'var(--text-3)' : 'var(--text-2)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</div>
                          {t.status && <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace' }}>{t.status}</span>}
                          {!done && t.undoneNote && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2, fontStyle: 'italic' }}>⚠ {t.undoneNote}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length > 6 && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8, textAlign: 'center' }}>+{tasks.length - 6} more in Tasks tab</div>}
                </PS>

                {assignedTasks.length > 0 && (
                  <PS icon={<ClipboardList size={12} />} title="Assigned Tasks Summary" badge={`${atDone}/${assignedTasks.length}`} accent="#0891b2" defaultOpen={false}>
                    {assignedTasks.slice(0, 5).map(t => {
                      const done = t.status === 'Done';
                      const appr = AT_UI[t.approvalStatus] ?? AT_UI.pending;
                      return (
                        <div key={t._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border-2)' }}>
                          <span style={{ color: done ? '#059669' : 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}>
                            {done ? <CheckSquare size={14} /> : <Square size={14} />}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: done ? 'var(--text-3)' : 'var(--text-2)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace', marginTop: 2 }}>
                              {t.project?.name && `${t.project.name} · `}
                              {t.assigner?.name && `By ${t.assigner.name}`}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: appr.bg, color: appr.color, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {appr.label}
                          </span>
                        </div>
                      );
                    })}
                    {assignedTasks.length > 5 && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8, textAlign: 'center' }}>+{assignedTasks.length - 5} more in Assigned tab</div>}
                  </PS>
                )}

                {(report.managerRemarks || report.adminRemarks) && (
                  <PS icon={<MessageSquare size={12} />} title="Feedback" accent="#d97706" defaultOpen={false}>
                    {report.managerRemarks && (
                      <>
                        <div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: '#b45309', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Manager</div>
                        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 8 }}>{report.managerRemarks}</div>
                      </>
                    )}
                    {report.adminRemarks && (
                      <>
                        <div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: 'var(--accent-text)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Admin</div>
                        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{report.adminRemarks}</div>
                      </>
                    )}
                  </PS>
                )}

                {report.lastMonthNote?.accomplishments && (
                  <PS icon={<BarChart2 size={12} />} title="Last Month Notes" accent="#d97706" defaultOpen={false}>
                    {report.lastMonthNote.accomplishments && (<><div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: '#b45309', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Accomplishments</div><div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 10 }}>{report.lastMonthNote.accomplishments}</div></>)}
                    {report.lastMonthNote.challenges && (<><div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: '#b45309', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Challenges</div><div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 10 }}>{report.lastMonthNote.challenges}</div></>)}
                    {report.lastMonthNote.learnings && (<><div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: '#b45309', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Learnings</div><div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{report.lastMonthNote.learnings}</div></>)}
                  </PS>
                )}
              </motion.div>
            )}

            {tab === 'tasks' && (
              <motion.div key="tasks" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {loadingActivities ? (
                  <div className="dp-empty"><Loader2 size={28} style={{ opacity: 0.4, animation: 'dp-spin 0.7s linear infinite' }} /><span>Loading tasks…</span></div>
                ) : tasks.length === 0 ? (
                  <div className="dp-empty"><Square size={28} style={{ opacity: 0.25 }} /><span>No tasks in this report</span></div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: 'rgba(5,150,105,0.12)', color: '#059669', border: '1px solid rgba(5,150,105,0.25)', fontWeight: 600 }}>{tasksDone} Done</span>
                      {tasksTotal - tasksDone > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)', fontWeight: 600 }}>{tasksTotal - tasksDone} Pending</span>}
                    </div>
                    {tasks.map(task => {
                      const done = taskIsDone(task);
                      const pColor = PRIORITY_COLOR[task.priority || ''] || 'var(--text-4)';
                      return (
                        <div key={task._id} className="dp-task">
                          <span style={{ color: done ? '#059669' : 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}>
                            {done ? <CheckSquare size={15} /> : <Square size={15} />}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: done ? 'var(--text-3)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                              {task.title}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace', marginTop: 3 }}>
                              {task.project?.name  && `${task.project.name} · `}
                              {task.assignedBy?.name && `By ${task.assignedBy.name} · `}
                              {task.priority && <span style={{ color: pColor }}>{task.priority}</span>}
                              {task.startDate && ` · ${fmt(task.startDate)}`}
                              {task.endDate   && ` → ${fmt(task.endDate)}`}
                              {task.dueDate   && ` · Due ${fmt(task.dueDate)}`}
                            </div>
                            {task.status && (
                              <span style={{ display: 'inline-flex', marginTop: 5, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: task.status === 'Done' ? 'rgba(5,150,105,0.12)' : task.status === 'In Progress' ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.12)', color: task.status === 'Done' ? '#059669' : task.status === 'In Progress' ? '#2563eb' : '#b45309' }}>
                                {task.status}
                              </span>
                            )}
                            {done && task.doneNote && (
                              <div style={{ marginTop: 6, fontSize: 12, color: '#047857', background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.16)', borderRadius: 7, padding: '6px 9px' }}>
                                ✅ {task.doneNote}
                              </div>
                            )}
                            {!done && task.undoneNote && (
                              <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.16)', borderRadius: 7, padding: '6px 9px' }}>
                                ⚠️ {task.undoneNote}
                              </div>
                            )}
                            {!done && !task.undoneNote && (
                              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-4)', fontStyle: 'italic' }}>No explanation provided</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </motion.div>
            )}

            {tab === 'activities' && (
              <motion.div key="act" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {loadingActivities ? (
                  <div className="dp-empty"><Loader2 size={28} style={{ opacity: 0.4, animation: 'dp-spin 0.7s linear infinite' }} /><span>Loading activities…</span></div>
                ) : acts.length === 0 ? (
                  <div className="dp-empty"><ActivityIcon size={28} style={{ opacity: 0.25 }} /><span>No activities</span></div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      {(['Completed', 'In Progress', 'Pending'] as const).map(s => {
                        const cnt = acts.filter(a => a.status === s).length;
                        const c   = s === 'Completed' ? '#059669' : s === 'In Progress' ? '#2563eb' : '#b45309';
                        return cnt > 0 ? <span key={s} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: c + '1f', color: c, border: `1px solid ${c}33`, fontWeight: 600 }}>{cnt} {s}</span> : null;
                      })}
                    </div>
                    {acts.map(a => {
                      const sc = a.status === 'Completed' ? '#059669' : a.status === 'In Progress' ? '#2563eb' : '#b45309';
                      const sb = a.status === 'Completed' ? 'rgba(5,150,105,0.12)' : a.status === 'In Progress' ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.12)';
                      const pColor = PRIORITY_COLOR[a.priority] || 'var(--text-4)';
                      const hasDates = !!(a.startDate || a.endDate);
                      return (
                        <div key={a._id} className="dp-task">
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: pColor, flexShrink: 0, marginTop: 6 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{a.name}</span>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: sb, color: sc, fontWeight: 600, whiteSpace: 'nowrap' }}>{a.status}</span>
                            </div>
                            {a.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 3 }}>{a.description}</div>}
                            <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace' }}>
                              {a.project?.name && `${a.project.name} · `}
                              {a.task?.title   && `${a.task.title} · `}
                              {a.activityType}
                              {a.startDate && ` · ${fmt(a.startDate)}`}
                              {a.endDate   && ` → ${fmt(a.endDate)}`}
                              {!hasDates && ` · No fixed dates`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </motion.div>
            )}

            {tab === 'plan' && (
              <motion.div key="plan" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {(report.nextMonthPlan || []).length > 0 && (
                  <PS icon={<CheckSquare size={12} />} title="Task Plan" badge={(report.nextMonthPlan || []).length} accent="#7c3aed" defaultOpen>
                    {(report.nextMonthPlan || []).map((item, i) => (
                      <div key={i} style={{ background: 'var(--surface-nested)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '11px 12px', marginBottom: 7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: item.notes ? 5 : 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[item.priority] || 'var(--text-4)', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{item.title}</span>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: (PRIORITY_COLOR[item.priority] || '#94a3b8') + '22', color: PRIORITY_COLOR[item.priority] || 'var(--text-3)', fontWeight: 600 }}>{item.priority}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace', paddingLeft: 15, marginBottom: item.notes ? 4 : 0 }}>
                          {item.projectName  && `${item.projectName}`}
                          {item.assigneeName && ` · ${item.assigneeName}`}
                          {item.activityType && ` · ${item.activityType}`}
                          {item.startDate    && ` · ${fmt(item.startDate)}`}
                          {item.endDate      && ` → ${fmt(item.endDate)}`}
                        </div>
                        {item.notes && <div style={{ fontSize: 12, color: 'var(--text-3)', paddingLeft: 15, lineHeight: 1.5 }}>{item.notes}</div>}
                      </div>
                    ))}
                  </PS>
                )}
                {nmActs.length > 0 && (
                  <PS icon={<ActivityIcon size={12} />} title="Activity Plan" badge={nmActs.length} accent="#0891b2" defaultOpen>
                    {nmActs.map((a, i) => {
                      const hasDates = !!(a.startDate || a.endDate);
                      return (
                        <div key={i} style={{ background: 'var(--surface-nested)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '11px 12px', marginBottom: 7 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[a.priority] || 'var(--text-4)', flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{a.name}</span>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: (PRIORITY_COLOR[a.priority] || '#94a3b8') + '22', color: PRIORITY_COLOR[a.priority] || 'var(--text-3)', fontWeight: 600 }}>{a.priority}</span>
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace', paddingLeft: 15, marginBottom: a.notes ? 4 : 0 }}>
                            {a.activityType && `${a.activityType}`}
                            {a.projectName  && ` · ${a.projectName}`}
                            {a.startDate    && ` · ${fmt(a.startDate)}`}
                            {a.endDate      && ` → ${fmt(a.endDate)}`}
                            {!hasDates && ` · No fixed dates`}
                          </div>
                          {a.notes && <div style={{ fontSize: 12, color: 'var(--text-3)', paddingLeft: 15, lineHeight: 1.5 }}>{a.notes}</div>}
                        </div>
                      );
                    })}
                  </PS>
                )}
                {(report.nextMonthPlan || []).length === 0 && nmActs.length === 0 && !report.nextMonthFreeText && (
                  <div className="dp-empty"><ArrowRight size={28} style={{ opacity: 0.25 }} /><span>No plan submitted</span></div>
                )}
                {report.nextMonthFreeText && (
                  <div style={{ marginTop: 10, padding: '11px 13px', background: 'var(--surface-nested)', border: '1px solid var(--border-2)', borderRadius: 10, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                    {report.nextMonthFreeText}
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'reimb' && (
              <motion.div key="reimb" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {reimbs.length === 0 ? (
                  <div className="dp-empty"><Receipt size={28} style={{ opacity: 0.25 }} /><span>No expenses linked</span></div>
                ) : (
                  <>
                    {reimbs.map(r => (
                      <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-2)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{r.title}</div>
                          {r.expenseDate && <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace', marginTop: 2 }}>{fmt(r.expenseDate)}</div>}
                        </div>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono,monospace', color: '#ea580c', fontWeight: 700 }}>₹{(r.amount || 0).toLocaleString('en-IN')}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: r.status === 'Approved' ? 'rgba(5,150,105,0.12)' : r.status === 'Rejected' ? 'rgba(220,38,38,0.12)' : r.status === 'Paid' ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.12)', color: r.status === 'Approved' ? '#059669' : r.status === 'Rejected' ? '#dc2626' : r.status === 'Paid' ? '#2563eb' : '#b45309' }}>{r.status}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, padding: '10px 13px', background: 'rgba(234,88,12,0.07)', border: '1px solid rgba(234,88,12,0.18)', borderRadius: 9, fontSize: 13.5, color: '#ea580c', fontWeight: 700 }}>
                      Total: ₹{reimbTotal.toLocaleString('en-IN')}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* ─── NEW: Assigned Tasks tab ─────────────────────────────────── */}
            {tab === 'assigned' && (
              <motion.div key="assigned" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {assignedTasks.length === 0 ? (
                  <div className="dp-empty">
                    <ClipboardList size={28} style={{ opacity: 0.25 }} />
                    <span>No assigned tasks for this employee</span>
                  </div>
                ) : (
                  <>
                    {/* Status summary chips */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                      {(['Done', 'In Progress', 'To Do'] as const).map(s => {
                        const cnt = assignedTasks.filter(t => t.status === s).length;
                        const c   = s === 'Done' ? '#059669' : s === 'In Progress' ? '#2563eb' : '#b45309';
                        return cnt > 0
                          ? <span key={s} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: c + '1f', color: c, border: `1px solid ${c}33`, fontWeight: 600 }}>{cnt} {s}</span>
                          : null;
                      })}
                    </div>

                    {assignedTasks.map(t => {
                      const done    = t.status === 'Done';
                      const sc      = done ? '#059669' : t.status === 'In Progress' ? '#2563eb' : '#b45309';
                      const sb      = done ? 'rgba(5,150,105,0.12)' : t.status === 'In Progress' ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.12)';
                      const appr    = AT_UI[t.approvalStatus] ?? AT_UI.pending;
                      const pColor  = PRIORITY_COLOR[t.priority] || 'var(--text-4)';

                      return (
                        <div key={t._id} className="dp-task">
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: pColor, flexShrink: 0, marginTop: 6 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: done ? 'var(--text-3)' : 'var(--text)', flex: 1, textDecoration: done ? 'line-through' : 'none' }}>
                                {t.title}
                              </span>
                              {/* Status badge */}
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: sb, color: sc, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {t.status}
                              </span>
                              {/* Approval badge */}
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: appr.bg, color: appr.color, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {appr.label}
                              </span>
                            </div>

                            {t.description && (
                              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, lineHeight: 1.5 }}>
                                {t.description.length > 140 ? t.description.slice(0, 140) + '…' : t.description}
                              </div>
                            )}

                            <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'DM Mono,monospace' }}>
                              {t.project?.name  && `${t.project.name} · `}
                              {t.assigner?.name && `By ${t.assigner.name} · `}
                              <span style={{ color: pColor }}>{t.priority}</span>
                              {t.dueDate && ` · Due ${fmt(t.dueDate)}`}
                              {t.createdAt && ` · ${fmt(t.createdAt)}`}
                            </div>

                            {t.approvalNote && (
                              <div style={{ marginTop: 6, fontSize: 12, color: t.approvalStatus === 'rejected' ? '#dc2626' : '#047857', background: t.approvalStatus === 'rejected' ? 'rgba(220,38,38,0.06)' : 'rgba(5,150,105,0.07)', border: `1px solid ${t.approvalStatus === 'rejected' ? 'rgba(220,38,38,0.16)' : 'rgba(5,150,105,0.16)'}`, borderRadius: 7, padding: '6px 9px' }}>
                                💬 {t.approvalNote}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <div className="dp-review">
          {canManagerReview && (
            <div className="dp-review-block">
              <div className="dp-review-label"><MessageSquare size={11} /> Manager Remarks</div>
              <textarea className="dp-review-area" rows={3} value={managerRemarks} onChange={e => setManagerRemarks(e.target.value)} placeholder="Add your remarks…" />
              <button className="dp-btn dp-btn-blue" disabled={saving === 'manager-review'} onClick={() => act('manager-review', { managerRemarks }, 'manager-review')}>
                {saving === 'manager-review' ? <Loader2 size={13} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> : <CheckCircle2 size={13} />}
                {saving === 'manager-review' ? 'Saving…' : 'Submit Review'}
              </button>
            </div>
          )}
          {canAdminApprove && (
            <div className="dp-review-block">
              <div className="dp-review-label"><Award size={11} /> Admin Approval</div>
              <textarea className="dp-review-area" rows={2} value={adminRemarks} onChange={e => setAdminRemarks(e.target.value)} placeholder="Final remarks…" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <span className="dp-review-label" style={{ marginBottom: 0 }}><Zap size={11} /> Score</span>
                <input type="number" min={0} max={100} value={adminScore} onChange={e => setAdminScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} style={{ width: 70, background: 'var(--chip)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono,monospace', fontSize: 13, padding: '6px 10px', outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>/ 100</span>
              </div>
              <button className="dp-btn dp-btn-green" disabled={saving === 'approve'} onClick={() => act('approve', { adminRemarks, adminScore }, 'approve')}>
                {saving === 'approve' ? <Loader2 size={13} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> : <CheckCircle2 size={13} />}
                {saving === 'approve' ? 'Approving…' : 'Approve Report'}
              </button>
            </div>
          )}
          {canReject && (
            <div className="dp-review-block">
              <div className="dp-review-label" style={{ color: '#dc2626' }}><X size={11} /> Reject & Return</div>
              <textarea className="dp-review-area" rows={2} value={rejectionNote} onChange={e => setRejectionNote(e.target.value)} placeholder="What needs fixing…" />
              <button className="dp-btn dp-btn-red" disabled={saving === 'reject'} onClick={() => act('reject', { rejectionNote }, 'reject')}>
                {saving === 'reject' ? <Loader2 size={13} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> : <X size={13} />}
                {saving === 'reject' ? 'Rejecting…' : 'Reject Report'}
              </button>
            </div>
          )}
          {canReopen && (
            <button className="dp-btn dp-btn-ghost" disabled={saving === 'reopen'} onClick={() => act('reopen', {}, 'reopen')}>
              {saving === 'reopen' ? <Loader2 size={13} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> : <Send size={13} />}
              {saving === 'reopen' ? 'Reopening…' : 'Reopen for Employee'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const AdminReportReview: React.FC = () => {
  const { user } = useAuth();
  const now = new Date();
  const [month,        setMonth]        = useState(now.getMonth() + 1);
  const [year,         setYear]         = useState(now.getFullYear());
  const [reports,      setReports]      = useState<MonthlyReport[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [selected,     setSelected]     = useState<MonthlyReport | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search,       setSearch]       = useState('');
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [theme,        setTheme]        = useState<Theme>(detectInitialTheme);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const isAdmin   = ['super-admin', 'admin', 'hr'].includes(user?.accessLevel || '');
  const isManager = ['manager', 'project-manager'].includes(user?.accessLevel || '');
  const YEARS     = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);

  const normalise = (r: MonthlyReport): MonthlyReport => ({
    ...r,
    tasks:               (r.tasks || []).map(t => ({
      ...t,
      project:    t.project    ?? null,
      assignedBy: t.assignedBy ?? null,
      status:     t.status     ?? null,
      priority:   t.priority   ?? null,
    })),
    activities:          (r.activities || []).map(a => ({
      ...a,
      project: a.project ?? null,
      task:    a.task    ?? null,
    })),
    reimbursements:      r.reimbursements      || [],
    nextMonthPlan:       r.nextMonthPlan       || [],
    nextMonthActivities: r.nextMonthActivities || [],
    nextMonthFreeText:   r.nextMonthFreeText   || '',
    assignedTasks:       r.assignedTasks       || [],
  });

  // ─── Fetch assigned tasks for all employees and attach to reports ──────────
  const attachAssignedTasks = useCallback(async (reportList: MonthlyReport[]): Promise<MonthlyReport[]> => {
    try {
      // Fetch all assigned tasks visible to admin in one request.
      // Adjust the endpoint path to match your backend route if different.
      const res = await api.get('/assigned-tasks/admin/all');
      const raw: AssignedTaskItem[] = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.tasks) ? res.data.tasks : []);

      // Group by assignee._id
      const byAssignee = new Map<string, AssignedTaskItem[]>();
      for (const t of raw) {
        const aid = t.assignee?._id;
        if (!aid) continue;
        if (!byAssignee.has(aid)) byAssignee.set(aid, []);
        byAssignee.get(aid)!.push(t);
      }

      return reportList.map(r => ({
        ...r,
        assignedTasks: r.employee?._id ? (byAssignee.get(r.employee._id) ?? []) : [],
      }));
    } catch (err) {
      // Non-fatal: if the endpoint doesn't exist or fails, reports still load
      console.warn('[AdminReportReview] Could not fetch assigned tasks:', err);
      return reportList;
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/monthly-reports/team?month=${month}&year=${year}`);
      const data: MonthlyReport[] = Array.isArray(res.data)
        ? res.data.filter((r: MonthlyReport) => r.employee != null).map(normalise)
        : [];

      // Attach assigned tasks after reports are fetched
      const withTasks = await attachAssignedTasks(data);
      setReports(withTasks);
    } catch (err) {
      console.error(err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [month, year, attachAssignedTasks]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  useEffect(() => { setSelected(null); }, [month, year]);

  // ─── Event-driven refresh: NO polling interval ─────────────────────────────
  // Refresh on tab focus and visibility restore only. The BroadcastChannel
  // handles cross-tab sync when the detail panel posts an admin action.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchReports();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [fetchReports]);

  useEffect(() => {
    let ch: BroadcastChannel;
    try {
      ch = new BroadcastChannel(SYNC_CHANNEL);
      ch.onmessage = (e) => {
        if (e.data?.type !== 'admin-updated' && e.data?.month === month && e.data?.year === year) {
          fetchReports();
        }
      };
    } catch { /* BroadcastChannel not supported */ }
    return () => { try { ch?.close(); } catch {} };
  }, [fetchReports, month, year]);

  const onUpdated = useCallback((updated: MonthlyReport) => {
    if (!updated?.employee) return;
    const safe = normalise(updated);
    setReports(prev => {
      // Preserve assigned tasks already attached to this report
      const existing = prev.find(r => r._id === safe._id);
      const merged   = { ...safe, assignedTasks: safe.assignedTasks?.length ? safe.assignedTasks : (existing?.assignedTasks ?? []) };
      return prev.map(r => r._id === merged._id ? merged : r);
    });
    setSelected(prev => {
      if (!prev || prev._id !== safe._id) return prev;
      return { ...safe, assignedTasks: safe.assignedTasks?.length ? safe.assignedTasks : (prev?.assignedTasks ?? []) };
    });
  }, []);

  const filtered = reports.filter(r => {
    if (!r.employee) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (r.employee.name  || '').toLowerCase().includes(q) ||
        (r.employee.email || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total:     reports.length,
    submitted: reports.filter(r => r.status === 'submitted').length,
    approved:  reports.filter(r => r.status === 'approved').length,
    pending:   reports.filter(r => ['submitted', 'manager_reviewed'].includes(r.status)).length,
    avgScore: (() => {
      const s = reports.filter(r => r.status === 'approved' && typeof r.adminScore === 'number');
      return s.length ? Math.round(s.reduce((a, r) => a + (r.adminScore || 0), 0) / s.length) : null;
    })(),
  };

  const handlePDF = async () => {
    if (!reports.length) return;
    setPdfLoading(true);
    try { await downloadPDF(reports, month, year); }
    finally { setPdfLoading(false); }
  };

  return (
    <div className="arr-theme-scope" data-theme={theme}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap');
        .arr-theme-scope, .arr-theme-scope *, .arr-theme-scope *::before, .arr-theme-scope *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .arr-theme-scope[data-theme="light"] {
          --bg: #f5f6f8;
          --glow-1: radial-gradient(ellipse 55% 42% at 95% -12%, rgba(99,102,241,0.04) 0%, transparent 62%);
          --glow-2: radial-gradient(ellipse 45% 40% at 2% 110%, rgba(91,84,230,0.03) 0%, transparent 62%);
          --surface: #ffffff;
          --surface-nested: #f7f8fa;
          --surface-hover: #f4f5f9;
          --solid: #ffffff;
          --chip: rgba(15,23,42,0.045);
          --chip-hover: rgba(15,23,42,0.08);
          --track: rgba(15,23,42,0.08);
          --border: #e6e8ee;
          --border-2: #edeef3;
          --border-strong: #d3d8e0;
          --text: #14161b;
          --text-2: #3a4150;
          --text-3: #697083;
          --text-4: #97a0b0;
          --text-faint: #c3c9d4;
          --accent: #5b54e6;
          --accent-2: #6366f1;
          --accent-text: #4f46e5;
          --accent-soft: rgba(79,70,229,0.07);
          --accent-soft-2: rgba(79,70,229,0.13);
          --accent-border: rgba(79,70,229,0.2);
          --shadow-card: 0 1px 2px rgba(18,24,40,0.04), 0 6px 20px rgba(18,24,40,0.05);
          --shadow-panel: -22px 0 60px rgba(18,24,40,0.14);
          --overlay: rgba(18,24,40,0.30);
          --input-bg: #ffffff;
          --scrollbar: rgba(15,23,42,0.16);
        }
        .arr-theme-scope[data-theme="dark"] {
          --bg: #0a0b12;
          --glow-1: radial-gradient(ellipse 70% 50% at 88% 0%, rgba(124,58,237,0.13) 0%, transparent 55%);
          --glow-2: radial-gradient(ellipse 55% 45% at 8% 100%, rgba(88,80,236,0.09) 0%, transparent 55%);
          --surface: rgba(255,255,255,0.035);
          --surface-nested: rgba(255,255,255,0.03);
          --surface-hover: rgba(167,139,250,0.07);
          --solid: #14151f;
          --chip: rgba(255,255,255,0.06);
          --chip-hover: rgba(255,255,255,0.11);
          --track: rgba(255,255,255,0.08);
          --border: rgba(255,255,255,0.085);
          --border-2: rgba(255,255,255,0.05);
          --border-strong: rgba(255,255,255,0.15);
          --text: #ffffff;
          --text-2: rgba(255,255,255,0.82);
          --text-3: rgba(255,255,255,0.5);
          --text-4: rgba(255,255,255,0.34);
          --text-faint: rgba(255,255,255,0.2);
          --accent: #a78bfa;
          --accent-2: #818cf8;
          --accent-text: #a78bfa;
          --accent-soft: rgba(167,139,250,0.12);
          --accent-soft-2: rgba(167,139,250,0.2);
          --accent-border: rgba(167,139,250,0.3);
          --shadow-card: none;
          --shadow-panel: -22px 0 60px rgba(0,0,0,0.5);
          --overlay: rgba(0,0,0,0.7);
          --input-bg: rgba(255,255,255,0.05);
          --scrollbar: rgba(255,255,255,0.12);
        }

        .arr-root {
          min-height: 100vh; background: var(--bg);
          background-image: var(--glow-1), var(--glow-2);
          padding: 2.5rem 1.75rem 6rem;
          font-family: 'DM Sans',sans-serif; color: var(--text-2);
          transition: background-color 0.3s ease, color 0.3s ease;
        }
        .arr-wrap { max-width: 1180px; margin: 0 auto; }

        .arr-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .arr-eyebrow { font-family: 'DM Mono',monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-text); margin-bottom: 10px; }
        .arr-title { font-family: 'Syne',sans-serif; font-size: 2.05rem; font-weight: 800; letter-spacing: -0.05em; color: var(--text); line-height: 1.05; }
        .arr-title em { font-style: normal; background: linear-gradient(120deg, var(--accent) 12%, var(--accent-2) 88%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .arr-sub { font-size: 13px; color: var(--text-3); margin-top: 8px; margin-bottom: 2rem; max-width: 640px; }

        .arr-theme-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 40px; padding: 0 14px; border-radius: 11px; background: var(--surface); border: 1px solid var(--border); color: var(--text-2); cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-card); font-family: 'DM Sans',sans-serif; font-size: 12.5px; font-weight: 600; flex-shrink: 0; }
        .arr-theme-toggle:hover { border-color: var(--accent-border); color: var(--text); }
        .arr-theme-toggle .lbl { white-space: nowrap; }

        .arr-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(152px, 1fr)); gap: 12px; margin-bottom: 1.75rem; }
        .arr-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px 18px; display: flex; align-items: center; gap: 12px; transition: border-color 0.2s, transform 0.2s; box-shadow: var(--shadow-card); }
        .arr-stat:hover { border-color: var(--border-strong); transform: translateY(-1px); }
        .arr-stat-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .arr-stat-num { font-family: 'Syne',sans-serif; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
        .arr-stat-label { font-size: 11px; color: var(--text-3); margin-top: 4px; font-weight: 500; }

        .arr-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 1.25rem; }
        .arr-sel { background: var(--input-bg); border: 1px solid var(--border); border-radius: 11px; color: var(--text-2); font-family: 'DM Sans',sans-serif; font-size: 13px; font-weight: 500; padding: 10px 34px 10px 13px; outline: none; cursor: pointer; appearance: none; box-shadow: var(--shadow-card); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 11px center; transition: border-color 0.2s; }
        .arr-sel:focus { border-color: var(--accent-border); }
        .arr-sel option { background: var(--solid); color: var(--text); }
        .arr-search { flex: 1; min-width: 200px; position: relative; }
        .arr-search input { width: 100%; background: var(--input-bg); border: 1px solid var(--border); border-radius: 11px; color: var(--text-2); font-family: 'DM Sans',sans-serif; font-size: 13px; padding: 10px 13px 10px 36px; outline: none; box-shadow: var(--shadow-card); transition: border-color 0.2s; }
        .arr-search input:focus { border-color: var(--accent-border); }
        .arr-search input::placeholder { color: var(--text-4); }

        .arr-pdf-btn { display: flex; align-items: center; gap: 8px; padding: 10px 18px; background: linear-gradient(135deg,#7c3aed,#6366f1); color: #fff; border: none; border-radius: 11px; font-family: 'DM Sans',sans-serif; font-weight: 600; font-size: 13px; transition: all 0.2s; box-shadow: 0 6px 18px rgba(124,58,237,0.32); white-space: nowrap; cursor: pointer; }
        .arr-pdf-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(124,58,237,0.4); }

        .arr-card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-card); }
        .arr-scroll { width: 100%; overflow-x: auto; }
        .arr-table { width: 100%; border-collapse: collapse; min-width: 760px; }
        .arr-th { padding: 13px 18px; text-align: left; font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-4); background: var(--surface-nested); border-bottom: 1px solid var(--border); white-space: nowrap; }
        .arr-th.num { text-align: center; }
        .arr-th.right { text-align: right; }
        .arr-tr { border-bottom: 1px solid var(--border-2); transition: background 0.15s; cursor: pointer; }
        .arr-tr:hover { background: var(--surface-hover); }
        .arr-tr:last-child { border-bottom: none; }
        .arr-td { padding: 14px 18px; vertical-align: middle; }
        .arr-td.num { text-align: center; }
        .arr-td.right { text-align: right; }
        .arr-emp { display: flex; align-items: center; gap: 11px; }
        .arr-av { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .arr-name { font-size: 13px; font-weight: 600; color: var(--text); }
        .arr-email { font-size: 10.5px; color: var(--text-3); margin-top: 1px; }
        .arr-task-cell { display: inline-flex; flex-direction: column; align-items: center; gap: 5px; }
        .arr-prog { height: 4px; background: var(--track); border-radius: 2px; overflow: hidden; width: 70px; }
        .arr-prog-fill { height: 100%; border-radius: 2px; }
        .arr-view-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border-radius: 9px; background: var(--accent-soft); border: 1px solid var(--accent-border); color: var(--accent-text); font-size: 11.5px; font-weight: 600; cursor: pointer; transition: all 0.18s; font-family: 'DM Sans',sans-serif; white-space: nowrap; }
        .arr-view-btn:hover { background: var(--accent-soft-2); }
        .arr-pdf-mini { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border-radius: 9px; background: rgba(234,88,12,0.1); border: 1px solid rgba(234,88,12,0.28); color: #ea580c; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: all 0.18s; font-family: 'DM Sans',sans-serif; white-space: nowrap; margin-right: 8px; }
        .arr-pdf-mini:hover { background: rgba(234,88,12,0.18); }
        .arr-dash { font-size: 12px; color: var(--text-4); font-style: italic; }
        .arr-empty { text-align: center; padding: 4rem 0; color: var(--text-4); font-size: 13px; }
        .arr-loader { display: flex; align-items: center; justify-content: center; padding: 5rem 0; flex-direction: column; gap: 14px; }
        .arr-spin { width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--accent-soft-2); border-top-color: var(--accent); animation: arr-spin 0.9s linear infinite; }
        @keyframes arr-spin { to { transform: rotate(360deg); } }

        .dp-overlay { position: fixed; inset: 0; z-index: 200; background: var(--overlay); backdrop-filter: blur(10px); display: flex; align-items: stretch; justify-content: flex-end; }
        .dp-panel { background: var(--solid); border-left: 1px solid var(--border); width: 100%; max-width: 620px; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-panel); }
        .dp-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 1.25rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .dp-close { background: var(--chip); border: none; border-radius: 8px; color: var(--text-3); cursor: pointer; padding: 7px; display: flex; transition: all 0.15s; }
        .dp-close:hover { background: var(--chip-hover); color: var(--text); }
        .dp-tabs { display: flex; gap: 2px; padding: 10px 16px 0; border-bottom: 1px solid var(--border-2); flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
        .dp-tabs::-webkit-scrollbar { display: none; }
        .dp-tab { padding: 8px 13px; font-size: 11.5px; font-weight: 600; border: none; background: none; color: var(--text-3); cursor: pointer; font-family: 'DM Sans',sans-serif; border-bottom: 2px solid transparent; transition: all 0.18s; margin-bottom: -1px; white-space: nowrap; flex-shrink: 0; }
        .dp-tab.active { color: var(--accent-text); border-bottom-color: var(--accent); }
        .dp-tab:not(.active):hover { color: var(--text-2); }
        .dp-content { flex: 1; overflow-y: auto; padding: 16px; scrollbar-width: thin; scrollbar-color: var(--scrollbar) transparent; }
        .dp-content::-webkit-scrollbar { width: 8px; }
        .dp-content::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 4px; }
        .dp-task { display: flex; align-items: flex-start; gap: 11px; padding: 11px 0; border-bottom: 1px solid var(--border-2); }
        .dp-task:last-child { border-bottom: none; }
        .dp-empty { text-align: center; padding: 3rem 0; color: var(--text-4); font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .dp-review { border-top: 1px solid var(--border); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; background: var(--surface-nested); flex-shrink: 0; }
        .dp-review-block { display: flex; flex-direction: column; gap: 6px; }
        .dp-review-label { font-size: 9.5px; font-family: 'DM Mono',monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); display: flex; align-items: center; gap: 5px; }
        .dp-review-area { width: 100%; background: var(--input-bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text-2); font-family: 'DM Sans',sans-serif; font-size: 12.5px; padding: 9px 11px; resize: none; outline: none; transition: border-color 0.2s; }
        .dp-review-area:focus { border-color: var(--accent-border); }
        .dp-review-area::placeholder { color: var(--text-4); }
        .dp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 9px; font-size: 12px; font-weight: 600; font-family: 'DM Sans',sans-serif; cursor: pointer; border: none; transition: all 0.2s; width: fit-content; }
        .dp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .dp-btn-blue  { background: rgba(37,99,235,0.12); color: #2563eb; border: 1px solid rgba(37,99,235,0.28); }
        .dp-btn-blue:hover:not(:disabled)  { background: rgba(37,99,235,0.2); }
        .dp-btn-green { background: linear-gradient(135deg,#059669,#10b981); color: #fff; box-shadow: 0 4px 14px rgba(5,150,105,0.28); }
        .dp-btn-green:hover:not(:disabled) { transform: translateY(-1px); }
        .dp-btn-red   { background: rgba(220,38,38,0.1); color: #dc2626; border: 1px solid rgba(220,38,38,0.26); }
        .dp-btn-red:hover:not(:disabled)   { background: rgba(220,38,38,0.18); }
        .dp-btn-ghost { background: var(--chip); color: var(--text-2); border: 1px solid var(--border); }
        .dp-btn-ghost:hover:not(:disabled) { background: var(--chip-hover); }
        @keyframes dp-spin { to { transform: rotate(360deg); } }

        @media (max-width: 860px) {
          .arr-root { padding: 1.5rem 1rem 5rem; }
          .arr-title { font-size: 1.7rem; }
          .dp-panel { max-width: 100%; }
        }
      `}</style>

      <div className="arr-root">
        <div className="arr-wrap">

          <motion.div className="arr-topbar" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
            <div>
              <div className="arr-eyebrow">{isAdmin ? 'Admin Panel' : 'Manager Panel'} · {MONTHS[month - 1]} {year}</div>
              <h1 className="arr-title">Team <em>Report Review</em></h1>
              <p className="arr-sub">
                Review, approve and score monthly submissions from your team. Updates automatically when you return to this tab or another tab posts a change.
              </p>
            </div>
            <button
              className="arr-theme-toggle"
              onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
              aria-label="Toggle dark mode"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              <span className="lbl">{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
          </motion.div>

          <motion.div className="arr-stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {[
              { icon: <Users size={15} />,        bg: 'var(--accent-soft)',      c: 'var(--accent-text)', num: stats.total,     label: 'Total'     },
              { icon: <Send size={15} />,         bg: 'rgba(37,99,235,0.12)',    c: '#2563eb',            num: stats.submitted, label: 'Awaiting'  },
              { icon: <CheckCircle2 size={15} />, bg: 'rgba(5,150,105,0.12)',    c: '#059669',            num: stats.approved,  label: 'Approved'  },
              { icon: <Clock size={15} />,        bg: 'rgba(217,119,6,0.12)',    c: '#b45309',            num: stats.pending,   label: 'Pending'   },
              ...(stats.avgScore !== null
                ? [{ icon: <Star size={15} />, bg: 'rgba(234,88,12,0.12)', c: '#ea580c', num: `${stats.avgScore}`, label: 'Avg Score' }]
                : []
              ),
            ].map((s, i) => (
              <motion.div key={s.label} className="arr-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 + i * 0.06 }}>
                <div className="arr-stat-icon" style={{ background: s.bg, color: s.c }}>{s.icon}</div>
                <div>
                  <div className="arr-stat-num" style={{ color: s.c }}>{s.num}</div>
                  <div className="arr-stat-label">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <div className="arr-controls">
            <select className="arr-sel" value={month} onChange={e => setMonth(Number(e.target.value))} aria-label="Filter by month">
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select className="arr-sel" value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Filter by year">
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="arr-sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="manager_reviewed">Mgr Reviewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <div className="arr-search">
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
              <input
                placeholder="Search employee…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              className="arr-pdf-btn"
              onClick={handlePDF}
              disabled={pdfLoading || reports.length === 0}
              style={{ opacity: reports.length === 0 ? 0.45 : 1 }}
            >
              {pdfLoading ? <Loader2 size={15} style={{ animation: 'arr-spin 0.8s linear infinite' }} /> : <Download size={15} />}
              {pdfLoading ? 'Generating…' : 'Team PDF'}
            </button>
          </div>

          {loading ? (
            <div className="arr-loader">
              <div className="arr-spin" />
              <span style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading reports…</span>
            </div>
          ) : (
            <motion.div className="arr-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
              <div className="arr-scroll">
                <table className="arr-table">
                  <thead>
                    <tr>
                      <th className="arr-th">Employee</th>
                      <th className="arr-th num">Tasks</th>
                      <th className="arr-th num">Activities</th>
                      <th className="arr-th num">Assigned</th>
                      <th className="arr-th num">Expenses</th>
                      <th className="arr-th num">Next Plans</th>
                      <th className="arr-th num">Status</th>
                      <th className="arr-th num">Score</th>
                      <th className="arr-th right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="arr-empty">
                          <Users size={32} style={{ opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
                          {reports.length === 0 ? 'No reports submitted for this period yet' : 'No reports match your filters'}
                        </td>
                      </tr>
                    ) : filtered.map((r, i) => {
                      const tasks    = r.tasks || [];
                      const done     = tasks.filter(t => taskIsDone(t)).length;
                      const total    = tasks.length;
                      const pct      = total ? Math.round(done / total * 100) : 0;
                      const sm       = STATUS_META[r.status] ?? STATUS_META.draft;
                      const pColor   = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626';
                      const rActs    = r.activities || [];
                      const rActDone = rActs.filter(a => a.status === 'Completed').length;
                      const reimbAmt = (r.reimbursements || []).reduce((s, rb) => s + (rb?.amount || 0), 0);
                      const nmPlans  = (r.nextMonthPlan || []).length + (r.nextMonthActivities || []).length;
                      const atList   = r.assignedTasks || [];
                      const atDone   = atList.filter(t => t.status === 'Done').length;

                      return (
                        <motion.tr
                          key={r._id} className="arr-tr"
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.04 }}
                          onClick={() => setSelected(r)}
                        >
                          <td className="arr-td">
                            <div className="arr-emp">
                              <div className="arr-av" style={{ background: AVATAR_GRADS[i % AVATAR_GRADS.length] }}>
                                {initials(empName(r))}
                              </div>
                              <div>
                                <div className="arr-name">{empName(r)}</div>
                                <div className="arr-email">{empEmail(r)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="arr-td num">
                            <div className="arr-task-cell">
                              <span style={{ fontSize: 12.5, color: pColor, fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>{done}/{total}</span>
                              <div className="arr-prog"><div className="arr-prog-fill" style={{ width: `${pct}%`, background: pColor }} /></div>
                            </div>
                          </td>
                          <td className="arr-td num">
                            {rActs.length > 0
                              ? <span style={{ fontSize: 12.5, color: '#2563eb', fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>{rActDone}/{rActs.length}</span>
                              : <span className="arr-dash">—</span>
                            }
                          </td>
                          {/* NEW: Assigned tasks column */}
                          <td className="arr-td num">
                            {atList.length > 0
                              ? (
                                <div className="arr-task-cell">
                                  <span style={{ fontSize: 12.5, color: '#0891b2', fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>{atDone}/{atList.length}</span>
                                  <div className="arr-prog">
                                    <div className="arr-prog-fill" style={{ width: `${atList.length ? Math.round(atDone / atList.length * 100) : 0}%`, background: '#0891b2' }} />
                                  </div>
                                </div>
                              )
                              : <span className="arr-dash">—</span>
                            }
                          </td>
                          <td className="arr-td num">
                            {(r.reimbursements || []).length > 0 ? (
                              <div style={{ fontSize: 12, color: '#ea580c', fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>
                                ₹{reimbAmt.toLocaleString('en-IN')}
                                <div style={{ fontSize: 10, color: 'var(--text-4)', fontWeight: 400, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>{(r.reimbursements || []).length} claim{(r.reimbursements || []).length !== 1 ? 's' : ''}</div>
                              </div>
                            ) : <span className="arr-dash">—</span>}
                          </td>
                          <td className="arr-td num">
                            {nmPlans > 0
                              ? <span style={{ fontSize: 12.5, color: 'var(--accent-text)', fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>{nmPlans}</span>
                              : <span className="arr-dash">—</span>}
                          </td>
                          <td className="arr-td num">
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 100, fontSize: 10.5, fontWeight: 600, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`, whiteSpace: 'nowrap' }}>{sm.label}</span>
                          </td>
                          <td className="arr-td num">
                            {r.status === 'approved' && typeof r.adminScore === 'number'
                              ? <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: 'DM Mono,monospace' }}>{r.adminScore}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-4)' }}>/100</span></span>
                              : <span className="arr-dash">—</span>
                            }
                          </td>
                          <td className="arr-td right" style={{ whiteSpace: 'nowrap' }}>
                            <button
                              onClick={e => { e.stopPropagation(); downloadEmployeePDF(r); }}
                              className="arr-pdf-mini"
                            >
                              <Download size={12} /> PDF
                            </button>
                            <button className="arr-view-btn" onClick={e => { e.stopPropagation(); setSelected(r); }}>
                              <Eye size={12} /> Review
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <ReportDetail
            report={selected}
            isAdmin={isAdmin}
            isManager={isManager}
            onClose={() => setSelected(null)}
            onUpdated={onUpdated}
          />
        )}
      </AnimatePresence>
    </div>
  );
};