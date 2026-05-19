import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import {
  CheckSquare, Square, X, MessageSquare,
  Users, Receipt, AlertCircle, Clock, CheckCircle2,
  Send, Loader2, ArrowRight, BarChart2,
  Eye, Search, ChevronDown, Award, Zap, Download, Star,
  Activity as ActivityIcon,
} from 'lucide-react';

// ─── Shared sync channel — matches EmployeeMonthlyReport ─────────────────────
const SYNC_CHANNEL = 'monthly-report-sync';

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
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const PRIORITY_COLOR: Record<string, string> = {
  Low: '#60a5fa', Medium: '#fbbf24', High: '#f87171',
};
const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:            { label: 'Draft',        color: '#64748b', bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.2)'  },
  submitted:        { label: 'Submitted',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)'  },
  manager_reviewed: { label: 'Mgr Reviewed', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.25)'  },
  approved:         { label: 'Approved',     color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.25)'  },
  rejected:         { label: 'Returned',     color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.25)' },
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
/** Safely extract a name from any nullable object */
const safeName = (obj: { name?: string | null } | null | undefined, fallback = '—'): string =>
  obj?.name?.trim() || fallback;

const initials = (n?: string | null): string => {
  if (!n || typeof n !== 'string') return 'NA';
  return n.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'NA';
};

const fmt = (d?: string | null): string =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Derive done-state safely */
const taskIsDone = (t: TaskEntry): boolean =>
  t.isDone ||
  t.status === 'Done' || t.status === 'done' ||
  t.status === 'Completed' || t.status === 'completed';

/** Safe employee accessors — never throw on null employee */
const empName  = (r: MonthlyReport): string => r.employee?.name?.trim()  || 'Unknown Employee';
const empEmail = (r: MonthlyReport): string => r.employee?.email?.trim() || '—';

