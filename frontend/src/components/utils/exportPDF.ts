// src/utils/exportPDF.ts
// Pure browser PDF export using jsPDF (loaded from CDN via index.html or dynamic import)
// Covers: progress updates from projects + activities

import type { Project, Activity } from '../types/index';

// ── jsPDF dynamic loader ──────────────────────────────────────────────────────
async function getJsPDF(): Promise<any> {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load jsPDF'));
    document.head.appendChild(s);
  });
  return (window as any).jspdf.jsPDF;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

// ── Main export ───────────────────────────────────────────────────────────────
export async function downloadPDF(
  employeeName: string,
  monthLabel: string,
  year: number,
  projects: Project[],
  activities: Activity[],
) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const margin = 16;
  const contentW = W - margin * 2;
  let y = 0;

  // ── Colour palette ──────────────────────────────────────────────────────────
  const C = {
    bg:       [10,  10,  18]  as [number,number,number],
    card:     [20,  20,  36]  as [number,number,number],
    accent:   [124, 58,  237] as [number,number,number],
    green:    [52,  211, 153] as [number,number,number],
    amber:    [251, 191, 36]  as [number,number,number],
    blue:     [96,  165, 250] as [number,number,number],
    text:     [255, 255, 255] as [number,number,number],
    muted:    [148, 163, 184] as [number,number,number],
    border:   [40,  40,  65]  as [number,number,number],
  };

  // ── Page background ─────────────────────────────────────────────────────────
  const drawPageBg = () => {
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, W, 297, 'F');
    // subtle gradient band top
    doc.setFillColor(40, 20, 80);
    doc.rect(0, 0, W, 38, 'F');
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  const drawHeader = () => {
    drawPageBg();
    y = 12;
    // logo mark
    doc.setFillColor(...C.accent);
    doc.roundedRect(margin, y - 3, 8, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text('R', margin + 2.8, y + 2.6);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text('Project Activity Report', margin + 12, y + 3);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(`${monthLabel} ${year}  ·  ${employeeName}`, margin + 12, y + 9);

    // right: generated date
    const genDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.setFontSize(7);
    doc.text(`Generated ${genDate}`, W - margin, y + 3, { align: 'right' });

    y = 42;
  };

  // ── Summary cards row ───────────────────────────────────────────────────────
  const drawSummary = (totalUpdates: number, totalActivities: number, activeProjects: number) => {
    const cardW = (contentW - 8) / 3;
    const cards = [
      { label: 'Projects',         value: String(activeProjects), color: C.accent },
      { label: 'Progress Updates', value: String(totalUpdates),   color: C.green  },
      { label: 'Activities',       value: String(totalActivities),color: C.blue   },
    ];
    cards.forEach((c, i) => {
      const x = margin + i * (cardW + 4);
      doc.setFillColor(...C.card);
      doc.roundedRect(x, y, cardW, 18, 3, 3, 'F');
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, 18, 3, 3, 'S');
      // accent left bar
      doc.setFillColor(...c.color);
      doc.roundedRect(x, y, 2, 18, 1, 1, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...c.color);
      doc.text(c.value, x + 7, y + 11);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.muted);
      doc.text(c.label, x + 7, y + 16);
    });
    y += 24;
  };

  // ── Section heading ─────────────────────────────────────────────────────────
  const sectionHeading = (title: string, color: [number,number,number] = C.accent) => {
    checkPageBreak(12);
    doc.setFillColor(...color, 0.15 as any);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.setGlobalAlpha?.(0.12);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setGlobalAlpha?.(1);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin, y + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(title.toUpperCase(), margin + 4, y + 5.2);
    y += 11;
  };

  // ── Page-break guard ────────────────────────────────────────────────────────
  const checkPageBreak = (needed = 20) => {
    if (y + needed > 282) {
      doc.addPage();
      drawPageBg();
      y = 14;
    }
  };

  // ── Progress update row ─────────────────────────────────────────────────────
  const drawProgressRow = (
    projectName: string,
    note: string,
    percentage: number,
    addedBy: string,
    date: string,
  ) => {
    const rowH = 22;
    checkPageBreak(rowH + 2);

    doc.setFillColor(...C.card);
    doc.roundedRect(margin, y, contentW, rowH, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, contentW, rowH, 2, 2, 'S');

    // percentage pill
    const pctColor = percentage >= 80 ? C.green : percentage >= 50 ? C.amber : C.blue;
    doc.setFillColor(...pctColor);
    doc.roundedRect(W - margin - 18, y + 4, 16, 8, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 10, 18);
    doc.text(`${percentage}%`, W - margin - 10, y + 9.2, { align: 'center' });

    // project name
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(projectName, margin + 4, y + 7);

    // note — truncated
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    const maxNoteW = contentW - 28;
    const noteText = doc.splitTextToSize(note, maxNoteW)[0] + (note.length > 60 ? '…' : '');
    doc.text(noteText, margin + 4, y + 13);

    // meta: who + when
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 140);
    doc.text(`${addedBy}  ·  ${fmt(date)}  (${timeAgo(date)})`, margin + 4, y + 19);

    y += rowH + 2;
  };

  // ── Activity row ────────────────────────────────────────────────────────────
  const drawActivityRow = (
    name: string,
    taskTitle: string,
    type: string,
    status: string,
    priority: string,
    startDate?: string,
    endDate?: string,
  ) => {
    const rowH = 22;
    checkPageBreak(rowH + 2);

    doc.setFillColor(...C.card);
    doc.roundedRect(margin, y, contentW, rowH, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, contentW, rowH, 2, 2, 'S');

    // status pill
    const statusColor: [number,number,number] =
      status === 'Completed' ? C.green :
      status === 'In Progress' ? C.blue : C.amber;
    doc.setFillColor(...statusColor);
    doc.roundedRect(W - margin - 24, y + 4, 22, 7, 2, 2, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 10, 18);
    doc.text(status, W - margin - 13, y + 8.8, { align: 'center' });

    // activity name
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(name, margin + 4, y + 7);

    // task + type
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(`Task: ${taskTitle}  ·  ${type}  ·  Priority: ${priority}`, margin + 4, y + 13);

    // dates
    const dateStr = startDate
      ? `${fmt(startDate)}${endDate ? ` → ${fmt(endDate)}` : ''}`
      : 'No dates set';
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 140);
    doc.text(dateStr, margin + 4, y + 19);

    y += rowH + 2;
  };

  // ── Footer ──────────────────────────────────────────────────────────────────
  const drawFooter = (pageNum: number) => {
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 90);
    doc.text(`Page ${pageNum}`, W / 2, 291, { align: 'center' });
    doc.text('Confidential — Internal use only', margin, 291);
    doc.text(new Date().toISOString().split('T')[0], W - margin, 291, { align: 'right' });
  };

  // ════════════════════════════════════════════════════════════════════════════
  // BUILD DOCUMENT
  // ════════════════════════════════════════════════════════════════════════════

  // Collect all progress updates across all projects
  const allUpdates: {
    projectName: string;
    note: string;
    percentage: number;
    addedBy: string;
    date: string;
  }[] = [];

  projects.forEach(p => {
    (p.progressUpdates || []).forEach(u => {
      allUpdates.push({
        projectName: p.name,
        note: u.note,
        percentage: u.percentage,
        addedBy: u.addedBy?.name || 'Unknown',
        date: u.createdAt,
      });
    });
  });

  // Sort updates newest first
  allUpdates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Page 1
  drawHeader();
  drawSummary(allUpdates.length, activities.length, projects.length);

  let pageNum = 1;

  // ── Progress Updates section ────────────────────────────────────────────────
  if (allUpdates.length > 0) {
    sectionHeading(`Progress Updates  (${allUpdates.length})`, C.accent);
    allUpdates.forEach(u => {
      drawProgressRow(u.projectName, u.note, u.percentage, u.addedBy, u.date);
    });
    y += 4;
  } else {
    sectionHeading('Progress Updates', C.accent);
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text('No progress updates recorded for this period.', margin + 4, y);
    y += 10;
  }

  // ── Activities section ──────────────────────────────────────────────────────
  if (activities.length > 0) {
    sectionHeading(`Activities  (${activities.length})`, C.blue);
    activities.forEach(a => {
      const taskTitle = typeof a.task === 'object' ? a.task.title : 'Unknown Task';
      drawActivityRow(
        a.name,
        taskTitle,
        a.activityType,
        a.status,
        a.priority,
        a.startDate,
        a.endDate,
      );
    });
  } else {
    sectionHeading('Activities', C.blue);
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text('No activities recorded for this period.', margin + 4, y);
    y += 10;
  }

  // Draw footers on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i);
  }

  doc.save(`report_${employeeName.replace(/\s+/g, '_')}_${monthLabel}_${year}.pdf`);
}