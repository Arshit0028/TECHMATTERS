// src/utils/exportCSV.ts
import type { Project, Activity } from '../types/index';

const esc = (v: any): string => {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${s}"`;
};

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// ── Main export ───────────────────────────────────────────────────────────────
export function downloadCSV(
  employeeName: string,
  monthLabel: string,
  year: number,
  projects: Project[],
  activities: Activity[],
) {
  const rows: string[] = [];

  // ── Meta header ─────────────────────────────────────────────────────────────
  rows.push(esc(`Project Activity Report — ${monthLabel} ${year}`));
  rows.push(esc(`Employee: ${employeeName}`));
  rows.push(esc(`Generated: ${new Date().toLocaleDateString('en-IN')}`));
  rows.push('');

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Progress Updates
  // ════════════════════════════════════════════════════════════════════════════
  rows.push(esc('PROGRESS UPDATES'));
  rows.push([
    esc('Project Name'),
    esc('Progress %'),
    esc('Note'),
    esc('Added By'),
    esc('Date'),
    esc('Days Ago'),
  ].join(','));

  // Collect all updates across projects, sorted newest first
  const allUpdates: {
    projectName: string;
    percentage: number;
    note: string;
    addedBy: string;
    date: string;
  }[] = [];

  projects.forEach(p => {
    (p.progressUpdates || []).forEach(u => {
      allUpdates.push({
        projectName: p.name,
        percentage: u.percentage,
        note: u.note,
        addedBy: u.addedBy?.name || 'Unknown',
        date: u.createdAt,
      });
    });
  });

  allUpdates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (allUpdates.length === 0) {
    rows.push(esc('No progress updates recorded for this period.'));
  } else {
    allUpdates.forEach(u => {
      const daysAgo = Math.floor((Date.now() - new Date(u.date).getTime()) / 86400000);
      rows.push([
        esc(u.projectName),
        esc(u.percentage + '%'),
        esc(u.note),
        esc(u.addedBy),
        esc(fmt(u.date)),
        esc(daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`),
      ].join(','));
    });
  }

  rows.push('');

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Activities
  // ════════════════════════════════════════════════════════════════════════════
  rows.push(esc('ACTIVITIES'));
  rows.push([
    esc('Activity Name'),
    esc('Task'),
    esc('Type'),
    esc('Status'),
    esc('Priority'),
    esc('Start Date'),
    esc('End Date'),
    esc('Assignee'),
  ].join(','));

  if (activities.length === 0) {
    rows.push(esc('No activities recorded for this period.'));
  } else {
    activities.forEach(a => {
      const taskTitle = typeof a.task === 'object' ? a.task.title : String(a.task);
      const assigneeName = a.assignee
        ? (typeof a.assignee === 'object' ? a.assignee.name : String(a.assignee))
        : 'Unassigned';
      rows.push([
        esc(a.name),
        esc(taskTitle),
        esc(a.activityType),
        esc(a.status),
        esc(a.priority),
        esc(fmt(a.startDate)),
        esc(fmt(a.endDate)),
        esc(assigneeName),
      ].join(','));
    });
  }

  rows.push('');

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 3 — Summary per project
  // ════════════════════════════════════════════════════════════════════════════
  rows.push(esc('PROJECT SUMMARY'));
  rows.push([
    esc('Project'),
    esc('Status'),
    esc('Progress %'),
    esc('Total Updates'),
    esc('Latest Update Date'),
  ].join(','));

  projects.forEach(p => {
    const updates = p.progressUpdates || [];
    const latest = updates
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    rows.push([
      esc(p.name),
      esc(p.status),
      esc(p.progress + '%'),
      esc(updates.length),
      esc(latest ? fmt(latest.createdAt) : 'N/A'),
    ].join(','));
  });

  // ── Download ─────────────────────────────────────────────────────────────────
  const csv = rows.join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${employeeName.replace(/\s+/g, '_')}_${monthLabel}_${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}