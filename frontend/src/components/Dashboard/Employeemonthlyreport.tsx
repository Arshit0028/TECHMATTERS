import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { getProjects, getUsers } from '../../api/client';
import type { Project, User } from '../types/index';
import {
  CheckSquare, Square, Send, FileText, Receipt,
  AlertCircle, CheckCircle2, Clock, X, ArrowRight, Loader2,
  TrendingUp, Activity as ActivityIcon, ChevronDown, Calendar,
  Plus, Trash2, Save, RefreshCw, ListChecks,
} from 'lucide-react';

// ─── Shared sync channel — matches AdminReportReview ─────────────────────────
const SYNC_CHANNEL = 'monthly-report-sync';

// ─── Broadcast helper ─────────────────────────────────────────────────────────
const broadcast = (payload: Record<string, unknown>) => {
  try {
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.postMessage(payload);
    ch.close();
  } catch { /* unsupported */ }
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TaskEntry {
  _id: string; title: string; isDone: boolean; doneNote: string; undoneNote: string;
  assignedBy?: { _id: string; name: string };
  assignee?: { _id: string; name: string };
  project?: { _id: string; name: string };
  dueDate?: string; startDate?: string; endDate?: string;
  priority?: string; status?: string;
}

interface NextMonthPlanItem {
  _id?: string; title: string; priority: 'Low' | 'Medium' | 'High';
  notes: string; activityType: string;
  project?: string; projectName?: string;
  assignee?: string; assigneeName?: string;
  startDate?: string; endDate?: string;
}

interface Reimbursement {
  _id: string; title: string; amount: number; status: string; expenseDate?: string;
}

interface ActivityItem {
  _id: string; name: string; description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  activityType: string; priority: string;
  startDate?: string; endDate?: string;
  task?: { _id: string; title: string };
  project?: { _id: string; name: string };
}

interface MonthlyReport {
  _id: string; month: number; year: number;
  status: 'draft' | 'submitted' | 'manager_reviewed' | 'approved' | 'rejected';
  tasks: TaskEntry[]; nextMonthPlan: NextMonthPlanItem[];
  nextMonthFreeText: string; reimbursements: Reimbursement[];
  activities?: ActivityItem[]; submittedAt?: string;
  managerRemarks?: string; adminRemarks?: string;
  adminScore?: number; rejectionNote?: string;
  reportingManager?: { _id: string; name: string };
}

// ─── NEW: Assigned task from peer-assignment system ───────────────────────────
interface AssignedTaskItem {
  _id: string; title: string; description?: string;
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  project?: { _id: string; name: string } | null;
  dueDate?: string | null;
  assigner?: { _id: string; name: string; email: string } | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalNote?: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
] as const;

const PRIORITY_COLOR: Record<string, string> = {
  Low: '#60a5fa', Medium: '#fbbf24', High: '#f87171',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:            { label: 'Draft',        color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.2)'  },
  submitted:        { label: 'Submitted',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)'  },
  manager_reviewed: { label: 'Under Review', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.25)'  },
  approved:         { label: 'Approved',     color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.25)'  },
  rejected:         { label: 'Returned',     color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.25)' },
};

// ─── Timezone-safe date formatter ─────────────────────────────────────────────
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

const prevMonth   = (m: number, y: number) => m === 1  ? { m: 12, y: y - 1 } : { m: m - 1, y };
const nextMonthOf = (m: number, y: number) => m === 12 ? { m: 1,  y: y + 1 } : { m: m + 1, y };

// ─── isTaskRelevantToMonth (unchanged) ───────────────────────────────────────
const isTaskRelevantToMonth = (task: TaskEntry, m: number, y: number): boolean => {
  const startOfMonth = new Date(y, m - 1, 1).getTime();
  const endOfMonth   = new Date(y, m, 0, 23, 59, 59, 999).getTime();
  const parseTs = (d?: string | null): number | null => {
    if (!d) return null;
    const part = d.includes('T') ? d.split('T')[0] : d;
    const [py, pm, pd] = part.split('-').map(Number);
    if (isNaN(py) || isNaN(pm) || isNaN(pd)) return null;
    return new Date(py, pm - 1, pd).getTime();
  };
  const start = parseTs(task.startDate);
  const end   = parseTs(task.endDate);
  const due   = parseTs(task.dueDate);
  if (start === null && end === null && due === null) return true;
  if (start !== null && start >= startOfMonth && start <= endOfMonth) return true;
  if (end   !== null && end   >= startOfMonth && end   <= endOfMonth) return true;
  if (due   !== null && due   >= startOfMonth && due   <= endOfMonth) return true;
  if (start !== null && end !== null && start <= endOfMonth && end >= startOfMonth) return true;
  return false;
};

// ─── mergeTasksWithReport (unchanged) ────────────────────────────────────────
const mergeTasksWithReport = (
  allTasks: TaskEntry[],
  reportTasks: TaskEntry[],
): TaskEntry[] => {
  const liveMap = new Map(allTasks.map(t => [t._id, t]));
  return reportTasks
    .filter(rt => liveMap.has(rt._id))
    .map(rt => {
      const live = liveMap.get(rt._id)!;
      return { ...live, ...rt };
    });
};

// ─── Section wrapper (unchanged logic, themed via CSS vars) ───────────────────
const Section: React.FC<{
  icon: React.ReactNode; title: string; badge?: string;
  accent?: string; defaultOpen?: boolean; children: React.ReactNode;
}> = ({ icon, title, badge, accent = '#a78bfa', defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="emr-sec-card">
      <div
        className="emr-sec-header"
        onClick={() => setOpen(v => !v)}
        role="button" aria-expanded={open} tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
      >
        <span className="emr-sec-title" style={{ '--accent': accent } as React.CSSProperties}>
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
          {title}
          {badge !== undefined && (
            <span className="emr-sec-badge" style={{ background: accent + '18', color: accent }}>{badge}</span>
          )}
        </span>
        <span style={{ color: 'var(--text-tertiary)', display: 'flex', transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} aria-hidden="true">
          <ChevronDown size={15} />
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24 }} style={{ overflow: 'hidden' }}>
            <div className="emr-sec-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const EmployeeMonthlyReport: React.FC = () => {
  const { user } = useAuth();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const [report,     setReport]     = useState<MonthlyReport | null>(null);
  const [prevReport, setPrevReport] = useState<MonthlyReport | null>(null);

  const reportRef = useRef<MonthlyReport | null>(null);
  useEffect(() => { reportRef.current = report; }, [report]);

  const [fetchedTasks,    setFetchedTasks]    = useState<TaskEntry[]>([]);
  const fetchedTasksRef = useRef<TaskEntry[]>([]);
  useEffect(() => { fetchedTasksRef.current = fetchedTasks; }, [fetchedTasks]);

  // ── NEW: assigned tasks state ────────────────────────────────────────────
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskItem[]>([]);

  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState('');

  const [planItems,    setPlanItems]    = useState<NextMonthPlanItem[]>([]);
  const [planFreeText, setPlanFreeText] = useState('');
  const [planDirty,    setPlanDirty]    = useState(false);

  const planItemsRef    = useRef<NextMonthPlanItem[]>([]);
  const planFreeTextRef = useRef('');
  const planDirtyRef    = useRef(false);

  useEffect(() => { planItemsRef.current    = planItems;    }, [planItems]);
  useEffect(() => { planFreeTextRef.current = planFreeText; }, [planFreeText]);
  useEffect(() => { planDirtyRef.current    = planDirty;    }, [planDirty]);

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [myReimbs,   setMyReimbs]   = useState<Reimbursement[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);

  const [activeTab, setActiveTab] = useState<'last' | 'this' | 'next'>('this');
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());

  const pendingToggles = useRef<Map<string, boolean>>(new Map());
  const userToggles    = useRef<Map<string, boolean>>(new Map());
  const confirmedLinkedTaskIds = useRef<Set<string>>(new Set());
  const togglesInFlight = useRef(false);
  const lastKnownStatus = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }, []);

  const canEdit    = useMemo(() => !!report && ['draft', 'rejected'].includes(report.status), [report]);
  const sm         = useMemo(() => report     ? STATUS_META[report.status]    : null, [report]);
  const prevSm     = useMemo(() => prevReport ? STATUS_META[prevReport.status] : null, [prevReport]);
  const tasksDone  = useMemo(() => report?.tasks.filter(t => t.isDone).length ?? 0, [report?.tasks]);
  const tasksTotal = useMemo(() => report?.tasks.length ?? 0, [report?.tasks]);
  const taskPct    = useMemo(() => tasksTotal ? Math.round(tasksDone / tasksTotal * 100) : 0, [tasksDone, tasksTotal]);
  const reimbTotal = useMemo(() =>
    (report?.reimbursements as Reimbursement[] || []).reduce((s, r) => s + (r.amount || 0), 0),
    [report?.reimbursements],
  );
  const actDone = useMemo(() => activities.filter(a => a.status === 'Completed').length, [activities]);
  const YEARS   = useMemo(() => [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1], []);

  const syncPlanFromReport = useCallback((r: MonthlyReport) => {
    const items = r.nextMonthPlan ?? [];
    const free  = r.nextMonthFreeText ?? '';
    setPlanItems(items);
    setPlanFreeText(free);
    setPlanDirty(false);
    planItemsRef.current    = items;
    planFreeTextRef.current = free;
    planDirtyRef.current    = false;
  }, []);

  const applyFetchedTasks = useCallback((r: MonthlyReport, tasks: TaskEntry[]): MonthlyReport => {
    const relevant = tasks.filter(t => isTaskRelevantToMonth(t, month, year));
    return { ...r, tasks: mergeTasksWithReport(relevant, r.tasks || []) };
  }, [month, year]);

  const applyUserToggles = useCallback((r: MonthlyReport): MonthlyReport => {
    if (userToggles.current.size === 0) return r;
    return {
      ...r,
      tasks: r.tasks.map(t => {
        const override = userToggles.current.get(t._id);
        return override !== undefined ? { ...t, isDone: override } : t;
      }),
    };
  }, []);

  const createReportInternal = useCallback(async (m: number, y: number): Promise<MonthlyReport | null> => {
    try {
      const res = await api.post('/monthly-reports', { month: m, year: y });
      return res.data as MonthlyReport;
    } catch (e: any) {
      if (e?.response?.status === 409 || (e?.response?.data?.msg || '').toLowerCase().includes('exist')) {
        return null;
      }
      throw e;
    }
  }, []);

  useEffect(() => {
    confirmedLinkedTaskIds.current.clear();
    userToggles.current.clear();
    pendingToggles.current.clear();
    togglesInFlight.current = false;
    lastKnownStatus.current = null;
  }, [month, year]);

  // ─── Core fetch — adds assigned-tasks to the parallel batch ──────────────
  const fetchAll = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const prev = prevMonth(month, year);

      // ── Phase 1: everything in one parallel batch (unchanged + atRes added) ─
      const [thisRes, prevRes, actRes, reimbRes, projRes, usersRes, tasksRes, atRes] =
        await Promise.allSettled([
          api.get(`/monthly-reports/mine?month=${month}&year=${year}`),
          api.get(`/monthly-reports/mine?month=${prev.m}&year=${prev.y}`),
          api.get(`/activities?assignee=${user?._id}`),
          api.get(`/reimbursements?month=${month}&year=${year}&limit=100`),
          getProjects(),
          getUsers(),
          api.get(`/tasks?month=${month}&year=${year}`),
          api.get('/assigned-tasks/mine'),   // ← NEW (parallel, non-blocking)
        ]);

      // ── Resolve tasks ─────────────────────────────────────────────────────
      const allTasks: TaskEntry[] = (() => {
        if (tasksRes.status !== 'fulfilled') return [];
        const d = tasksRes.value.data;
        return Array.isArray(d) ? d
          : Array.isArray(d?.data)  ? d.data
          : Array.isArray(d?.tasks) ? d.tasks
          : [];
      })();
      setFetchedTasks(allTasks);
      fetchedTasksRef.current = allTasks;

      // ── Resolve assigned tasks (NEW) ──────────────────────────────────────
      if (atRes.status === 'fulfilled') {
        const d = atRes.value.data;
        setAssignedTasks(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
      }

      if (projRes.status === 'fulfilled') {
        const d = projRes.value as any;
        setProjects(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.data?.projects) ? d.data.projects : []);
      }
      if (usersRes.status === 'fulfilled') {
        const d = usersRes.value as any;
        setUsers(Array.isArray(d) ? d : Array.isArray(d?.data?.users) ? d.data.users : Array.isArray(d?.data) ? d.data : []);
      }

      if (thisRes.status === 'fulfilled') {
        const r: MonthlyReport = thisRes.value.data;

        if (lastKnownStatus.current && lastKnownStatus.current !== r.status) {
          const statusMessages: Record<string, string> = {
            approved:         '🎉 Your report has been approved!',
            rejected:         '↩️ Your report was returned for revision.',
            manager_reviewed: '👀 Manager has reviewed your report.',
          };
          const msg = statusMessages[r.status];
          if (msg) showToast(msg);
        }
        lastKnownStatus.current = r.status;

        let mergedReport = applyUserToggles(applyFetchedTasks(r, allTasks));

        if (pendingToggles.current.size > 0) {
          mergedReport = {
            ...mergedReport,
            tasks: mergedReport.tasks.map(t => {
              const pending = pendingToggles.current.get(t._id);
              return pending !== undefined ? { ...t, isDone: pending } : t;
            }),
          };
        }

        setReport(mergedReport);
        reportRef.current = mergedReport;
        setLoading(false);
        setRefreshing(false);

        const liveReportIds = new Set(mergedReport.tasks.map(t => t._id));
        userToggles.current.forEach((_v, id) => {
          if (!liveReportIds.has(id)) userToggles.current.delete(id);
        });
        confirmedLinkedTaskIds.current.forEach(id => {
          if (!liveReportIds.has(id)) confirmedLinkedTaskIds.current.delete(id);
        });

        if (!silent || !planDirtyRef.current) {
          syncPlanFromReport(mergedReport);
        }

        if (reimbRes.status === 'fulfilled') {
          const allReimbs: Reimbursement[] = reimbRes.value.data?.data ?? [];
          const linkedIds = (r.reimbursements || []).map((rb: any) =>
            typeof rb === 'string' ? rb : rb._id,
          );
          setMyReimbs(allReimbs.filter(rb => !linkedIds.includes(rb._id)));
        }

        const liveTaskIds  = new Set(allTasks.map(t => t._id));
        const needsLinking = allTasks.length > 0 && r._id && !togglesInFlight.current
          && allTasks.some(t => !confirmedLinkedTaskIds.current.has(t._id));

        if (needsLinking) {
          void (async () => {
            try {
              const existingIds = (r.tasks || []).map(t => t._id).filter(id => liveTaskIds.has(id));
              const allIds = Array.from(new Set([...existingIds, ...allTasks.map(t => t._id)]));
              await api.patch(`/monthly-reports/${r._id}/link-tasks`, { taskIds: allIds });
              allTasks.forEach(t => confirmedLinkedTaskIds.current.add(t._id));
            } catch { /* background sync failed */ }
          })();
        } else {
          allTasks.forEach(t => confirmedLinkedTaskIds.current.add(t._id));
        }

      } else {
        const reason = thisRes.reason;
        if (reason?.response?.status === 404) {
          const nowDate = new Date();
          const isCurrentMonth = month === nowDate.getMonth() + 1 && year === nowDate.getFullYear();
          if (isCurrentMonth && !silent) {
            try {
              const created = await createReportInternal(month, year);
              if (created) {
                const withTasks = applyUserToggles(applyFetchedTasks(created, allTasks));
                setReport(withTasks);
                reportRef.current = withTasks;
                lastKnownStatus.current = withTasks.status;
                syncPlanFromReport(withTasks);
                showToast('📋 Report created for this month');
                broadcast({ type: 'employee-updated', userId: user?._id, month, year });
              } else {
                await fetchAll(false);
                return;
              }
            } catch {
              setReport(null);
              reportRef.current = null;
              lastKnownStatus.current = null;
            }
          } else {
            setReport(null);
            reportRef.current = null;
            lastKnownStatus.current = null;
            setFetchedTasks([]);
            fetchedTasksRef.current = [];
            syncPlanFromReport({ nextMonthPlan: [], nextMonthFreeText: '' } as any);
            if (reimbRes.status === 'fulfilled') {
              setMyReimbs(reimbRes.value.data?.data ?? []);
            }
          }
        } else {
          setError('Could not load report for this month.');
        }
      }

      setPrevReport(prevRes.status === 'fulfilled' ? prevRes.value.data : null);

      if (actRes.status === 'fulfilled') {
        const all: ActivityItem[] = Array.isArray(actRes.value.data) ? actRes.value.data : [];
        setActivities(all.filter(a => {
          const ref = a.startDate || a.endDate;
          if (!ref) return true;
          const datePart = ref.includes('T') ? ref.split('T')[0] : ref;
          const [y2, m2] = datePart.split('-').map(Number);
          return y2 === year && m2 === month;
        }));
      }
    } catch (e: any) {
      setError(e?.response?.data?.msg || 'Failed to load report data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year, user?._id, applyFetchedTasks, applyUserToggles, syncPlanFromReport, showToast, createReportInternal]);

  useEffect(() => {
    if (user?._id) fetchAll(false);
  }, [fetchAll, user?._id]);

  useEffect(() => {
    const onFocus = () => {
      if (user?._id && document.visibilityState === 'visible') fetchAll(true);
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAll, user?._id]);

  useEffect(() => {
    if (!report) return;
    const needsFast = ['submitted', 'manager_reviewed'].includes(report.status);
    const interval  = needsFast ? 20_000 : 60_000;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAll(true);
    }, interval);
    return () => clearInterval(id);
  }, [report?.status, fetchAll]);

  useEffect(() => {
    let ch: BroadcastChannel;
    try {
      ch = new BroadcastChannel(SYNC_CHANNEL);
      ch.onmessage = (e) => {
        if (e.data?.type === 'admin-updated' && e.data?.month === month && e.data?.year === year) {
          fetchAll(true);
        }
      };
    } catch { /* unsupported */ }
    return () => { try { ch?.close(); } catch {} };
  }, [fetchAll, month, year]);

  // ─── All handlers unchanged ───────────────────────────────────────────────

  const ensureTaskInReport = useCallback(async (task: TaskEntry): Promise<MonthlyReport> => {
    const currentReport = reportRef.current;
    if (!currentReport) throw new Error('No report loaded');
    if (confirmedLinkedTaskIds.current.has(task._id)) return currentReport;
    const existingIds = (currentReport.tasks || []).map(t => t._id);
    const allIds = existingIds.includes(task._id) ? existingIds : [...existingIds, task._id];
    const res = await api.patch(`/monthly-reports/${currentReport._id}/link-tasks`, { taskIds: allIds });
    const updatedReport: MonthlyReport = applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
    (updatedReport.tasks || []).forEach(t => confirmedLinkedTaskIds.current.add(t._id));
    setReport(updatedReport);
    reportRef.current = updatedReport;
    return updatedReport;
  }, [applyFetchedTasks, applyUserToggles]);

  const toggleTask = useCallback(async (task: TaskEntry) => {
    if (!reportRef.current || !canEdit) return;
    if (savingTaskIds.has(task._id)) return;
    const newIsDone = !task.isDone;
    userToggles.current.set(task._id, newIsDone);
    pendingToggles.current.set(task._id, newIsDone);
    togglesInFlight.current = true;
    setReport(prev => {
      if (!prev) return prev;
      const updated = { ...prev, tasks: prev.tasks.map(t => t._id === task._id ? { ...t, isDone: newIsDone } : t) };
      reportRef.current = updated;
      return updated;
    });
    setSavingTaskIds(prev => new Set(prev).add(task._id));
    try {
      const linkedReport = await ensureTaskInReport(task);
      const res = await api.patch(
        `/monthly-reports/${linkedReport._id}/tasks/${task._id}`,
        { isDone: newIsDone, title: task.title },
      );
      setReport(prev => {
        if (!prev) return applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
        const serverTaskMap = new Map((res.data.tasks || []).map((t: TaskEntry) => [t._id, t]));
        const mergedTasks = prev.tasks.map(t => {
          const srv = serverTaskMap.get(t._id) as TaskEntry | undefined;
          if (!srv) return t;
          const override = userToggles.current.get(t._id);
          return { ...srv, isDone: override !== undefined ? override : srv.isDone };
        });
        const updated = { ...res.data, tasks: mergedTasks };
        reportRef.current = updated;
        return updated;
      });
      userToggles.current.delete(task._id);
      showToast(newIsDone ? '✅ Task marked done' : '↩️ Task marked incomplete');
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
    } catch (e: any) {
      userToggles.current.delete(task._id);
      pendingToggles.current.delete(task._id);
      setReport(prev => {
        const reverted = prev ? { ...prev, tasks: prev.tasks.map(t => t._id === task._id ? { ...t, isDone: task.isDone } : t) } : prev;
        reportRef.current = reverted ?? null;
        return reverted;
      });
      showToast('❌ ' + (e?.response?.data?.msg || 'Failed to update task'));
    } finally {
      setSavingTaskIds(prev => { const next = new Set(prev); next.delete(task._id); return next; });
      pendingToggles.current.delete(task._id);
      if (pendingToggles.current.size === 0) togglesInFlight.current = false;
    }
  }, [canEdit, savingTaskIds, ensureTaskInReport, applyFetchedTasks, applyUserToggles, showToast, month, year, user?._id]);

  const saveTaskNote = useCallback(async (task: TaskEntry, field: 'doneNote' | 'undoneNote', value: string) => {
    if (!reportRef.current || !canEdit) return;
    setReport(prev => prev ? { ...prev, tasks: prev.tasks.map(t => t._id === task._id ? { ...t, [field]: value } : t) } : prev);
    try {
      const linkedReport = await ensureTaskInReport(task);
      const res = await api.patch(
        `/monthly-reports/${linkedReport._id}/tasks/${task._id}`,
        { [field]: value, title: task.title },
      );
      setReport(prev => {
        if (!prev) return applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
        const serverTaskMap = new Map((res.data.tasks || []).map((t: TaskEntry) => [t._id, t]));
        const mergedTasks = prev.tasks.map(t => {
          const srv = serverTaskMap.get(t._id) as TaskEntry | undefined;
          if (!srv) return t;
          const override = userToggles.current.get(t._id);
          return { ...srv, isDone: override !== undefined ? override : srv.isDone };
        });
        const updated = { ...res.data, tasks: mergedTasks };
        reportRef.current = updated;
        return updated;
      });
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
    } catch { /* optimistic */ }
  }, [canEdit, ensureTaskInReport, applyFetchedTasks, applyUserToggles, month, year, user?._id]);

  const addPlanItem = () => {
    setPlanItems(prev => [...prev, { title: '', priority: 'Medium', notes: '', activityType: '', project: '', projectName: '', assignee: '', assigneeName: '', startDate: '', endDate: '' }]);
    setPlanDirty(true);
  };

  const updatePlanItem = (idx: number, patch: Partial<NextMonthPlanItem>) => {
    setPlanItems(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, ...patch };
      if (patch.project !== undefined) {
        const proj = projects.find(pr => pr._id === patch.project);
        updated.projectName = proj?.name || '';
      }
      if (patch.assignee !== undefined) {
        const u = users.find(u => u._id === patch.assignee);
        updated.assigneeName = u?.name || '';
      }
      return updated;
    }));
    setPlanDirty(true);
  };

  const removePlanItem = (idx: number) => {
    setPlanItems(prev => prev.filter((_, i) => i !== idx));
    setPlanDirty(true);
  };

  const savePlan = useCallback(async () => {
    if (!reportRef.current || !planDirtyRef.current) return;
    const itemsToSave    = planItemsRef.current;
    const freeTextToSave = planFreeTextRef.current;
    setSaving(true);
    try {
      const res = await api.patch(`/monthly-reports/${reportRef.current._id}/next-month-plan`, {
        nextMonthPlan: itemsToSave, nextMonthFreeText: freeTextToSave,
      });
      const serverData = res.data as MonthlyReport;
      const safePlanItems = Array.isArray(serverData.nextMonthPlan) && serverData.nextMonthPlan.length > 0 ? serverData.nextMonthPlan : itemsToSave;
      const safeFreeText  = serverData.nextMonthFreeText ?? freeTextToSave;
      const merged: MonthlyReport = { ...serverData, nextMonthPlan: safePlanItems, nextMonthFreeText: safeFreeText };
      const updated = applyUserToggles(applyFetchedTasks(merged, fetchedTasksRef.current));
      setReport(updated);
      reportRef.current = updated;
      setPlanItems(safePlanItems);
      setPlanFreeText(safeFreeText);
      setPlanDirty(false);
      planItemsRef.current    = safePlanItems;
      planFreeTextRef.current = safeFreeText;
      planDirtyRef.current    = false;
      showToast('✅ Plan saved');
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
    } catch (e: any) {
      showToast('❌ ' + (e?.response?.data?.msg || 'Save failed'));
    } finally {
      setSaving(false);
    }
  }, [applyFetchedTasks, applyUserToggles, showToast, month, year, user?._id]);

  const linkReimb = useCallback(async (reimb: Reimbursement) => {
    if (!reportRef.current) return;
    const ids = [
      ...(reportRef.current.reimbursements || []).map((r: any) => typeof r === 'string' ? r : r._id),
      reimb._id,
    ];
    try {
      const res = await api.patch(`/monthly-reports/${reportRef.current._id}/link-reimbursements`, { reimbursementIds: ids });
      const updated = applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
      setReport(updated);
      reportRef.current = updated;
      setMyReimbs(prev => prev.filter(r => r._id !== reimb._id));
      showToast('✅ Reimbursement linked');
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
    } catch (e: any) {
      showToast('❌ ' + (e?.response?.data?.msg || 'Failed'));
    }
  }, [applyFetchedTasks, applyUserToggles, showToast, month, year, user?._id]);

  const unlinkReimb = useCallback(async (reimbId: string) => {
    if (!reportRef.current) return;
    const ids = (reportRef.current.reimbursements || [])
      .map((r: any) => typeof r === 'string' ? r : r._id)
      .filter((id: string) => id !== reimbId);
    try {
      const res = await api.patch(`/monthly-reports/${reportRef.current._id}/link-reimbursements`, { reimbursementIds: ids });
      const updated = applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
      setReport(updated);
      reportRef.current = updated;
      showToast('✅ Removed');
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
      fetchAll(true);
    } catch (e: any) {
      showToast('❌ ' + (e?.response?.data?.msg || 'Failed'));
    }
  }, [applyFetchedTasks, applyUserToggles, fetchAll, showToast, month, year, user?._id]);

  const handleSubmit = useCallback(async () => {
    if (!reportRef.current) return;
    const missing = reportRef.current.tasks.filter(t => !t.isDone && !t.undoneNote?.trim());
    if (missing.length) {
      setError(`Please explain ${missing.length} incomplete task(s) before submitting.`);
      return;
    }
    if (!window.confirm('Submit this report to your manager?')) return;
    setSubmitting(true);
    setError('');
    try {
      if (planDirtyRef.current) await savePlan();
      const res = await api.post(`/monthly-reports/${reportRef.current._id}/submit`);
      const updated = applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
      setReport(updated);
      reportRef.current = updated;
      lastKnownStatus.current = updated.status;
      showToast('✅ Report submitted!');
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
    } catch (e: any) {
      setError(e?.response?.data?.msg || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }, [savePlan, applyFetchedTasks, applyUserToggles, showToast, month, year, user?._id]);

  const createReport = useCallback(async () => {
    try {
      const res = await api.post('/monthly-reports', { month, year });
      const created = applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
      setReport(created);
      reportRef.current = created;
      lastKnownStatus.current = created.status;
      syncPlanFromReport(created);
      setError('');
      showToast('✅ Report created!');
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
    } catch (e: any) {
      const msg = (e?.response?.data?.msg || '').toLowerCase();
      if (msg.includes('already exists') || msg.includes('exist') || e?.response?.status === 409) {
        showToast('✅ Report already exists — loading it now');
        await fetchAll(false);
        return;
      }
      showToast('❌ ' + (e?.response?.data?.msg || 'Failed to create report'));
    }
  }, [month, year, applyFetchedTasks, applyUserToggles, syncPlanFromReport, showToast, fetchAll, user?._id]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ════════════════════════════════════════════════════════════════════
           PREMIUM PALETTE — scoped to this report only.
           Light is the default; dark is restored via [data-theme="dark"].
           This block only re-skins the component — no logic / structure touched.
           ════════════════════════════════════════════════════════════════════ */
        .emr-root, .emr-toast {
          --bg-app:             #f4f5f7;
          --bg-surface:         #ffffff;
          --bg-surface-2:       #f7f8fa;
          --bg-surface-3:       #ebedf1;
          --text-primary:       #14161b;
          --text-secondary:     #495063;
          --text-tertiary:      #818a99;
          --border-default:     #e4e7ec;
          --color-primary:      #4f46e5;
          --color-primary-light:#eef0fe;
          --shadow-xs: 0 1px 2px rgba(18,24,40,0.04);
          --shadow-sm: 0 2px 6px rgba(18,24,40,0.06);
          --shadow-lg: 0 16px 40px rgba(18,24,40,0.13);
          --radius-lg: 16px;
        }
        [data-theme="dark"] .emr-root, [data-theme="dark"] .emr-toast {
          --bg-app:             #0c0e13;
          --bg-surface:         #14161d;
          --bg-surface-2:       #181b23;
          --bg-surface-3:       #21252f;
          --text-primary:       #eef0f5;
          --text-secondary:     #b2bac8;
          --text-tertiary:      #7b8494;
          --border-default:     rgba(255,255,255,0.08);
          --color-primary:      #818cf8;
          --color-primary-light: rgba(129,140,248,0.14);
          --shadow-xs: 0 1px 2px rgba(0,0,0,0.30);
          --shadow-sm: 0 2px 8px rgba(0,0,0,0.35);
          --shadow-lg: 0 16px 40px rgba(0,0,0,0.50);
          --radius-lg: 16px;
        }

        /* ── Root ─────────────────────────────────────────────────────────── */
        .emr-root {
          min-height: 100vh;
          background: var(--bg-app);
          /* calm, barely-there top wash — premium, not glary */
          background-image:
            radial-gradient(ellipse 65% 48% at 50% -8%, rgba(79,70,229,0.028) 0%, transparent 62%);
          padding: 2.75rem 1.5rem 7rem;
          font-family: 'DM Sans', sans-serif;
          color: var(--text-primary);
          transition: background 0.35s ease, color 0.35s ease;
        }
        /* richer ambient glow only in dark mode */
        [data-theme="dark"] .emr-root {
          background-image:
            radial-gradient(ellipse 75% 55% at 5% -5%, rgba(99,102,241,0.12) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at 95% 100%, rgba(124,58,237,0.10) 0%, transparent 55%);
        }
        .emr-wrap { max-width: 860px; margin: 0 auto; }

        /* ── Page head ───────────────────────────────────────────────────── */
        .emr-page-head { margin-bottom: 2rem; }
        .emr-eyebrow {
          font-family: 'DM Mono', monospace; font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 10px;
        }
        .emr-title {
          font-family: 'Syne', sans-serif; font-size: 2rem;
          font-weight: 800; letter-spacing: -0.05em;
          color: var(--text-primary); line-height: 1.05;
        }
        .emr-title em {
          font-style: normal;
          background: linear-gradient(120deg, var(--color-primary) 15%, #7c74f0 85%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .emr-sub { font-size: 13px; color: var(--text-secondary); margin-top: 6px; }

        /* ── Top bar ─────────────────────────────────────────────────────── */
        .emr-topbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 1.75rem; }

        .emr-sel {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 10px; color: var(--text-primary);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 9px 32px 9px 12px; outline: none; cursor: pointer;
          appearance: none; transition: border-color 0.2s, box-shadow 0.2s;
          box-shadow: var(--shadow-xs);
          background-repeat: no-repeat; background-position: right 10px center;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(100,116,139,0.9)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        }
        .emr-sel:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.12); }
        .emr-sel option { background: var(--bg-surface); color: var(--text-primary); }

        .emr-status {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 100px;
          font-size: 11.5px; font-weight: 600;
        }
        .emr-live {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 10px; color: #16a34a;
          font-family: 'DM Mono', monospace; letter-spacing: 0.04em;
        }
        .emr-live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #22c55e; animation: emr-pulse 2s ease-in-out infinite;
        }
        @keyframes emr-pulse {
          0%,100% { opacity: 0.4; transform: scale(0.9); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
        .emr-refresh-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 13px; border-radius: 10px; font-size: 11.5px;
          font-weight: 500; cursor: pointer;
          border: 1px solid var(--border-default);
          background: var(--bg-surface);
          color: var(--text-secondary);
          box-shadow: var(--shadow-xs);
          font-family: 'DM Sans', sans-serif; transition: all 0.18s; margin-left: auto;
        }
        .emr-refresh-btn:hover { background: var(--bg-surface-3); color: var(--text-primary); }
        .emr-refresh-btn.spinning svg { animation: emr-spin 0.9s linear infinite; }

        /* ── Stats ───────────────────────────────────────────────────────── */
        .emr-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 1.75rem; }
        .emr-stat {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 14px; padding: 1rem 1.1rem;
          box-shadow: var(--shadow-xs);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .emr-stat:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
        .emr-stat-val {
          font-family: 'Syne', sans-serif; font-size: 1.7rem;
          font-weight: 800; color: var(--text-primary);
          letter-spacing: -0.04em; line-height: 1;
        }
        .emr-stat-label { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; }
        .emr-stat-bar {
          height: 3px; background: var(--bg-surface-3);
          border-radius: 2px; margin-top: 10px; overflow: hidden;
        }
        .emr-stat-fill { height: 100%; border-radius: 2px; transition: width 1s ease; }

        /* ── Month tabs ──────────────────────────────────────────────────── */
        .emr-month-tabs {
          display: flex; gap: 4px; margin-bottom: 1.5rem;
          background: var(--bg-surface-2);
          border: 1px solid var(--border-default);
          border-radius: 12px; padding: 4px;
        }
        .emr-month-tab {
          flex: 1; padding: 9px 14px; border-radius: 9px; border: none;
          background: none; font-family: 'DM Sans', sans-serif;
          font-size: 13px; font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer; transition: all 0.18s; text-align: center;
        }
        .emr-month-tab.active {
          background: var(--bg-surface);
          color: var(--color-primary);
          border: 1px solid var(--border-default);
          box-shadow: var(--shadow-xs);
        }
        .emr-month-tab:not(.active):hover {
          color: var(--text-primary); background: var(--bg-surface-3);
        }
        .emr-month-tab-sub {
          font-size: 10px; color: var(--text-tertiary);
          display: block; margin-top: 1px;
          font-family: 'DM Mono', monospace; letter-spacing: 0.04em;
        }
        .emr-month-tab.active .emr-month-tab-sub { color: var(--color-primary); opacity: 0.7; }

        /* ── Section cards ───────────────────────────────────────────────── */
        .emr-sec-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          margin-bottom: 10px;
          overflow: hidden;
          box-shadow: var(--shadow-xs); transition: box-shadow 0.2s;
        }
        .emr-sec-card:hover { box-shadow: var(--shadow-sm); }
        .emr-sec-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.2rem; cursor: pointer; user-select: none;
          transition: background 0.15s;
        }
        .emr-sec-header:hover { background: var(--bg-surface-2); }
        .emr-sec-title {
          display: flex; align-items: center; gap: 8px;
          font-family: 'DM Mono', monospace; font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-secondary);
        }
        .emr-sec-badge {
          font-size: 10px; padding: 2px 8px; border-radius: 100px;
          font-weight: 600; letter-spacing: 0;
          font-family: 'DM Sans', sans-serif;
        }
        .emr-sec-body { padding: 0 1.2rem 1.2rem; }

        /* ── Task rows ───────────────────────────────────────────────────── */
        .emr-task-row {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 11px 0;
          border-bottom: 1px solid var(--border-default);
        }
        .emr-task-row:last-child { border-bottom: none; }
        .emr-task-check {
          flex-shrink: 0; cursor: pointer;
          color: var(--text-tertiary);
          transition: color 0.15s; margin-top: 2px;
        }
        .emr-task-check.done { color: #059669; }
        .emr-task-check.saving { opacity: 0.4; cursor: wait; }
        .emr-task-check:not(.saving):hover { color: var(--text-secondary); }
        .emr-task-title {
          font-size: 13.5px; color: var(--text-primary);
          font-weight: 500; line-height: 1.4;
        }
        .emr-task-title.done {
          text-decoration: line-through; color: var(--text-tertiary);
        }
        .emr-task-meta {
          font-size: 10.5px; color: var(--text-tertiary);
          font-family: 'DM Mono', monospace; margin-top: 3px;
        }
        .emr-task-note-label {
          font-size: 10px; font-family: 'DM Mono', monospace;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--text-tertiary); margin-top: 8px; margin-bottom: 4px;
        }
        .emr-task-note-area {
          width: 100%; background: var(--bg-surface-2);
          border: 1px solid var(--border-default);
          border-radius: 9px; color: var(--text-primary);
          font-family: 'DM Sans', sans-serif; font-size: 12px;
          padding: 8px 11px; resize: none; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .emr-task-note-area:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.10); }
        .emr-task-note-area::placeholder { color: var(--text-tertiary); }
        .emr-task-note-area:disabled { opacity: 0.55; cursor: not-allowed; }

        /* ── Activity rows ───────────────────────────────────────────────── */
        .emr-act-row {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 0;
          border-bottom: 1px solid var(--border-default);
        }
        .emr-act-row:last-child { border-bottom: none; }
        .emr-act-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .emr-act-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }
        .emr-act-meta {
          font-size: 10.5px; color: var(--text-tertiary);
          font-family: 'DM Mono', monospace; margin-top: 2px;
        }
        .emr-act-badge {
          font-size: 10px; padding: 2px 8px;
          border-radius: 100px; font-weight: 600; white-space: nowrap;
        }

        /* ── Assigned tasks rows ─────────────────────────────────────────── */
        .emr-at-row {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 11px 0;
          border-bottom: 1px solid var(--border-default);
        }
        .emr-at-row:last-child { border-bottom: none; }
        .emr-at-dot {
          width: 8px; height: 8px; border-radius: 50%;
          flex-shrink: 0; margin-top: 5px;
        }
        .emr-at-title { font-size: 13.5px; color: var(--text-primary); font-weight: 500; line-height: 1.4; }
        .emr-at-meta {
          font-size: 10.5px; color: var(--text-tertiary);
          font-family: 'DM Mono', monospace; margin-top: 3px;
        }
        .emr-at-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
        .emr-at-badge {
          font-size: 10px; padding: 2px 8px;
          border-radius: 100px; font-weight: 600; white-space: nowrap;
        }

        /* ── Plan items ──────────────────────────────────────────────────── */
        .emr-plan-item {
          position: relative;
          background: var(--bg-surface-2);
          border: 1px solid var(--border-default);
          border-radius: 12px; padding: 12px 14px; margin-bottom: 8px;
        }
        .emr-plan-field-label {
          font-size: 9px; font-family: 'DM Mono', monospace;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text-tertiary); margin-bottom: 5px;
          display: flex; align-items: center; gap: 4px;
        }
        .emr-plan-field-row { display: grid; gap: 10px; }
        .emr-plan-field-row-4 { grid-template-columns: repeat(4, 1fr); }
        .emr-plan-field-row-3 { grid-template-columns: repeat(3, 1fr); }
        .emr-plan-field-row-2 { grid-template-columns: repeat(2, 1fr); }
        .emr-plan-inp {
          width: 100%; background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 9px; color: var(--text-primary);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 8px 11px; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .emr-plan-inp:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.10); }
        .emr-plan-inp::placeholder { color: var(--text-tertiary); }
        .emr-plan-inp:disabled { opacity: 0.55; cursor: not-allowed; }
        .emr-plan-sel {
          width: 100%; background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 9px; color: var(--text-primary);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 8px 11px; outline: none; cursor: pointer;
          appearance: none; transition: border-color 0.2s, box-shadow 0.2s;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(100,116,139,0.9)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
        }
        .emr-plan-sel:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.10); }
        .emr-plan-sel option { background: var(--bg-surface); color: var(--text-primary); }
        .emr-plan-sel:disabled { opacity: 0.55; cursor: not-allowed; }
        .emr-plan-notes-area {
          width: 100%; background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 9px; color: var(--text-primary);
          font-family: 'DM Sans', sans-serif; font-size: 12px;
          padding: 8px 11px; resize: none; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .emr-plan-notes-area:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.10); }
        .emr-plan-notes-area::placeholder { color: var(--text-tertiary); }
        .emr-plan-notes-area:disabled { opacity: 0.55; }
        .emr-plan-del {
          position: absolute; top: 10px; right: 11px;
          background: none; border: none; color: var(--text-tertiary);
          cursor: pointer; display: flex; transition: all 0.15s;
          padding: 3px; border-radius: 5px;
        }
        .emr-plan-del:hover { color: #dc2626; background: rgba(220,38,38,0.08); }

        /* ── Reimbursement rows ──────────────────────────────────────────── */
        .emr-reimb-row {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 0; border-bottom: 1px solid var(--border-default);
        }
        .emr-reimb-row:last-child { border-bottom: none; }
        .emr-reimb-name { flex: 1; font-size: 13px; color: var(--text-primary); }
        .emr-reimb-amt { font-size: 12px; color: var(--text-secondary); font-family: 'DM Mono', monospace; }
        .emr-reimb-btn {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 7px;
          font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid;
          font-family: 'DM Sans', sans-serif; transition: all 0.15s;
        }
        .emr-reimb-link {
          background: var(--color-primary-light);
          border-color: rgba(79,70,229,0.3);
          color: var(--color-primary);
        }
        .emr-reimb-link:hover { background: #e4e6fd; }
        .emr-reimb-unlink {
          background: rgba(220,38,38,0.07); border-color: rgba(220,38,38,0.25);
          color: #dc2626;
        }
        .emr-reimb-unlink:hover { background: rgba(220,38,38,0.14); }

        /* ── Free text ───────────────────────────────────────────────────── */
        .emr-freetext {
          width: 100%; background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 10px; color: var(--text-primary);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 10px 13px; resize: none; outline: none;
          margin-top: 10px; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .emr-freetext:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.10); }
        .emr-freetext:disabled { opacity: 0.55; cursor: not-allowed; }
        .emr-freetext::placeholder { color: var(--text-tertiary); }

        /* ── Feedback / rejection boxes ──────────────────────────────────── */
        .emr-feedback-box {
          background: var(--color-primary-light);
          border: 1px solid rgba(79,70,229,0.25);
          border-radius: 14px; padding: 1rem 1.2rem; margin-bottom: 1rem;
        }
        .emr-feedback-label {
          font-size: 9.5px; font-family: 'DM Mono', monospace;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--color-primary); margin-bottom: 8px; font-weight: 500;
        }
        .emr-rejection-box {
          background: rgba(220,38,38,0.05);
          border: 1px solid rgba(220,38,38,0.22);
          border-radius: 14px; padding: 1rem 1.2rem;
          margin-bottom: 1rem; display: flex; gap: 10px;
        }

        /* ── Buttons ─────────────────────────────────────────────────────── */
        .emr-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 20px; border-radius: 11px;
          font-size: 13px; font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer; border: none; transition: all 0.2s;
        }
        .emr-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
        .emr-btn-primary {
          background: linear-gradient(135deg, var(--color-primary), #6366f1);
          color: #fff; box-shadow: 0 4px 16px rgba(79,70,229,0.24);
        }
        .emr-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 22px rgba(79,70,229,0.34);
        }
        .emr-btn-ghost {
          background: var(--bg-surface);
          color: var(--text-secondary);
          border: 1px solid var(--border-default) !important;
          box-shadow: var(--shadow-xs);
        }
        .emr-btn-ghost:hover:not(:disabled) {
          background: var(--bg-surface-3);
          color: var(--text-primary);
        }
        .emr-btn-save {
          background: rgba(5,150,105,0.10);
          color: #047857;
          border: 1px solid rgba(5,150,105,0.28) !important;
        }
        .emr-btn-save:hover:not(:disabled) { background: rgba(5,150,105,0.18); }

        /* ── Error / empty ───────────────────────────────────────────────── */
        .emr-error-box {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(220,38,38,0.05);
          border: 1px solid rgba(220,38,38,0.18);
          border-left: 4px solid #dc2626;
          border-radius: 11px; padding: 11px 14px;
          color: #b91c1c; font-size: 13px; margin-bottom: 1rem;
        }
        .emr-empty-state {
          text-align: center; padding: 2.5rem 0;
          color: var(--text-tertiary); font-size: 13px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          background: var(--bg-surface-2);
          border: 1px dashed var(--border-default);
          border-radius: var(--radius-lg);
        }

        /* ── Prev month task row ─────────────────────────────────────────── */
        .emr-prev-task {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 0; border-bottom: 1px solid var(--border-default);
          font-size: 13px;
        }
        .emr-prev-task:last-child { border-bottom: none; }

        /* ── Action bar ──────────────────────────────────────────────────── */
        .emr-action-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 1.5rem; }

        /* ── Toast ───────────────────────────────────────────────────────── */
        .emr-toast {
          position: fixed; bottom: 2rem; right: 1.5rem;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px; padding: 12px 18px;
          font-size: 13px; color: var(--text-primary);
          box-shadow: var(--shadow-lg);
          z-index: 999; font-family: 'DM Sans', sans-serif;
        }

        /* ── Loader ──────────────────────────────────────────────────────── */
        .emr-loader { min-height: 55vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; }
        .emr-spin { width: 32px; height: 32px; border-radius: 50%; border: 2.5px solid var(--border-default); border-top-color: var(--color-primary); animation: emr-spin 0.9s linear infinite; }
        @keyframes emr-spin { to { transform: rotate(360deg); } }

        /* ── Divider ─────────────────────────────────────────────────────── */
        .emr-divider { height: 1px; background: var(--border-default); margin: 0.5rem 0 1rem; }

        /* ── Responsive ──────────────────────────────────────────────────── */
        @media (max-width: 580px) {
          .emr-root { padding: 1.5rem 1rem 6rem; }
          .emr-stats { grid-template-columns: repeat(2, 1fr); }
          .emr-title { font-size: 1.6rem; }
          .emr-plan-field-row-4 { grid-template-columns: 1fr 1fr; }
          .emr-plan-field-row-3 { grid-template-columns: 1fr 1fr; }
          .emr-plan-field-row-2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="emr-root">
        <div className="emr-wrap">

          {/* ── Page header ─────────────────────────────────────────────── */}
          <motion.div className="emr-page-head" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
            <div className="emr-eyebrow">Monthly Report · {user?.name || 'Employee'}</div>
            <h1 className="emr-title">My <em>Performance Report</em></h1>
            <p className="emr-sub">Track tasks, activities, plan next month, and submit to your manager.</p>
          </motion.div>

          {/* ── Top bar ─────────────────────────────────────────────────── */}
          <motion.div className="emr-topbar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
            <select className="emr-sel" value={month} onChange={e => setMonth(Number(e.target.value))} aria-label="Select month">
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select className="emr-sel" value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Select year">
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {sm && (
              <span className="emr-status" style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}>
                {sm.label}
              </span>
            )}
            <span className="emr-live" title="Updates automatically">
              <span className="emr-live-dot" /> Live
            </span>
            {report?.reportingManager && (
              <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'DM Mono, monospace' }}>
                Manager: {report.reportingManager.name}
              </span>
            )}
            <button
              className={`emr-refresh-btn${refreshing ? ' spinning' : ''}`}
              onClick={() => fetchAll(false)}
              disabled={loading || refreshing}
            >
              <RefreshCw size={12} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </motion.div>

          {loading ? (
            <div className="emr-loader">
              <div className="emr-spin" />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading report…</span>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>

              {/* ── Stats ─────────────────────────────────────────────── */}
              {report && (
                <div className="emr-stats">
                  {[
                    { label: 'Tasks Done',     val: `${tasksDone}/${tasksTotal}`, fill: taskPct,  color: taskPct >= 70 ? '#059669' : taskPct >= 40 ? '#d97706' : '#dc2626', showBar: true },
                    { label: 'Activities',     val: `${actDone}/${activities.length}`, fill: activities.length ? Math.round(actDone / activities.length * 100) : 0, color: '#2563eb', showBar: true },
                    { label: 'Next Plans',     val: String(planItems.length), fill: 0, color: 'var(--color-primary)', showBar: false },
                    { label: 'Reimbursements', val: `₹${reimbTotal.toLocaleString('en-IN')}`, fill: 0, color: '#ea580c', showBar: false },
                  ].map((s, i) => (
                    <motion.div key={s.label} className="emr-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 + i * 0.06 }}>
                      <div className="emr-stat-val" style={{ color: s.color }}>{s.val}</div>
                      <div className="emr-stat-label">{s.label}</div>
                      {s.showBar && (
                        <div className="emr-stat-bar">
                          <div className="emr-stat-fill" style={{ width: `${s.fill}%`, background: s.color }} />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── Error ─────────────────────────────────────────────── */}
              {error && (
                <div className="emr-error-box" role="alert">
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}
                </div>
              )}

              {/* ── Rejection note ────────────────────────────────────── */}
              {report?.status === 'rejected' && report.rejectionNote && (
                <div className="emr-rejection-box" role="alert">
                  <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#dc2626', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Returned for revision
                    </div>
                    <div style={{ fontSize: 13, color: '#b91c1c' }}>{report.rejectionNote}</div>
                  </div>
                </div>
              )}

              {/* ── Feedback box ──────────────────────────────────────── */}
              {report && ['approved', 'manager_reviewed'].includes(report.status) && (
                <div className="emr-feedback-box">
                  <div className="emr-feedback-label">
                    {report.status === 'approved' ? 'Admin Feedback' : 'Manager Remarks'}
                  </div>
                  {report.managerRemarks && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Manager: </span>
                      {report.managerRemarks}
                    </div>
                  )}
                  {report.adminRemarks && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{report.adminRemarks}</div>
                  )}
                  {report.status === 'approved' && typeof report.adminScore === 'number' && (
                    <div style={{ marginTop: 8, fontSize: '2rem', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#059669', letterSpacing: '-0.04em' }}>
                      {report.adminScore}
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 3 }}>/100</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Month tabs ────────────────────────────────────────── */}
              <div className="emr-month-tabs" role="tablist">
                {[
                  { key: 'last', label: `${MONTHS[prevMonth(month, year).m - 1]} ${prevMonth(month, year).y}`,    sub: 'Last Month Review' },
                  { key: 'this', label: `${MONTHS[month - 1]} ${year}`,                                            sub: 'This Month' },
                  { key: 'next', label: `${MONTHS[nextMonthOf(month, year).m - 1]} ${nextMonthOf(month, year).y}`, sub: 'Next Month Plan' },
                ].map(t => (
                  <button
                    key={t.key} role="tab"
                    aria-selected={activeTab === t.key}
                    className={`emr-month-tab${activeTab === t.key ? ' active' : ''}`}
                    onClick={() => setActiveTab(t.key as any)}
                  >
                    {t.label}
                    <span className="emr-month-tab-sub">{t.sub}</span>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">

                {/* ══════════════ LAST MONTH ══════════════ */}
                {activeTab === 'last' && (
                  <motion.div key="last" role="tabpanel" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.22 }}>
                    {!prevReport ? (
                      <div className="emr-empty-state" style={{ minHeight: '30vh' }}>
                        <FileText size={32} style={{ color: 'var(--text-tertiary)' }} />
                        <span>No report for {MONTHS[prevMonth(month, year).m - 1]} {prevMonth(month, year).y}</span>
                      </div>
                    ) : (
                      <>
                        {prevSm && (
                          <div style={{ marginBottom: 12 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 100, fontSize: 11.5, fontWeight: 500, background: prevSm.bg, color: prevSm.color, border: `1px solid ${prevSm.border}` }}>
                              {prevSm.label}
                              {prevReport.submittedAt && <span style={{ opacity: 0.6 }}>· submitted {fmt(prevReport.submittedAt)}</span>}
                            </span>
                          </div>
                        )}

                        {prevReport.status === 'approved' && typeof prevReport.adminScore === 'number' && (
                          <div className="emr-feedback-box" style={{ marginBottom: 10 }}>
                            <div className="emr-feedback-label">Score</div>
                            <div style={{ fontSize: '1.8rem', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#059669' }}>
                              {prevReport.adminScore}
                              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 3 }}>/100</span>
                            </div>
                            {prevReport.adminRemarks && (
                              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>{prevReport.adminRemarks}</div>
                            )}
                          </div>
                        )}

                        <Section icon={<CheckSquare size={13} />} title="Tasks Completed" badge={`${prevReport.tasks.filter(t => t.isDone).length}/${prevReport.tasks.length}`} accent="#059669">
                          {prevReport.tasks.length === 0 ? (
                            <div className="emr-empty-state"><Square size={24} style={{ color: 'var(--text-tertiary)' }} /><span>No tasks</span></div>
                          ) : prevReport.tasks.map(t => (
                            <div key={t._id} className="emr-prev-task">
                              <span style={{ color: t.isDone ? '#059669' : 'var(--text-tertiary)', flexShrink: 0 }}>
                                {t.isDone ? <CheckSquare size={15} /> : <Square size={15} />}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: t.isDone ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: t.isDone ? 'line-through' : 'none' }}>
                                  {t.title}
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                                  {t.project?.name && `${t.project.name}`}
                                  {t.startDate && ` · ${fmt(t.startDate)}`}
                                  {t.endDate   && ` → ${fmt(t.endDate)}`}
                                </div>
                                {(t.doneNote || t.undoneNote) && (
                                  <div style={{ fontSize: 11.5, color: t.isDone ? '#059669' : '#dc2626', marginTop: 3, fontStyle: 'italic' }}>
                                    {t.isDone ? t.doneNote : t.undoneNote}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </Section>

                        {(prevReport.nextMonthPlan?.length ?? 0) > 0 && (
                          <Section icon={<ArrowRight size={13} />} title="What Was Planned for This Month" badge={String(prevReport.nextMonthPlan.length)} accent="var(--color-primary)" defaultOpen={false}>
                            {prevReport.nextMonthPlan.map((item, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border-default)' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[item.priority], flexShrink: 0, display: 'inline-block' }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.title}</span>
                                  <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                                    {item.projectName}{item.assigneeName && ` · ${item.assigneeName}`}{item.activityType && ` · ${item.activityType}`}
                                    {item.startDate && ` · ${fmt(item.startDate)}`}{item.endDate && ` → ${fmt(item.endDate)}`}
                                  </div>
                                </div>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: PRIORITY_COLOR[item.priority] + '18', color: PRIORITY_COLOR[item.priority], fontWeight: 500 }}>
                                  {item.priority}
                                </span>
                              </div>
                            ))}
                          </Section>
                        )}

                        {prevReport.managerRemarks && (
                          <Section icon={<FileText size={13} />} title="Manager Remarks" accent="#d97706" defaultOpen={false}>
                            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{prevReport.managerRemarks}</div>
                          </Section>
                        )}
                      </>
                    )}
                  </motion.div>
                )}

                {/* ══════════════ THIS MONTH ══════════════ */}
                {activeTab === 'this' && (
                  <motion.div key="this" role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
                    {!report ? (
                      (() => {
                        const nowDate = new Date();
                        const isCurrentMonth = month === nowDate.getMonth() + 1 && year === nowDate.getFullYear();
                        return isCurrentMonth ? (
                          <div className="emr-empty-state" style={{ padding: '4rem 0' }}>
                            <div className="emr-spin" />
                            <span>Preparing your report…</span>
                          </div>
                        ) : (
                          <div className="emr-empty-state" style={{ padding: '4rem 0' }}>
                            <FileText size={36} style={{ color: 'var(--text-tertiary)' }} />
                            <span>No report for {MONTHS[month - 1]} {year}</span>
                            <button className="emr-btn emr-btn-primary" onClick={createReport}><Plus size={16} /> Create Report</button>
                          </div>
                        );
                      })()
                    ) : (
                      <>
                        {/* ── Project Tasks ──────────────────────────── */}
                        <Section icon={<CheckSquare size={13} />} title="This Month's Tasks" badge={`${tasksDone}/${tasksTotal} done`} accent="#059669">
                          {report.tasks.length === 0 ? (
                            <div className="emr-empty-state">
                              <Square size={28} style={{ color: 'var(--text-tertiary)' }} />
                              <span>No tasks for {MONTHS[month - 1]} {year}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tasks assigned during this month appear here automatically.</span>
                            </div>
                          ) : report.tasks.map(task => {
                            const isSaving = savingTaskIds.has(task._id);
                            return (
                              <div key={task._id} className="emr-task-row">
                                <div
                                  className={`emr-task-check${task.isDone ? ' done' : ''}${isSaving ? ' saving' : ''}`}
                                  onClick={() => !isSaving && canEdit && toggleTask(task)}
                                  role="checkbox" aria-checked={task.isDone} aria-busy={isSaving}
                                  tabIndex={0}
                                  onKeyDown={e => { if (!isSaving && canEdit && (e.key === 'Enter' || e.key === ' ')) toggleTask(task); }}
                                  style={{ cursor: !canEdit ? 'default' : isSaving ? 'wait' : 'pointer' }}
                                >
                                  {isSaving
                                    ? <Loader2 size={18} style={{ animation: 'emr-spin 0.7s linear infinite' }} />
                                    : task.isDone ? <CheckSquare size={18} /> : <Square size={18} />
                                  }
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className={`emr-task-title${task.isDone ? ' done' : ''}`}>{task.title}</div>
                                  <div className="emr-task-meta">
                                    {task.assignedBy?.name && `By ${task.assignedBy.name}`}
                                    {task.project?.name && ` · ${task.project.name}`}
                                    {task.priority && <> · <span style={{ color: PRIORITY_COLOR[task.priority] || '#94a3b8' }}>{task.priority}</span></>}
                                    {task.startDate && ` · ${fmt(task.startDate)}`}
                                    {task.endDate   && ` → ${fmt(task.endDate)}`}
                                    {task.dueDate   && ` · Due ${fmt(task.dueDate)}`}
                                  </div>
                                  {task.isDone ? (
                                    <div>
                                      <div className="emr-task-note-label">Completion note (optional)</div>
                                      <textarea
                                        className="emr-task-note-area" rows={2} disabled={!canEdit}
                                        key={`done-${task._id}-${task.isDone}`}
                                        defaultValue={task.doneNote}
                                        placeholder="What did you achieve?"
                                        onBlur={e => saveTaskNote(task, 'doneNote', e.target.value)}
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="emr-task-note-label" style={{ color: '#dc2626' }}>Explain why incomplete *</div>
                                      <textarea
                                        className="emr-task-note-area" rows={2} disabled={!canEdit}
                                        key={`undone-${task._id}-${task.isDone}`}
                                        defaultValue={task.undoneNote}
                                        placeholder="Reason / blockers…"
                                        style={{ borderColor: task.undoneNote?.trim() ? undefined : 'rgba(220,38,38,0.35)' }}
                                        onBlur={e => saveTaskNote(task, 'undoneNote', e.target.value)}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </Section>

                        {/* ── Assigned Tasks (NEW) ───────────────────── */}
                        <Section
                          icon={<ListChecks size={13} />}
                          title="Tasks Assigned to Me"
                          badge={`${assignedTasks.length} task${assignedTasks.length !== 1 ? 's' : ''}`}
                          accent="#4f46e5"
                          defaultOpen={assignedTasks.length > 0}
                        >
                          {assignedTasks.length === 0 ? (
                            <div className="emr-empty-state">
                              <ListChecks size={28} style={{ color: 'var(--text-tertiary)' }} />
                              <span>No peer-assigned tasks yet</span>
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                Tasks assigned to you by teammates appear here after manager approval.
                              </span>
                            </div>
                          ) : assignedTasks.map(at => {
                            const statusColor =
                              at.status === 'Done'        ? '#059669' :
                              at.status === 'In Progress' ? '#d97706' : 'var(--text-tertiary)';
                            const priorityColor = PRIORITY_COLOR[at.priority] || '#94a3b8';
                            return (
                              <div key={at._id} className="emr-at-row">
                                <div className="emr-at-dot" style={{ background: statusColor }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="emr-at-title">{at.title}</div>
                                  <div className="emr-at-meta">
                                    {at.assigner?.name && `Assigned by: ${at.assigner.name}`}
                                    {at.project?.name && ` · ${at.project.name}`}
                                    {at.dueDate && ` · Due ${fmt(at.dueDate)}`}
                                    {` · Created ${fmt(at.createdAt)}`}
                                  </div>
                                  <div className="emr-at-badges">
                                    <span className="emr-at-badge" style={{ background: statusColor + '18', color: statusColor }}>
                                      {at.status}
                                    </span>
                                    <span className="emr-at-badge" style={{ background: priorityColor + '18', color: priorityColor }}>
                                      {at.priority}
                                    </span>
                                    <span className="emr-at-badge" style={{ background: 'rgba(79,70,229,0.10)', color: '#4f46e5' }}>
                                      ✓ Approved
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </Section>

                        {/* ── Activities ─────────────────────────────── */}
                        <Section icon={<ActivityIcon size={13} />} title="My Activities This Month" badge={`${actDone}/${activities.length}`} accent="#2563eb">
                          {activities.length === 0 ? (
                            <div className="emr-empty-state">
                              <ActivityIcon size={26} style={{ color: 'var(--text-tertiary)' }} />
                              <span>No activities for this month</span>
                            </div>
                          ) : activities.map(a => {
                            const sc = a.status === 'Completed' ? '#059669' : a.status === 'In Progress' ? '#2563eb' : '#d97706';
                            const sb = a.status === 'Completed' ? 'rgba(5,150,105,0.12)' : a.status === 'In Progress' ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.12)';
                            return (
                              <div key={a._id} className="emr-act-row">
                                <div className="emr-act-dot" style={{ background: PRIORITY_COLOR[a.priority] || '#94a3b8' }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="emr-act-name">{a.name}</div>
                                  <div className="emr-act-meta">
                                    {a.project?.name && `${a.project.name} · `}
                                    {a.task?.title && `${a.task.title} · `}
                                    {a.activityType}
                                    {a.startDate && ` · ${fmt(a.startDate)}`}
                                    {a.endDate && ` → ${fmt(a.endDate)}`}
                                  </div>
                                </div>
                                <span className="emr-act-badge" style={{ background: sb, color: sc }}>{a.status}</span>
                              </div>
                            );
                          })}
                        </Section>

                        {/* ── Reimbursements ─────────────────────────── */}
                        <Section icon={<Receipt size={13} />} title="Reimbursements" badge={`${(report.reimbursements || []).length} linked`} accent="#ea580c" defaultOpen={false}>
                          {(report.reimbursements as Reimbursement[]).length > 0 && (
                            <>
                              <div style={{ fontSize: 9.5, fontFamily: 'DM Mono, monospace', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                Linked to this report
                              </div>
                              {(report.reimbursements as Reimbursement[]).map(r => (
                                <div key={r._id} className="emr-reimb-row">
                                  <div className="emr-reimb-name">{r.title}</div>
                                  <span className="emr-reimb-amt">₹{r.amount.toLocaleString('en-IN')}</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: r.status === 'Approved' ? 'rgba(5,150,105,0.12)' : r.status === 'Rejected' ? 'rgba(220,38,38,0.12)' : r.status === 'Paid' ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.12)', color: r.status === 'Approved' ? '#059669' : r.status === 'Rejected' ? '#dc2626' : r.status === 'Paid' ? '#2563eb' : '#d97706', marginRight: 6 }}>{r.status}</span>
                                  {canEdit && <button className="emr-reimb-btn emr-reimb-unlink" onClick={() => unlinkReimb(r._id)}><X size={10} /> Remove</button>}
                                </div>
                              ))}
                            </>
                          )}
                          {canEdit && myReimbs.length > 0 && (
                            <>
                              <div style={{ fontSize: 9.5, fontFamily: 'DM Mono, monospace', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>
                                Your reimbursements this month
                              </div>
                              {myReimbs.map(r => (
                                <div key={r._id} className="emr-reimb-row">
                                  <div className="emr-reimb-name">{r.title}</div>
                                  <span className="emr-reimb-amt">₹{r.amount.toLocaleString('en-IN')}</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'rgba(217,119,6,0.12)', color: '#d97706', marginRight: 6 }}>{r.status}</span>
                                  <button className="emr-reimb-btn emr-reimb-link" onClick={() => linkReimb(r)}><Plus size={10} /> Link</button>
                                </div>
                              ))}
                            </>
                          )}
                          {(report.reimbursements || []).length === 0 && myReimbs.length === 0 && (
                            <div className="emr-empty-state">
                              <Receipt size={24} style={{ color: 'var(--text-tertiary)' }} />
                              <span>No reimbursements for this month</span>
                            </div>
                          )}
                          {reimbTotal > 0 && (
                            <div style={{ marginTop: 10, padding: '8px 11px', background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.22)', borderRadius: 9, fontSize: 13, color: '#ea580c', fontWeight: 600 }}>
                              Total: ₹{reimbTotal.toLocaleString('en-IN')}
                            </div>
                          )}
                        </Section>

                        {/* ── Action bar ─────────────────────────────── */}
                        <div className="emr-action-bar">
                          {report.status === 'draft' && (
                            <button className="emr-btn emr-btn-primary" onClick={handleSubmit} disabled={submitting}>
                              {submitting ? <Loader2 size={14} style={{ animation: 'emr-spin 0.7s linear infinite' }} /> : <Send size={14} />}
                              {submitting ? 'Submitting…' : 'Submit to Manager'}
                            </button>
                          )}
                          {report.status === 'rejected' && (
                            <button className="emr-btn emr-btn-primary" onClick={handleSubmit} disabled={submitting}>
                              {submitting ? <Loader2 size={14} style={{ animation: 'emr-spin 0.7s linear infinite' }} /> : <Send size={14} />}
                              {submitting ? 'Resubmitting…' : 'Resubmit Report'}
                            </button>
                          )}
                          {report.status === 'submitted' && (
                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                              <Clock size={14} /> Awaiting manager review…
                            </div>
                          )}
                          {report.status === 'manager_reviewed' && (
                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                              <Clock size={14} /> Awaiting admin approval…
                            </div>
                          )}
                          {report.status === 'approved' && (
                            <div style={{ fontSize: 13, color: '#059669', display: 'flex', alignItems: 'center', gap: 7 }}>
                              <CheckCircle2 size={14} /> Approved — score: {report.adminScore}/100
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

                {/* ══════════════ NEXT MONTH ══════════════ */}
                {activeTab === 'next' && (
                  <motion.div key="next" role="tabpanel" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                    {!report ? (
                      <div className="emr-empty-state" style={{ padding: '4rem 0' }}>
                        <ArrowRight size={36} style={{ color: 'var(--text-tertiary)' }} />
                        <span>Load a report first to plan next month</span>
                      </div>
                    ) : (
                      <>
                        <Section
                          icon={<TrendingUp size={13} />}
                          title={`Planning for ${MONTHS[nextMonthOf(month, year).m - 1]} ${nextMonthOf(month, year).y}`}
                          badge={`${planItems.length} tasks`}
                          accent="var(--color-primary)"
                        >
                          {planItems.length === 0 && (
                            <div className="emr-empty-state" style={{ paddingBottom: '1rem' }}>
                              <ArrowRight size={24} style={{ color: 'var(--text-tertiary)' }} />
                              <span>Add your task goals for next month</span>
                            </div>
                          )}

                          {planItems.map((item, idx) => (
                            <motion.div key={idx} className="emr-plan-item" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                              <div style={{ marginBottom: 8 }}>
                                <div className="emr-plan-field-label"><FileText size={9} /> Task / Activity</div>
                                <input
                                  className="emr-plan-inp"
                                  placeholder="What do you plan to work on?"
                                  value={item.title} disabled={!canEdit}
                                  onChange={e => updatePlanItem(idx, { title: e.target.value })}
                                />
                              </div>

                              <div className="emr-plan-field-row emr-plan-field-row-4" style={{ marginBottom: 8 }}>
                                <div>
                                  <div className="emr-plan-field-label">Project</div>
                                  <select className="emr-plan-sel" value={item.project || ''} disabled={!canEdit} onChange={e => updatePlanItem(idx, { project: e.target.value })}>
                                    <option value="">No project</option>
                                    {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div className="emr-plan-field-label">Assignee</div>
                                  <select className="emr-plan-sel" value={item.assignee || ''} disabled={!canEdit} onChange={e => updatePlanItem(idx, { assignee: e.target.value })}>
                                    <option value="">Unassigned</option>
                                    {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div className="emr-plan-field-label">Activity Type</div>
                                  <input className="emr-plan-inp" placeholder="e.g. Meeting…" value={item.activityType || ''} disabled={!canEdit} onChange={e => updatePlanItem(idx, { activityType: e.target.value })} />
                                </div>
                                <div>
                                  <div className="emr-plan-field-label">Priority</div>
                                  <select className="emr-plan-sel" value={item.priority} disabled={!canEdit} onChange={e => updatePlanItem(idx, { priority: e.target.value as any })}>
                                    <option>Low</option><option>Medium</option><option>High</option>
                                  </select>
                                </div>
                              </div>

                              <div className="emr-plan-field-row emr-plan-field-row-2" style={{ marginBottom: 8 }}>
                                <div>
                                  <div className="emr-plan-field-label"><Calendar size={9} /> Start Date</div>
                                  <input type="date" className="emr-plan-inp" value={item.startDate || ''} disabled={!canEdit} max={item.endDate || undefined} onChange={e => updatePlanItem(idx, { startDate: e.target.value })} />
                                </div>
                                <div>
                                  <div className="emr-plan-field-label"><Calendar size={9} /> End Date</div>
                                  <input type="date" className="emr-plan-inp" value={item.endDate || ''} disabled={!canEdit} min={item.startDate || undefined} onChange={e => updatePlanItem(idx, { endDate: e.target.value })} />
                                </div>
                              </div>

                              <div>
                                <div className="emr-plan-field-label">Notes / Context</div>
                                <textarea className="emr-plan-notes-area" rows={2} placeholder="Goals, deliverables, or context…" value={item.notes} disabled={!canEdit} onChange={e => updatePlanItem(idx, { notes: e.target.value })} />
                              </div>

                              {canEdit && (
                                <button className="emr-plan-del" onClick={() => removePlanItem(idx)} title="Remove"><Trash2 size={13} /></button>
                              )}
                            </motion.div>
                          ))}

                          {canEdit && (
                            <div style={{ marginTop: planItems.length > 0 ? 4 : 0 }}>
                              <button className="emr-btn emr-btn-ghost" onClick={addPlanItem}><Plus size={13} /> Add Task / Activity</button>
                            </div>
                          )}
                        </Section>

                        <textarea
                          className="emr-freetext" rows={3}
                          placeholder="Overall goals or anything else for next month…"
                          value={planFreeText} disabled={!canEdit}
                          onChange={e => { setPlanFreeText(e.target.value); setPlanDirty(true); }}
                        />

                        {canEdit && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="emr-btn emr-btn-save" onClick={savePlan} disabled={saving || !planDirty}>
                              {saving ? <Loader2 size={13} style={{ animation: 'emr-spin 0.7s linear infinite' }} /> : <Save size={13} />}
                              {saving ? 'Saving…' : 'Save Plan'}
                            </button>
                            {planDirty && (
                              <span style={{ fontSize: 11.5, color: '#d97706', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Mono, monospace' }}>
                                ● Unsaved changes
                              </span>
                            )}
                          </div>
                        )}

                        {!canEdit && (
                          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 8 }}>
                            Plan is locked after submission.
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}

              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div className="emr-toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} role="status" aria-live="polite">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};