// ─── PDF: Individual Employee ─────────────────────────────────────────────────
const downloadEmployeePDF = async (report: MonthlyReport) => {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc       = new jsPDF('portrait', 'mm', 'a4');
  const pw        = doc.internal.pageSize.getWidth();
  const ph        = doc.internal.pageSize.getHeight();
  const monthName = MONTHS[report.month - 1];

  // ── Palette ────────────────────────────────────────────────────────────────
  const violet   : [number,number,number] = [109,  40, 217];
  const violetMid: [number,number,number] = [139,  92, 246];
  const violetLt : [number,number,number] = [167, 139, 250];
  const indigo   : [number,number,number] = [ 99, 102, 241];
  const teal     : [number,number,number] = [ 20, 184, 166];
  const emerald  : [number,number,number] = [ 16, 185, 129];
  const amber    : [number,number,number] = [245, 158,  11];
  const rose     : [number,number,number] = [244,  63,  94];
  const sky      : [number,number,number] = [ 14, 165, 233];
  const slate50  : [number,number,number] = [248, 250, 252];
  const slate100 : [number,number,number] = [241, 245, 249];
  const slate200 : [number,number,number] = [226, 232, 240];
  const slate600 : [number,number,number] = [ 71,  85, 105];
  const slate800 : [number,number,number] = [ 30,  41,  59];
  const white    : [number,number,number] = [255, 255, 255];

  const rect = (x: number, y: number, w: number, h: number, c: [number,number,number]) => {
    doc.setFillColor(...c); doc.rect(x, y, w, h, 'F');
  };
  const hr = (y: number, x1 = 14, x2 = pw - 14, c: [number,number,number] = slate200) => {
    doc.setDrawColor(...c); doc.setLineWidth(0.2); doc.line(x1, y, x2, y);
  };

  const employeeName = empName(report);

  // ── Cover header ───────────────────────────────────────────────────────────
  rect(0, 0, pw, 52, violet);
  rect(0, 46, pw, 6, violetMid);
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('MONTHLY PERFORMANCE REPORT', 14, 12);
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.15);
  doc.line(14, 14.5, pw - 14, 14.5);
  doc.setFontSize(22);
  doc.text(employeeName.toUpperCase(), 14, 30);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 180, 255);
  doc.text(empEmail(report), 14, 38);
  doc.text(`${monthName.toUpperCase()} ${report.year}`, 14, 44);

  const badgeColors: Record<string, [number,number,number]> = {
    approved: emerald, submitted: [96,165,250], manager_reviewed: amber,
    rejected: [248,113,113], draft: [100,116,139],
  };
  const bColor = badgeColors[report.status] || violetLt;
  rect(pw - 48, 8, 34, 10, bColor);
  doc.setTextColor(...white); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text((STATUS_META[report.status]?.label || report.status).toUpperCase(), pw - 31, 14.5, { align: 'center' });

  if (report.status === 'approved' && typeof report.adminScore === 'number') {
    rect(pw - 48, 21, 34, 10, [30, 41, 59]);
    doc.setTextColor(...violetLt);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(`SCORE: ${report.adminScore}/100`, pw - 31, 27.5, { align: 'center' });
  }

  const tasksDone  = (report.tasks || []).filter(t => taskIsDone(t)).length;
  const tasksTotal = (report.tasks || []).length;
  const taskPct    = tasksTotal ? Math.round(tasksDone / tasksTotal * 100) : 0;
  const acts       = report.activities || [];
  const actDone    = acts.filter(a => a.status === 'Completed').length;
  const reimbTotal = (report.reimbursements || []).reduce((s, r) => s + (r?.amount || 0), 0);
  const nmActs     = report.nextMonthActivities || [];
  const nmTotal    = (report.nextMonthPlan || []).length + nmActs.length;

  const kpis = [
    { label: 'TASKS DONE',  value: `${tasksDone}/${tasksTotal}`,            sub: `${taskPct}% complete`        },
    { label: 'ACTIVITIES',  value: `${actDone}/${acts.length}`,              sub: 'completed'                   },
    { label: 'NEXT MONTH',  value: `${nmTotal}`,                             sub: 'tasks & activities'          },
    { label: 'EXPENSES',    value: `₹${reimbTotal.toLocaleString('en-IN')}`, sub: `${(report.reimbursements || []).length} claim(s)` },
  ];
  const kpiW = pw / kpis.length;
  rect(0, 52, pw, 28, slate100);
  kpis.forEach((k, i) => {
    const cx = kpiW * i;
    if (i > 0) { doc.setDrawColor(...slate200); doc.setLineWidth(0.2); doc.line(cx, 54, cx, 78); }
    doc.setTextColor(...violet);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(k.value, cx + kpiW / 2, 65, { align: 'center' });
    doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...slate600);
    doc.text(k.label, cx + kpiW / 2, 57.5, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(...slate600);
    doc.text(k.sub, cx + kpiW / 2, 73, { align: 'center' });
  });

  let y = 92;

  const sectionHeading = (label: string, color: [number,number,number] = violet) => {
    if (y > ph - 50) { doc.addPage(); y = 20; }
    rect(14, y, pw - 28, 8, color);
    doc.setTextColor(...white);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(`  ${label}`, 16, y + 5.5);
    y += 12;
  };

  const thStyle   = { fillColor: violet as [number,number,number], textColor: white as [number,number,number], fontStyle: 'bold' as const, fontSize: 8, cellPadding: 3 };
  const bodyStyle = { fontSize: 8, cellPadding: 3, textColor: slate800 as [number,number,number], lineColor: slate200 as [number,number,number], lineWidth: 0.15 };

  // ── Section A — Tasks ──────────────────────────────────────────────────────
  sectionHeading(`A.  ${monthName} ${report.year} — Task Report (${tasksDone}/${tasksTotal} completed)`, violet);

  const taskRows = (report.tasks || []).map((task, i) => [
    String(i + 1),
    task.title || '—',
    safeName(task.project),
    safeName(task.assignedBy),
    task.startDate ? fmt(task.startDate) : '—',
    task.endDate   ? fmt(task.endDate)   : task.dueDate ? fmt(task.dueDate) : '—',
    task.status    || '—',
    taskIsDone(task) ? 'Done' : 'Pending',
    taskIsDone(task) ? (task.doneNote || '—') : (task.undoneNote || '—'),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Task', 'Project', 'Assigned By', 'Start', 'End / Due', 'Live Status', 'Result', 'Notes']],
    body: taskRows.length ? taskRows : [['—', 'No tasks recorded', '—', '—', '—', '—', '—', '—', '—']],
    theme: 'grid',
    styles: { ...bodyStyle, overflow: 'linebreak', cellPadding: { top: 3, right: 3, bottom: 3, left: 3 } },
    headStyles: { ...thStyle, halign: 'center' },
    alternateRowStyles: { fillColor: slate50 },
    tableWidth: 'auto',
    columnStyles: {
      0: { cellWidth: 6,  halign: 'center' },
      1: { cellWidth: 46, halign: 'left'   },
      2: { cellWidth: 22, halign: 'left'   },
      3: { cellWidth: 22, halign: 'left'   },
      4: { cellWidth: 21, halign: 'center', fontStyle: 'normal' },
      5: { cellWidth: 21, halign: 'center', fontStyle: 'normal' },
      6: { cellWidth: 20, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
      8: { halign: 'left' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && (data.column.index === 4 || data.column.index === 5)) {
        const val = String(data.cell.raw ?? '');
        if (!val || val === 'undefined' || val === 'null' || val === '—') {
          data.cell.text = ['—'];
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = String(data.cell.raw ?? '');
        const c: [number,number,number] =
          val === 'Done'        ? emerald :
          val === 'In Progress' ? [96, 165, 250] :
          val === 'Review'      ? amber : slate600;
        doc.setTextColor(...c); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
      }
      if (data.section === 'body' && data.column.index === 7) {
        const val = String(data.cell.raw ?? '');
        const c   = val === 'Done' ? emerald : amber;
        doc.setFillColor(...c);
        doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
        doc.setTextColor(...white); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // ── Section B — Activities ─────────────────────────────────────────────────
  sectionHeading(`B.  Activities This Month (${actDone}/${acts.length} completed)`, indigo);

  const actRows = acts.map((a, i) => [
    String(i + 1),
    a.name         || '—',
    a.activityType || '—',
    a.priority     || '—',
    a.startDate    ? fmt(a.startDate) : '—',
    a.endDate      ? fmt(a.endDate)   : '—',
    a.status       || '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Activity', 'Type', 'Priority', 'Start', 'End', 'Status']],
    body: actRows.length ? actRows : [['—', 'No activities recorded', '—', '—', '—', '—', '—']],
    theme: 'grid',
    styles: { ...bodyStyle, overflow: 'linebreak' },
    headStyles: { ...thStyle, fillColor: indigo, halign: 'center' },
    alternateRowStyles: { fillColor: slate50 },
    columnStyles: {
      0: { cellWidth: 6,  halign: 'center' },
      1: { cellWidth: 56, halign: 'left'   },
      2: { cellWidth: 30, halign: 'left'   },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 24, halign: 'center', fontStyle: 'normal' },
      5: { cellWidth: 24, halign: 'center', fontStyle: 'normal' },
      6: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && (data.column.index === 4 || data.column.index === 5)) {
        const val = String(data.cell.raw ?? '');
        if (!val || val === 'undefined' || val === 'null') data.cell.text = ['—'];
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = String(data.cell.raw ?? '');
        const c: [number,number,number] = val === 'Completed' ? emerald : val === 'In Progress' ? [96,165,250] : amber;
        doc.setFillColor(...c);
        doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
        doc.setTextColor(...white); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
      }
      if (data.section === 'body' && data.column.index === 3) {
        const val = String(data.cell.raw ?? '');
        const c: [number,number,number] = val === 'High' ? [248,113,113] : val === 'Medium' ? amber : [96,165,250];
        doc.setTextColor(...c); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // ── Section C — Next Month Plan ────────────────────────────────────────────
  const nmMonth = report.month === 12 ? 1  : report.month + 1;
  const nmYear  = report.month === 12 ? report.year + 1 : report.year;
  const nmLabel = `${MONTHS[nmMonth - 1]} ${nmYear}`;
  const nmPlan  = report.nextMonthPlan || [];

  sectionHeading(`C.  Next Month Plan — ${nmLabel} (${nmPlan.length} tasks · ${nmActs.length} activities)`, violetMid);

  if (nmPlan.length > 0) {
    if (y > ph - 30) { doc.addPage(); y = 20; }
    doc.setTextColor(...violetMid);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('  TASKS', 16, y);
    y += 5;

    const planRows = nmPlan.map((item, i) => [
      String(i + 1),
      item.title        || '—',
      item.projectName  || '—',
      item.assigneeName || '—',
      item.priority     || '—',
      item.startDate    ? fmt(item.startDate) : '—',
      item.endDate      ? fmt(item.endDate)   : '—',
      item.notes        || '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Task / Goal', 'Project', 'Assignee', 'Priority', 'Start', 'End', 'Notes']],
      body: planRows,
      theme: 'grid',
      styles: { ...bodyStyle, overflow: 'linebreak' },
      headStyles: { ...thStyle, fillColor: violetMid, halign: 'center' },
      alternateRowStyles: { fillColor: slate50 },
      columnStyles: {
        0: { cellWidth: 6,  halign: 'center' },
        1: { cellWidth: 46, halign: 'left'   },
        2: { cellWidth: 24, halign: 'left'   },
        3: { cellWidth: 24, halign: 'left'   },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 22, halign: 'center', fontStyle: 'normal' },
        6: { cellWidth: 22, halign: 'center', fontStyle: 'normal' },
        7: { halign: 'left' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.column.index === 5 || data.column.index === 6)) {
          const val = String(data.cell.raw ?? '');
          if (!val || val === 'undefined' || val === 'null') data.cell.text = ['—'];
        }
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw ?? '');
          const c: [number,number,number] = val === 'High' ? [248,113,113] : val === 'Medium' ? amber : [96,165,250];
          doc.setTextColor(...c); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (nmActs.length > 0) {
    if (y > ph - 30) { doc.addPage(); y = 20; }
    doc.setTextColor(...sky);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('  ACTIVITIES', 16, y);
    y += 5;

    const nmActRows = nmActs.map((a, i) => [
      String(i + 1),
      a.name         || '—',
      a.projectName  || '—',
      a.activityType || '—',
      a.priority     || '—',
      a.startDate    ? fmt(a.startDate) : '—',
      a.endDate      ? fmt(a.endDate)   : '—',
      a.notes        || '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Activity', 'Project', 'Type', 'Priority', 'Start', 'End', 'Notes']],
      body: nmActRows,
      theme: 'grid',
      styles: { ...bodyStyle, overflow: 'linebreak' },
      headStyles: { ...thStyle, fillColor: sky, halign: 'center' },
      alternateRowStyles: { fillColor: slate50 },
      columnStyles: {
        0: { cellWidth: 6,  halign: 'center' },
        1: { cellWidth: 46, halign: 'left'   },
        2: { cellWidth: 24, halign: 'left'   },
        3: { cellWidth: 24, halign: 'left'   },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 22, halign: 'center', fontStyle: 'normal' },
        6: { cellWidth: 22, halign: 'center', fontStyle: 'normal' },
        7: { halign: 'left' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.column.index === 5 || data.column.index === 6)) {
          const val = String(data.cell.raw ?? '');
          if (!val || val === 'undefined' || val === 'null') data.cell.text = ['—'];
        }
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw ?? '');
          const c: [number,number,number] = val === 'High' ? [248,113,113] : val === 'Medium' ? amber : [96,165,250];
          doc.setTextColor(...c); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  if (nmPlan.length === 0 && nmActs.length === 0) {
    doc.setTextColor(...slate600); doc.setFontSize(9); doc.setFont('helvetica', 'italic');
    doc.text('No next-month plan submitted.', 16, y);
    y += 10;
  } else {
    y += 4;
  }

  // ── Section D — Reimbursements ─────────────────────────────────────────────
  if ((report.reimbursements || []).length > 0) {
    sectionHeading(`D.  Reimbursements (Total: ₹${reimbTotal.toLocaleString('en-IN')})`, teal);
    const reimbRows = (report.reimbursements || []).map((r, i) => [
      String(i + 1),
      r.title || '—',
      r.expenseDate ? fmt(r.expenseDate) : '—',
      `Rs ${(r.amount || 0).toLocaleString('en-IN')}`,
      r.status || '—',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Title', 'Date', 'Amount', 'Status']],
      body: reimbRows,
      theme: 'grid',
      styles: bodyStyle,
      headStyles: { ...thStyle, fillColor: teal, halign: 'center' },
      alternateRowStyles: { fillColor: slate50 },
      columnStyles: {
        0: { cellWidth: 7,  halign: 'center' },
        2: { cellWidth: 26, halign: 'center', fontStyle: 'normal' },
        3: { cellWidth: 32, halign: 'right',  fontStyle: 'bold'   },
        4: { cellWidth: 24, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const val = String(data.cell.raw ?? '');
          if (!val || val === 'undefined' || val === 'null') data.cell.text = ['—'];
        }
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw ?? '');
          const c   = val === 'Approved' ? emerald : val === 'Rejected' ? rose : val === 'Paid' ? [96,165,250] as [number,number,number] : amber;
          doc.setFillColor(...c);
          doc.roundedRect(data.cell.x + 2, data.cell.y + 1.5, data.cell.width - 4, data.cell.height - 3, 1.5, 1.5, 'F');
          doc.setTextColor(...white); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
          doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ── Overall Summary ────────────────────────────────────────────────────────
  if (y > ph - 55) { doc.addPage(); y = 20; }
  rect(14, y, pw - 28, 7, teal);
  doc.setTextColor(...white); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('  OVERALL SUMMARY', 16, y + 5);
  y += 11;

  const summaryParts: string[] = [];
  if (report.managerRemarks)    summaryParts.push(`Manager Remarks: ${report.managerRemarks}`);
  if (report.adminRemarks)      summaryParts.push(`Admin Remarks: ${report.adminRemarks}`);
  if (report.nextMonthFreeText) summaryParts.push(`Next Month Notes: ${report.nextMonthFreeText}`);
  const summary = summaryParts.join('\n\n') || 'No summary provided.';

  doc.setTextColor(...slate800); doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(summary, pw - 34);
  rect(14, y, pw - 28, Math.min(summaryLines.length * 5 + 8, 60), slate50);
  doc.text(summaryLines, 18, y + 5);
  y += summaryLines.length * 5 + 16;

  if (report.lastMonthNote?.accomplishments) {
    if (y > ph - 60) { doc.addPage(); y = 20; }
    rect(14, y, pw - 28, 7, amber);
    doc.setTextColor(...white); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('  LAST MONTH NOTES', 16, y + 5);
    y += 11;
    const lmRows: string[][] = [];
    if (report.lastMonthNote.accomplishments) lmRows.push(['Accomplishments', report.lastMonthNote.accomplishments]);
    if (report.lastMonthNote.challenges)      lmRows.push(['Challenges',      report.lastMonthNote.challenges]);
    if (report.lastMonthNote.learnings)       lmRows.push(['Learnings',       report.lastMonthNote.learnings]);
    autoTable(doc, {
      startY: y, body: lmRows, theme: 'plain',
      styles: { fontSize: 9, cellPadding: 4, textColor: slate800 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: slate600 } },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ── Footer on every page ───────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    rect(0, ph - 14, pw, 14, slate800);
    doc.setTextColor(...white); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(`${employeeName}  ·  ${monthName} ${report.year}  ·  CONFIDENTIAL`, 14, ph - 6);
    doc.text(`Page ${p} of ${totalPages}`, pw - 14, ph - 6, { align: 'right' });
    doc.text(`Generated ${new Date().toLocaleDateString('en-IN')}`, pw / 2, ph - 6, { align: 'center' });
  }

  doc.setPage(totalPages);
  if (y < ph - 35) {
    hr(y + 2, 14, pw / 2 - 10);
    doc.setTextColor(...slate600); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Employee Signature & Date', 14, y + 8);
    hr(y + 2, pw / 2 + 10, pw - 14);
    doc.text('Reporting Manager Signature', pw / 2 + 10, y + 8);
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
      return [
        empName(r), empEmail(r),
        `${done}/${total} (${pct}%)`,
        `${aDone}/${aTotal}`,
        `Rs ${reimb.toLocaleString('en-IN')}`,
        String(nmTotal),
        STATUS_META[r.status]?.label ?? r.status,
        r.status === 'approved' && typeof r.adminScore === 'number' ? `${r.adminScore}/100` : '—',
      ];
    });

  autoTable(doc, {
    startY: 36,
    head: [['Employee', 'Email', 'Tasks', 'Activities', 'Expenses', 'Next Month Plans', 'Status', 'Score']],
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
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 12px', background: color + '0d', border: `1px solid ${color}22`, borderRadius: 10, minWidth: 56 }}>
    <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'Syne,sans-serif', letterSpacing: '-0.03em' }}>{val}</span>
    <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Mono,monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>{label}</span>
  </div>
);

// ─── Panel Section ────────────────────────────────────────────────────────────
const PS: React.FC<{
  icon: React.ReactNode; title: string; badge?: string | number;
  accent?: string; defaultOpen?: boolean; children: React.ReactNode;
}> = ({ icon, title, badge, accent = '#a78bfa', defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9.5, fontFamily: 'DM Mono,monospace', letterSpacing: '0.11em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)' }}>
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
          {title}
          {badge !== undefined && (
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 100, background: accent + '18', color: accent, fontFamily: 'DM Sans,sans-serif', letterSpacing: 0, fontWeight: 500 }}>{badge}</span>
          )}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.22)', display: 'flex', transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>
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
      .then(res => { if (res.data?._id) setReport(res.data); })
      .catch(err => console.error('Failed to load full report:', err))
      .finally(() => setLoadingActivities(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReport._id]);

  useEffect(() => {
    setReport(prev => ({
      ...initialReport,
      activities: (initialReport.activities?.length) ? initialReport.activities : prev.activities,
      nextMonthActivities: (initialReport.nextMonthActivities?.length) ? initialReport.nextMonthActivities : prev.nextMonthActivities,
    }));
  }, [initialReport]);

  const [tab,            setTab]            = useState<'overview' | 'tasks' | 'activities' | 'plan' | 'reimb'>('overview');
  const [managerRemarks, setManagerRemarks] = useState(initialReport.managerRemarks || '');
  const [adminRemarks,   setAdminRemarks]   = useState(initialReport.adminRemarks   || '');
  const [adminScore,     setAdminScore]     = useState<number>(initialReport.adminScore ?? 0);
  const [rejectionNote,  setRejectionNote]  = useState('');
  const [saving,         setSaving]         = useState<string | null>(null);
  const [error,          setError]          = useState('');

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
    { key: 'overview',   label: 'Overview'                                          },
    { key: 'tasks',      label: `Tasks (${tasksTotal})`                             },
    { key: 'activities', label: `Activities (${acts.length})`                       },
    { key: 'plan',       label: `Next Month (${(report.nextMonthPlan || []).length + nmActs.length})` },
    { key: 'reimb',      label: `Expenses (${reimbs.length})`                       },
  ] as const;

  return (
    <div className="dp-overlay" onClick={onClose}>
      <motion.div
        className="dp-panel"
        initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 80 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="dp-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: AVATAR_GRADS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {initials(empName(report))}
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'DM Mono,monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)', marginBottom: 3 }}>
                Monthly Report · {MONTHS[report.month - 1]} {report.year}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{empName(report)}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontFamily: 'DM Mono,monospace', marginTop: 2 }}>
                {empEmail(report)}{report.reportingManager?.name ? ` · Mgr: ${report.reportingManager.name}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => downloadEmployeePDF(report)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(251,146,60,0.12)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <Download size={14} /> PDF
            </button>
            <button className="dp-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
          <Pill label="Tasks"      val={loadingActivities ? '…' : `${tasksDone}/${tasksTotal}`} color={taskPct >= 70 ? '#34d399' : taskPct >= 40 ? '#fbbf24' : '#f87171'} />
          <Pill label="Completion" val={loadingActivities ? '…' : `${taskPct}%`}                color={taskPct >= 70 ? '#34d399' : taskPct >= 40 ? '#fbbf24' : '#f87171'} />
          <Pill label="Activities" val={loadingActivities ? '…' : `${actDone}/${acts.length}`}  color="#60a5fa" />
          <Pill label="Plans"      val={(report.nextMonthPlan || []).length}                     color="#a78bfa" />
          <Pill label="Next Acts"  val={nmActs.length}                                           color="#38bdf8" />
          <Pill label="Expenses"   val={`₹${reimbTotal.toLocaleString('en-IN')}`}               color="#fb923c" />
          {report.status === 'approved' && typeof report.adminScore === 'number' && (
            <Pill label="Score" val={`${report.adminScore}/100`} color="#34d399" />
          )}
        </div>

        {/* Status bar */}
        <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 500, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}>
            {sm.label}
            {report.submittedAt && <span style={{ opacity: 0.6, fontSize: 10 }}>· {fmt(report.submittedAt)}</span>}
          </span>
          {loadingActivities && (
            <span style={{ fontSize: 10, color: 'rgba(96,165,250,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Loader2 size={11} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> Loading full data…
            </span>
          )}
        </div>

        {error && (
          <div style={{ margin: '8px 16px 0', display: 'flex', gap: 8, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: 10, padding: '9px 12px', color: '#fca5a5', fontSize: 12.5 }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{error}
          </div>
        )}

        {/* Tabs */}
        <div className="dp-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`dp-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div className="dp-content">
          <AnimatePresence mode="wait">

            {/* OVERVIEW */}
            {tab === 'overview' && (
              <motion.div key="ov" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px' }}>
                  <svg width={64} height={64} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
                    <circle cx={32} cy={32} r={26} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
                    <circle cx={32} cy={32} r={26} fill="none"
                      stroke={taskPct >= 70 ? '#34d399' : taskPct >= 40 ? '#fbbf24' : '#f87171'}
                      strokeWidth={6} strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 26}`}
                      strokeDashoffset={`${2 * Math.PI * 26 * (1 - taskPct / 100)}`}
                      transform="rotate(-90 32 32)" style={{ transition: 'stroke-dashoffset 1s ease' }}
                    />
                    <text x={32} y={37} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={700} fontFamily="Syne,sans-serif">{taskPct}%</text>
                  </svg>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>Task Completion</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
                      {loadingActivities ? 'Loading…' : `${tasksDone} of ${tasksTotal} tasks done`}
                      {acts.length > 0 && <><br />{actDone} of {acts.length} activities done</>}
                      {nmActs.length > 0 && <><br />{nmActs.length} activities planned for next month</>}
                    </div>
                  </div>
                </div>

                <PS icon={<CheckSquare size={12} />} title="Task Summary" badge={`${tasksDone}/${tasksTotal}`} accent="#34d399">
                  {loadingActivities ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                      <Loader2 size={14} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> Loading tasks…
                    </div>
                  ) : tasks.slice(0, 6).map(t => {
                    const done = taskIsDone(t);
                    return (
                      <div key={t._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: done ? '#34d399' : 'rgba(255,255,255,0.2)', flexShrink: 0, marginTop: 2 }}>
                          {done ? <CheckSquare size={13} /> : <Square size={13} />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: done ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.82)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</div>
                          {t.status && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Mono,monospace' }}>{t.status}</span>}
                          {!done && t.undoneNote && <div style={{ fontSize: 11, color: 'rgba(248,113,113,0.6)', marginTop: 2, fontStyle: 'italic' }}>⚠ {t.undoneNote}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length > 6 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 6, textAlign: 'center' }}>+{tasks.length - 6} more in Tasks tab</div>}
                </PS>

                {(report.managerRemarks || report.adminRemarks) && (
                  <PS icon={<MessageSquare size={12} />} title="Feedback" accent="#fbbf24" defaultOpen={false}>
                    {report.managerRemarks && (
                      <>
                        <div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: 'rgba(251,191,36,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Manager</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, marginBottom: 8 }}>{report.managerRemarks}</div>
                      </>
                    )}
                    {report.adminRemarks && (
                      <>
                        <div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: 'rgba(167,139,250,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Admin</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{report.adminRemarks}</div>
                      </>
                    )}
                  </PS>
                )}

                {report.lastMonthNote?.accomplishments && (
                  <PS icon={<BarChart2 size={12} />} title="Last Month Notes" accent="#fbbf24" defaultOpen={false}>
                    {report.lastMonthNote.accomplishments && (<><div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: 'rgba(251,191,36,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Accomplishments</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55, marginBottom: 10 }}>{report.lastMonthNote.accomplishments}</div></>)}
                    {report.lastMonthNote.challenges && (<><div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: 'rgba(251,191,36,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Challenges</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55, marginBottom: 10 }}>{report.lastMonthNote.challenges}</div></>)}
                    {report.lastMonthNote.learnings && (<><div style={{ fontSize: 9.5, fontFamily: 'DM Mono,monospace', color: 'rgba(251,191,36,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Learnings</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>{report.lastMonthNote.learnings}</div></>)}
                  </PS>
                )}
              </motion.div>
            )}

            {/* TASKS */}
            {tab === 'tasks' && (
              <motion.div key="tasks" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {loadingActivities ? (
                  <div className="dp-empty"><Loader2 size={28} style={{ opacity: 0.4, animation: 'dp-spin 0.7s linear infinite' }} /><span>Loading tasks…</span></div>
                ) : tasks.length === 0 ? (
                  <div className="dp-empty"><Square size={28} style={{ opacity: 0.1 }} /><span>No tasks in this report</span></div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)', fontWeight: 500 }}>{tasksDone} Done</span>
                      {tasksTotal - tasksDone > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', fontWeight: 500 }}>{tasksTotal - tasksDone} Pending</span>}
                    </div>
                    {tasks.map(task => {
                      const done = taskIsDone(task);
                      const pColor = PRIORITY_COLOR[task.priority || ''] || '#94a3b8';
                      return (
                        <div key={task._id} className="dp-task">
                          <span style={{ color: done ? '#34d399' : 'rgba(255,255,255,0.2)', flexShrink: 0, marginTop: 2 }}>
                            {done ? <CheckSquare size={15} /> : <Square size={15} />}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 500, color: done ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)', textDecoration: done ? 'line-through' : 'none' }}>
                              {task.title}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'DM Mono,monospace', marginTop: 2 }}>
                              {task.project?.name  && `${task.project.name} · `}
                              {task.assignedBy?.name && `By ${task.assignedBy.name} · `}
                              {task.priority && <span style={{ color: pColor }}>{task.priority}</span>}
                              {task.startDate && ` · ${fmt(task.startDate)}`}
                              {task.endDate   && ` → ${fmt(task.endDate)}`}
                              {task.dueDate   && ` · Due ${fmt(task.dueDate)}`}
                            </div>
                            {task.status && (
                              <span style={{ display: 'inline-flex', marginTop: 4, fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 100, background: task.status === 'Done' ? 'rgba(52,211,153,0.12)' : task.status === 'In Progress' ? 'rgba(96,165,250,0.12)' : 'rgba(251,191,36,0.12)', color: task.status === 'Done' ? '#34d399' : task.status === 'In Progress' ? '#60a5fa' : '#fbbf24' }}>
                                {task.status}
                              </span>
                            )}
                            {done && task.doneNote && (
                              <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(52,211,153,0.7)', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.12)', borderRadius: 7, padding: '5px 9px' }}>
                                ✅ {task.doneNote}
                              </div>
                            )}
                            {!done && task.undoneNote && (
                              <div style={{ marginTop: 5, fontSize: 12, color: '#fca5a5', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', borderRadius: 7, padding: '5px 9px' }}>
                                ⚠️ {task.undoneNote}
                              </div>
                            )}
                            {!done && !task.undoneNote && (
                              <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(248,113,113,0.4)', fontStyle: 'italic' }}>No explanation provided</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </motion.div>
            )}

            {/* ACTIVITIES */}
            {tab === 'activities' && (
              <motion.div key="act" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {loadingActivities ? (
                  <div className="dp-empty"><Loader2 size={28} style={{ opacity: 0.4, animation: 'dp-spin 0.7s linear infinite' }} /><span>Loading activities…</span></div>
                ) : acts.length === 0 ? (
                  <div className="dp-empty"><ActivityIcon size={28} style={{ opacity: 0.1 }} /><span>No activities</span></div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      {(['Completed', 'In Progress', 'Pending'] as const).map(s => {
                        const cnt = acts.filter(a => a.status === s).length;
                        const c   = s === 'Completed' ? '#34d399' : s === 'In Progress' ? '#60a5fa' : '#fbbf24';
                        return cnt > 0 ? <span key={s} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: c + '14', color: c, border: `1px solid ${c}22`, fontWeight: 500 }}>{cnt} {s}</span> : null;
                      })}
                    </div>
                    {acts.map(a => {
                      const sc = a.status === 'Completed' ? '#34d399' : a.status === 'In Progress' ? '#60a5fa' : '#fbbf24';
                      const sb = a.status === 'Completed' ? 'rgba(52,211,153,0.1)' : a.status === 'In Progress' ? 'rgba(96,165,250,0.1)' : 'rgba(251,191,36,0.1)';
                      const pColor = PRIORITY_COLOR[a.priority] || '#94a3b8';
                      return (
                        <div key={a._id} className="dp-task">
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: pColor, flexShrink: 0, marginTop: 6 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.82)', flex: 1 }}>{a.name}</span>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: sb, color: sc, fontWeight: 500, whiteSpace: 'nowrap' }}>{a.status}</span>
                            </div>
                            {a.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{a.description}</div>}
                            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'DM Mono,monospace' }}>
                              {a.project?.name && `${a.project.name} · `}
                              {a.task?.title   && `${a.task.title} · `}
                              {a.activityType}
                              {a.startDate && ` · ${fmt(a.startDate)}`}
                              {a.endDate   && ` → ${fmt(a.endDate)}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </motion.div>
            )}

            {/* PLAN */}
            {tab === 'plan' && (
              <motion.div key="plan" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {(report.nextMonthPlan || []).length > 0 && (
                  <PS icon={<CheckSquare size={12} />} title="Task Plan" badge={(report.nextMonthPlan || []).length} accent="#a78bfa" defaultOpen>
                    {(report.nextMonthPlan || []).map((item, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', marginBottom: 7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: item.notes ? 5 : 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[item.priority] || '#94a3b8', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.82)', flex: 1 }}>{item.title}</span>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: (PRIORITY_COLOR[item.priority] || '#94a3b8') + '18', color: PRIORITY_COLOR[item.priority] || '#94a3b8', fontWeight: 500 }}>{item.priority}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono,monospace', paddingLeft: 14, marginBottom: item.notes ? 4 : 0 }}>
                          {item.projectName  && `${item.projectName}`}
                          {item.assigneeName && ` · ${item.assigneeName}`}
                          {item.activityType && ` · ${item.activityType}`}
                          {item.startDate    && ` · ${fmt(item.startDate)}`}
                          {item.endDate      && ` → ${fmt(item.endDate)}`}
                        </div>
                        {item.notes && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', paddingLeft: 14, lineHeight: 1.5 }}>{item.notes}</div>}
                      </div>
                    ))}
                  </PS>
                )}
                {nmActs.length > 0 && (
                  <PS icon={<ActivityIcon size={12} />} title="Activity Plan" badge={nmActs.length} accent="#38bdf8" defaultOpen>
                    {nmActs.map((a, i) => (
                      <div key={i} style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)', borderRadius: 10, padding: '10px 12px', marginBottom: 7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[a.priority] || '#94a3b8', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.82)', flex: 1 }}>{a.name}</span>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: (PRIORITY_COLOR[a.priority] || '#94a3b8') + '18', color: PRIORITY_COLOR[a.priority] || '#94a3b8', fontWeight: 500 }}>{a.priority}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono,monospace', paddingLeft: 14, marginBottom: a.notes ? 4 : 0 }}>
                          {a.activityType && `${a.activityType}`}
                          {a.projectName  && ` · ${a.projectName}`}
                          {a.startDate    && ` · ${fmt(a.startDate)}`}
                          {a.endDate      && ` → ${fmt(a.endDate)}`}
                        </div>
                        {a.notes && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', paddingLeft: 14, lineHeight: 1.5 }}>{a.notes}</div>}
                      </div>
                    ))}
                  </PS>
                )}
                {(report.nextMonthPlan || []).length === 0 && nmActs.length === 0 && !report.nextMonthFreeText && (
                  <div className="dp-empty"><ArrowRight size={28} style={{ opacity: 0.1 }} /><span>No plan submitted</span></div>
                )}
                {report.nextMonthFreeText && (
                  <div style={{ marginTop: 10, padding: '10px 13px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                    {report.nextMonthFreeText}
                  </div>
                )}
              </motion.div>
            )}

            {/* REIMB */}
            {tab === 'reimb' && (
              <motion.div key="reimb" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {reimbs.length === 0 ? (
                  <div className="dp-empty"><Receipt size={28} style={{ opacity: 0.1 }} /><span>No expenses linked</span></div>
                ) : (
                  <>
                    {reimbs.map(r => (
                      <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>{r.title}</div>
                          {r.expenseDate && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'DM Mono,monospace', marginTop: 2 }}>{fmt(r.expenseDate)}</div>}
                        </div>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono,monospace', color: '#fb923c', fontWeight: 600 }}>₹{(r.amount || 0).toLocaleString('en-IN')}</span>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 100, background: r.status === 'Approved' ? 'rgba(52,211,153,0.12)' : r.status === 'Rejected' ? 'rgba(248,113,113,0.12)' : r.status === 'Paid' ? 'rgba(96,165,250,0.12)' : 'rgba(251,191,36,0.12)', color: r.status === 'Approved' ? '#34d399' : r.status === 'Rejected' ? '#f87171' : r.status === 'Paid' ? '#60a5fa' : '#fbbf24' }}>{r.status}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, padding: '9px 13px', background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.14)', borderRadius: 9, fontSize: 13.5, color: '#fb923c', fontWeight: 700 }}>
                      Total: ₹{reimbTotal.toLocaleString('en-IN')}
                    </div>
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Review actions */}
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
                <input type="number" min={0} max={100} value={adminScore} onChange={e => setAdminScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} style={{ width: 70, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontFamily: 'DM Mono,monospace', fontSize: 13, padding: '6px 10px', outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>/ 100</span>
              </div>
              <button className="dp-btn dp-btn-green" disabled={saving === 'approve'} onClick={() => act('approve', { adminRemarks, adminScore }, 'approve')}>
                {saving === 'approve' ? <Loader2 size={13} style={{ animation: 'dp-spin 0.7s linear infinite' }} /> : <CheckCircle2 size={13} />}
                {saving === 'approve' ? 'Approving…' : 'Approve Report'}
              </button>
            </div>
          )}
          {canReject && (
            <div className="dp-review-block">
              <div className="dp-review-label" style={{ color: '#f87171' }}><X size={11} /> Reject & Return</div>
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

  const isAdmin   = ['super-admin', 'admin'].includes(user?.accessLevel || '');
  const isManager = ['manager', 'project-manager'].includes(user?.accessLevel || '');
  const YEARS     = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  /** Normalise a report so no downstream code ever sees null nested objects */
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
  });

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/monthly-reports/team?month=${month}&year=${year}`);
      const data: MonthlyReport[] = Array.isArray(res.data)
        ? res.data.filter((r: MonthlyReport) => r.employee != null).map(normalise)
        : [];
      setReports(data);
    } catch (err) {
      console.error(err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Auto-refresh: 20s when pending, 60s otherwise
  useEffect(() => {
    const hasPending = reports.some(r => ['submitted', 'manager_reviewed'].includes(r.status));
    const interval   = hasPending ? 20_000 : 60_000;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchReports();
    }, interval);
    return () => clearInterval(id);
  }, [fetchReports, reports]);

  // Refresh on tab focus
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') fetchReports(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchReports]);

  // BroadcastChannel: refresh when employee submits/saves
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
    // Guard: never put a null-employee report into state
    if (!updated?.employee) return;
    const safe = normalise(updated);
    setReports(prev => prev.map(r => r._id === safe._id ? safe : r));
    setSelected(safe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const hasPending = reports.some(r => ['submitted', 'manager_reviewed'].includes(r.status));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .arr-root {
          min-height: 100vh; background: #07080e;
          background-image:
            radial-gradient(ellipse 70% 50% at 88% 0%, rgba(124,58,237,0.11) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at 8% 100%, rgba(88,80,236,0.08) 0%, transparent 55%);
          padding: 2.75rem 1.75rem 6rem;
          font-family: 'DM Sans',sans-serif; color: rgba(255,255,255,0.84);
        }
        .arr-wrap { max-width: 1120px; margin: 0 auto; }
        .arr-eyebrow { font-family: 'DM Mono',monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.22); margin-bottom: 10px; }
        .arr-title { font-family: 'Syne',sans-serif; font-size: 2rem; font-weight: 800; letter-spacing: -0.05em; color: #fff; }
        .arr-title em { font-style: normal; background: linear-gradient(120deg,#a78bfa 20%,#818cf8 80%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .arr-sub { font-size: 13px; color: rgba(255,255,255,0.28); margin-top: 6px; margin-bottom: 2rem; }

        .arr-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 1.75rem; }
        .arr-stat { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 12px 18px; display: flex; align-items: center; gap: 10px; transition: border-color 0.2s; }
        .arr-stat:hover { border-color: rgba(255,255,255,0.12); }
        .arr-stat-icon { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .arr-stat-num { font-family: 'Syne',sans-serif; font-size: 1.4rem; font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1; }
        .arr-stat-label { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 2px; }

        .arr-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 1.25rem; }
        .arr-sel { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.75); font-family: 'DM Sans',sans-serif; font-size: 13px; padding: 9px 32px 9px 12px; outline: none; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; transition: border-color 0.2s; }
        .arr-sel:focus { border-color: rgba(167,139,250,0.4); }
        .arr-sel option { background: #12121e; }

        .arr-card { background: rgba(255,255,255,0.028); border: 1px solid rgba(255,255,255,0.07); border-radius: 18px; overflow: hidden; }
        .arr-table { width: 100%; border-collapse: collapse; }
        .arr-th { padding: 11px 16px; text-align: left; font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.055); white-space: nowrap; }
        .arr-tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s; cursor: pointer; }
        .arr-tr:hover { background: rgba(167,139,250,0.04); }
        .arr-tr:last-child { border-bottom: none; }
        .arr-td { padding: 12px 16px; vertical-align: middle; }
        .arr-emp { display: flex; align-items: center; gap: 10px; }
        .arr-av { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .arr-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.85); }
        .arr-email { font-size: 10.5px; color: rgba(255,255,255,0.28); margin-top: 1px; }
        .arr-prog { height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; margin-top: 4px; width: 64px; }
        .arr-prog-fill { height: 100%; border-radius: 2px; }
        .arr-view-btn { display: flex; align-items: center; gap: 5px; padding: 6px 13px; border-radius: 9px; background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.22); color: #a78bfa; font-size: 11.5px; font-weight: 500; cursor: pointer; transition: all 0.18s; font-family: 'DM Sans',sans-serif; white-space: nowrap; }
        .arr-view-btn:hover { background: rgba(124,58,237,0.2); border-color: rgba(167,139,250,0.45); }
        .arr-empty { text-align: center; padding: 4rem 0; color: rgba(255,255,255,0.18); font-size: 13px; }
        .arr-loader { display: flex; align-items: center; justify-content: center; padding: 5rem 0; flex-direction: column; gap: 14px; }
        .arr-spin { width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(167,139,250,0.18); border-top-color: #a78bfa; animation: arr-spin 0.9s linear infinite; }
        @keyframes arr-spin { to { transform: rotate(360deg); } }

        .dp-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: stretch; justify-content: flex-end; }
        .dp-panel { background: #0f0f1d; border-left: 1px solid rgba(255,255,255,0.09); width: 100%; max-width: 600px; display: flex; flex-direction: column; overflow: hidden; }
        .dp-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 1.25rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
        .dp-close { background: rgba(255,255,255,0.06); border: none; border-radius: 8px; color: rgba(255,255,255,0.35); cursor: pointer; padding: 6px; display: flex; transition: all 0.15s; }
        .dp-close:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.72); }
        .dp-tabs { display: flex; gap: 2px; padding: 10px 16px 0; border-bottom: 1px solid rgba(255,255,255,0.055); flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
        .dp-tabs::-webkit-scrollbar { display: none; }
        .dp-tab { padding: 7px 12px; font-size: 11.5px; font-weight: 500; border: none; background: none; color: rgba(255,255,255,0.3); cursor: pointer; font-family: 'DM Sans',sans-serif; border-bottom: 2px solid transparent; transition: all 0.18s; margin-bottom: -1px; white-space: nowrap; flex-shrink: 0; }
        .dp-tab.active { color: #a78bfa; border-bottom-color: #a78bfa; }
        .dp-tab:not(.active):hover { color: rgba(255,255,255,0.6); }
        .dp-content { flex: 1; overflow-y: auto; padding: 14px 16px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.07) transparent; }
        .dp-task { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .dp-task:last-child { border-bottom: none; }
        .dp-empty { text-align: center; padding: 3rem 0; color: rgba(255,255,255,0.18); font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .dp-review { border-top: 1px solid rgba(255,255,255,0.06); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; background: rgba(0,0,0,0.2); flex-shrink: 0; }
        .dp-review-block { display: flex; flex-direction: column; gap: 6px; }
        .dp-review-label { font-size: 9.5px; font-family: 'DM Mono',monospace; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.28); display: flex; align-items: center; gap: 5px; }
        .dp-review-area { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; color: rgba(255,255,255,0.72); font-family: 'DM Sans',sans-serif; font-size: 12.5px; padding: 8px 11px; resize: none; outline: none; transition: border-color 0.2s; }
        .dp-review-area:focus { border-color: rgba(167,139,250,0.32); }
        .dp-review-area::placeholder { color: rgba(255,255,255,0.14); }
        .dp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 12px; font-weight: 600; font-family: 'DM Sans',sans-serif; cursor: pointer; border: none; transition: all 0.2s; width: fit-content; }
        .dp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .dp-btn-blue  { background: rgba(96,165,250,0.12); color: #60a5fa; border: 1px solid rgba(96,165,250,0.22); }
        .dp-btn-blue:hover:not(:disabled)  { background: rgba(96,165,250,0.2); }
        .dp-btn-green { background: linear-gradient(135deg,#059669,#34d399); color: #fff; box-shadow: 0 3px 14px rgba(52,211,153,0.2); }
        .dp-btn-green:hover:not(:disabled) { transform: translateY(-1px); }
        .dp-btn-red   { background: rgba(248,113,113,0.1); color: #f87171; border: 1px solid rgba(248,113,113,0.2); }
        .dp-btn-red:hover:not(:disabled)   { background: rgba(248,113,113,0.18); }
        .dp-btn-ghost { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.45); border: 1px solid rgba(255,255,255,0.1); }
        .dp-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.09); }
        @keyframes dp-spin { to { transform: rotate(360deg); } }

        @media (max-width: 860px) {
          .arr-root { padding: 1.5rem 1rem 5rem; }
          .arr-title { font-size: 1.65rem; }
          .dp-panel { max-width: 100%; }
          .hide-sm { display: none; }
        }
      `}</style>

      <div className="arr-root">
        <div className="arr-wrap">

          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
            <div className="arr-eyebrow">{isAdmin ? 'Admin Panel' : 'Manager Panel'} · {MONTHS[month - 1]} {year}</div>
            <h1 className="arr-title">Team <em>Report Review</em></h1>
            <p className="arr-sub">
              Review, approve and score monthly submissions from your team. Auto-refreshes every {hasPending ? '20' : '60'}s.
            </p>
          </motion.div>

          <motion.div className="arr-stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {[
              { icon: <Users size={14} />,       bg: 'rgba(167,139,250,0.14)', c: '#a78bfa', num: stats.total,     label: 'Total'     },
              { icon: <Send size={14} />,         bg: 'rgba(96,165,250,0.14)',  c: '#60a5fa', num: stats.submitted, label: 'Awaiting'  },
              { icon: <CheckCircle2 size={14} />, bg: 'rgba(52,211,153,0.14)', c: '#34d399', num: stats.approved,  label: 'Approved'  },
              { icon: <Clock size={14} />,        bg: 'rgba(251,191,36,0.14)', c: '#fbbf24', num: stats.pending,   label: 'Pending'   },
              ...(stats.avgScore !== null
                ? [{ icon: <Star size={14} />, bg: 'rgba(251,146,60,0.14)', c: '#fb923c', num: `${stats.avgScore}`, label: 'Avg Score' }]
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
            <select className="arr-sel" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select className="arr-sel" value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="arr-sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="manager_reviewed">Mgr Reviewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
              <input
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.75)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, padding: '9px 13px 9px 34px', outline: 'none' }}
                placeholder="Search employee…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={handlePDF}
              disabled={pdfLoading || reports.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, fontSize: 13, cursor: reports.length === 0 ? 'not-allowed' : 'pointer', opacity: reports.length === 0 ? 0.4 : 1, transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(124,58,237,0.3)', whiteSpace: 'nowrap' }}
            >
              {pdfLoading ? <Loader2 size={15} style={{ animation: 'arr-spin 0.8s linear infinite' }} /> : <Download size={15} />}
              {pdfLoading ? 'Generating…' : 'Team PDF'}
            </button>
          </div>

          {loading ? (
            <div className="arr-loader">
              <div className="arr-spin" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Loading reports…</span>
            </div>
          ) : (
            <motion.div className="arr-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
              <table className="arr-table">
                <thead>
                  <tr>
                    <th className="arr-th">Employee</th>
                    <th className="arr-th">Tasks</th>
                    <th className="arr-th hide-sm">Activities</th>
                    <th className="arr-th hide-sm">Expenses</th>
                    <th className="arr-th hide-sm">Next Plans</th>
                    <th className="arr-th">Status</th>
                    <th className="arr-th">Score</th>
                    <th className="arr-th" style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="arr-empty">
                        <Users size={32} style={{ opacity: 0.1, display: 'block', margin: '0 auto 10px' }} />
                        {reports.length === 0 ? 'No reports submitted for this period yet' : 'No reports match your filters'}
                      </td>
                    </tr>
                  ) : filtered.map((r, i) => {
                    const tasks    = r.tasks || [];
                    const done     = tasks.filter(t => taskIsDone(t)).length;
                    const total    = tasks.length;
                    const pct      = total ? Math.round(done / total * 100) : 0;
                    const sm       = STATUS_META[r.status] ?? STATUS_META.draft;
                    const pColor   = pct >= 70 ? '#34d399' : pct >= 40 ? '#fbbf24' : '#f87171';
                    const rActs    = r.activities || [];
                    const rActDone = rActs.filter(a => a.status === 'Completed').length;
                    const reimbAmt = (r.reimbursements || []).reduce((s, rb) => s + (rb?.amount || 0), 0);
                    const nmPlans  = (r.nextMonthPlan || []).length + (r.nextMonthActivities || []).length;

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
                        <td className="arr-td">
                          <div style={{ fontSize: 12.5, color: pColor, fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>{done}/{total}</div>
                          <div className="arr-prog"><div className="arr-prog-fill" style={{ width: `${pct}%`, background: pColor }} /></div>
                        </td>
                        <td className="arr-td hide-sm">
                          {rActs.length > 0
                            ? <span style={{ fontSize: 12.5, color: '#60a5fa', fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>{rActDone}/{rActs.length}</span>
                            : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' }}>—</span>
                          }
                        </td>
                        <td className="arr-td hide-sm">
                          {(r.reimbursements || []).length > 0 ? (
                            <div style={{ fontSize: 12, color: '#fb923c', fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>
                              ₹{reimbAmt.toLocaleString('en-IN')}
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontWeight: 400, fontFamily: 'DM Sans,sans-serif' }}>{(r.reimbursements || []).length} claim{(r.reimbursements || []).length !== 1 ? 's' : ''}</div>
                            </div>
                          ) : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' }}>—</span>}
                        </td>
                        <td className="arr-td hide-sm">
                          {nmPlans > 0
                            ? <span style={{ fontSize: 12.5, color: '#a78bfa', fontFamily: 'DM Mono,monospace', fontWeight: 600 }}>{nmPlans}</span>
                            : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' }}>—</span>}
                        </td>
                        <td className="arr-td">
                          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 100, fontSize: 10.5, fontWeight: 500, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`, whiteSpace: 'nowrap' }}>{sm.label}</span>
                        </td>
                        <td className="arr-td">
                          {r.status === 'approved' && typeof r.adminScore === 'number'
                            ? <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399', fontFamily: 'DM Mono,monospace' }}>{r.adminScore}<span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.25)' }}>/100</span></span>
                            : <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 12 }}>—</span>
                          }
                        </td>
                        <td className="arr-td" style={{ textAlign: 'right' }}>
                          <button
                            onClick={e => { e.stopPropagation(); downloadEmployeePDF(r); }}
                            className="arr-view-btn"
                            style={{ background: 'rgba(251,146,60,0.1)', borderColor: 'rgba(251,146,60,0.3)', color: '#fb923c', marginRight: 8 }}
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
    </>
  );
};