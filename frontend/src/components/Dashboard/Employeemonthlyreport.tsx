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
  Plus, Trash2, Save, RefreshCw,
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
  _id: string;
  title: string;
  isDone: boolean;
  doneNote: string;
  undoneNote: string;
  assignedBy?: { _id: string; name: string };
  assignee?: { _id: string; name: string };
  project?: { _id: string; name: string };
  dueDate?: string;
  startDate?: string;
  endDate?: string;
  priority?: string;
  status?: string;
}

interface NextMonthPlanItem {
  _id?: string;
  title: string;
  priority: 'Low' | 'Medium' | 'High';
  notes: string;
  activityType: string;
  project?: string;
  projectName?: string;
  assignee?: string;
  assigneeName?: string;
  startDate?: string;
  endDate?: string;
}

interface Reimbursement {
  _id: string;
  title: string;
  amount: number;
  status: string;
  expenseDate?: string;
}

interface ActivityItem {
  _id: string;
  name: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  activityType: string;
  priority: string;
  startDate?: string;
  endDate?: string;
  task?: { _id: string; title: string };
  project?: { _id: string; name: string };
}

interface MonthlyReport {
  _id: string;
  month: number;
  year: number;
  status: 'draft' | 'submitted' | 'manager_reviewed' | 'approved' | 'rejected';
  tasks: TaskEntry[];
  nextMonthPlan: NextMonthPlanItem[];
  nextMonthFreeText: string;
  reimbursements: Reimbursement[];
  activities?: ActivityItem[];
  submittedAt?: string;
  managerRemarks?: string;
  adminRemarks?: string;
  adminScore?: number;
  rejectionNote?: string;
  reportingManager?: { _id: string; name: string };
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

// ─── Merge helper ─────────────────────────────────────────────────────────────
const mergeTasksWithReport = (
  allTasks: TaskEntry[],
  reportTasks: TaskEntry[],
): TaskEntry[] => {
  if (!allTasks.length) return reportTasks;
  const reportTaskMap = new Map(reportTasks.map((t) => [t._id, t]));
  return allTasks.map((t) => {
    const saved = reportTaskMap.get(t._id);
    return {
      ...t,
      isDone:     saved?.isDone     ?? false,
      doneNote:   saved?.doneNote   ?? '',
      undoneNote: saved?.undoneNote ?? '',
    };
  });
};

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section: React.FC<{
  icon: React.ReactNode; title: string; badge?: string;
  accent?: string; defaultOpen?: boolean; children: React.ReactNode;
}> = ({ icon, title, badge, accent = '#a78bfa', defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sec-card">
      <div
        className="sec-header"
        onClick={() => setOpen(v => !v)}
        role="button" aria-expanded={open} tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
      >
        <span className="sec-title" style={{ '--accent': accent } as React.CSSProperties}>
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
          {title}
          {badge !== undefined && (
            <span className="sec-badge" style={{ background: accent + '18', color: accent }}>{badge}</span>
          )}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.25)', display: 'flex', transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} aria-hidden="true">
          <ChevronDown size={15} />
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24 }} style={{ overflow: 'hidden' }}>
            <div className="sec-body">{children}</div>
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

  // ─── pendingToggles: tracks in-flight PATCH requests ─────────────────────
  const pendingToggles = useRef<Map<string, boolean>>(new Map());

  // ─── FIX: userToggles — permanent source of truth for user intent ─────────
  // Persists across ALL fetchAll calls. Set on user action, cleared only after
  // the server PATCH confirms success (or reverts on error). This prevents any
  // background fetch from overwriting what the user explicitly checked/unchecked.
  const userToggles = useRef<Map<string, boolean>>(new Map());

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
    if (!tasks.length) return r;
    return { ...r, tasks: mergeTasksWithReport(tasks, r.tasks) };
  }, []);

  // ─── FIX: applyUserToggles ────────────────────────────────────────────────
  // Always layers user-confirmed toggle states on top of any server data.
  // Must be called on every setReport that originates from a server response.
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

  // ── Core fetch ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const prev = prevMonth(month, year);

      const [thisRes, prevRes, actRes, reimbRes, projRes, usersRes] = await Promise.allSettled([
        api.get(`/monthly-reports/mine?month=${month}&year=${year}`),
        api.get(`/monthly-reports/mine?month=${prev.m}&year=${prev.y}`),
        api.get(`/activities?assignee=${user?._id}`),
        api.get(`/reimbursements?month=${month}&year=${year}&limit=100`),
        getProjects(),
        getUsers(),
      ]);

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

        let mergedReport = r;
        try {
          const tasksRes = await api.get(`/tasks?assignee=${user?._id}`);
          const allTasks: TaskEntry[] = Array.isArray(tasksRes.data)
            ? tasksRes.data
            : Array.isArray(tasksRes.data?.data)  ? tasksRes.data.data
            : Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks
            : [];

          setFetchedTasks(allTasks);
          fetchedTasksRef.current = allTasks;

          const canLink = allTasks.length > 0 && r._id && !togglesInFlight.current;

          if (canLink) {
            const newTaskIds = allTasks
              .map(t => t._id)
              .filter(id => !confirmedLinkedTaskIds.current.has(id));

            if (newTaskIds.length > 0) {
              try {
                const existingIds = (r.tasks || []).map(t => t._id);
                const allIds = Array.from(new Set(existingIds));
                await api.patch(`/monthly-reports/${r._id}/link-tasks`, { taskIds: allIds });
                allTasks.forEach(t => confirmedLinkedTaskIds.current.add(t._id));
                const refreshed = await api.get(`/monthly-reports/mine?month=${month}&year=${year}`);
                // ─── FIX: apply user toggles on top of refreshed server data ──
                mergedReport = applyUserToggles(applyFetchedTasks(refreshed.data, allTasks));
              } catch {
                // ─── FIX: apply user toggles on fallback path too ─────────────
                mergedReport = applyUserToggles(applyFetchedTasks(r, allTasks));
              }
            } else {
              // ─── FIX: apply user toggles ──────────────────────────────────
              mergedReport = applyUserToggles(applyFetchedTasks(r, allTasks));
            }
          } else {
            // ─── FIX: apply user toggles ──────────────────────────────────
            mergedReport = applyUserToggles(applyFetchedTasks(r, allTasks));
          }
        } catch {
          setFetchedTasks([]);
          fetchedTasksRef.current = [];
          // ─── FIX: still apply user toggles even if tasks fetch failed ─────
          mergedReport = applyUserToggles(r);
        }

        // Re-apply any pending toggle states on top (belt-and-suspenders)
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
      } else {
        const reason = thisRes.reason;
        if (reason?.response?.status === 404) {
          const nowDate = new Date();
          const isCurrentMonth = month === nowDate.getMonth() + 1 && year === nowDate.getFullYear();
          if (isCurrentMonth && !silent) {
            try {
              const created = await createReportInternal(month, year);
              if (created) {
                // ─── FIX: apply user toggles on newly created report ──────────
                const withTasks = applyUserToggles(applyFetchedTasks(created, fetchedTasksRef.current));
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
        if (
          e.data?.type === 'admin-updated' &&
          e.data?.month === month &&
          e.data?.year  === year
        ) {
          fetchAll(true);
        }
      };
    } catch { /* BroadcastChannel not supported */ }
    return () => { try { ch?.close(); } catch {} };
  }, [fetchAll, month, year]);

  const ensureTaskInReport = useCallback(async (task: TaskEntry): Promise<MonthlyReport> => {
    const currentReport = reportRef.current;
    if (!currentReport) throw new Error('No report loaded');
    if (confirmedLinkedTaskIds.current.has(task._id)) return currentReport;

    const existingIds = (currentReport.tasks || []).map(t => t._id);
    const allIds = existingIds.includes(task._id) ? existingIds : [...existingIds, task._id];

    const res = await api.patch(`/monthly-reports/${currentReport._id}/link-tasks`, {
      taskIds: allIds,
    });
    // ─── FIX: apply user toggles after link-tasks response ───────────────────
    const updatedReport: MonthlyReport = applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
    (updatedReport.tasks || []).forEach(t => confirmedLinkedTaskIds.current.add(t._id));
    setReport(updatedReport);
    reportRef.current = updatedReport;
    return updatedReport;
  }, [applyFetchedTasks, applyUserToggles]);

  // ─── FIX: Task toggle with userToggles as persistent source of truth ──────
  const toggleTask = useCallback(async (task: TaskEntry) => {
    if (!reportRef.current || !canEdit) return;
    if (savingTaskIds.has(task._id)) return;

    const newIsDone = !task.isDone;

    // ─── Step 1: Record user intent persistently BEFORE anything async ───────
    // This map survives all background fetchAll calls until server confirms.
    userToggles.current.set(task._id, newIsDone);
    pendingToggles.current.set(task._id, newIsDone);
    togglesInFlight.current = true;

    // ─── Step 2: Optimistic UI update ────────────────────────────────────────
    setReport(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        tasks: prev.tasks.map(t => t._id === task._id ? { ...t, isDone: newIsDone } : t),
      };
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

      // ─── Step 3: Merge server response, but userToggles always wins ──────
      setReport(prev => {
        if (!prev) return applyUserToggles(applyFetchedTasks(res.data, fetchedTasksRef.current));
        const serverTaskMap = new Map((res.data.tasks || []).map((t: TaskEntry) => [t._id, t]));
        const mergedTasks = prev.tasks.map(t => {
          const srv = serverTaskMap.get(t._id) as TaskEntry | undefined;
          if (!srv) return t;
          // userToggles takes priority over server value
          const override = userToggles.current.get(t._id);
          return { ...srv, isDone: override !== undefined ? override : srv.isDone };
        });
        const updated = { ...res.data, tasks: mergedTasks };
        reportRef.current = updated;
        return updated;
      });

      // ─── Step 4: Server confirmed — safe to remove from userToggles ──────
      userToggles.current.delete(task._id);

      showToast(newIsDone ? '✅ Task marked done' : '↩️ Task marked incomplete');
      broadcast({ type: 'employee-updated', userId: user?._id, month, year });
    } catch (e: any) {
      // ─── Step 5: On error — remove from userToggles and revert UI ─────────
      userToggles.current.delete(task._id);
      pendingToggles.current.delete(task._id);
      setReport(prev => {
        const reverted = prev ? {
          ...prev,
          tasks: prev.tasks.map(t => t._id === task._id ? { ...t, isDone: task.isDone } : t),
        } : prev;
        reportRef.current = reverted ?? null;
        return reverted;
      });
      showToast('❌ ' + (e?.response?.data?.msg || 'Failed to update task'));
    } finally {
      setSavingTaskIds(prev => {
        const next = new Set(prev);
        next.delete(task._id);
        return next;
      });
      pendingToggles.current.delete(task._id);
      if (pendingToggles.current.size === 0) {
        togglesInFlight.current = false;
      }
    }
  }, [canEdit, savingTaskIds, ensureTaskInReport, applyFetchedTasks, applyUserToggles, showToast, month, year, user?._id]);

  const saveTaskNote = useCallback(async (task: TaskEntry, field: 'doneNote' | 'undoneNote', value: string) => {
    if (!reportRef.current || !canEdit) return;
    setReport(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => t._id === task._id ? { ...t, [field]: value } : t),
    } : prev);
    try {
      const linkedReport = await ensureTaskInReport(task);
      const res = await api.patch(
        `/monthly-reports/${linkedReport._id}/tasks/${task._id}`,
        { [field]: value, title: task.title },
      );
      // ─── FIX: apply user toggles after note save response ────────────────
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
    } catch { /* optimistic state already applied */ }
  }, [canEdit, ensureTaskInReport, applyFetchedTasks, applyUserToggles, month, year, user?._id]);

  // ── Plan helpers ──────────────────────────────────────────────────────────
  const addPlanItem = () => {
    setPlanItems(prev => [...prev, {
      title: '', priority: 'Medium', notes: '', activityType: '',
      project: '', projectName: '', assignee: '', assigneeName: '',
      startDate: '', endDate: '',
    }]);
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
        nextMonthPlan:     itemsToSave,
        nextMonthFreeText: freeTextToSave,
      });

      const serverData = res.data as MonthlyReport;
      const safePlanItems = Array.isArray(serverData.nextMonthPlan) && serverData.nextMonthPlan.length > 0
        ? serverData.nextMonthPlan
        : itemsToSave;
      const safeFreeText = serverData.nextMonthFreeText ?? freeTextToSave;

      const merged: MonthlyReport = {
        ...serverData,
        nextMonthPlan:     safePlanItems,
        nextMonthFreeText: safeFreeText,
      };
      // ─── FIX: apply user toggles after plan save ──────────────────────────
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
      // ─── FIX: apply user toggles after reimbursement link ────────────────
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
      // ─── FIX: apply user toggles after reimbursement unlink ──────────────
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
      // ─── FIX: apply user toggles after submit response ───────────────────
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
      // ─── FIX: apply user toggles on create (edge case) ───────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .emr-root {
          min-height: 100vh; background: #07080f;
          background-image:
            radial-gradient(ellipse 75% 55% at 5% -5%, rgba(99,102,241,0.14) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at 95% 100%, rgba(124,58,237,0.09) 0%, transparent 55%);
          padding: 2.75rem 1.5rem 7rem;
          font-family: 'DM Sans', sans-serif; color: rgba(255,255,255,0.84);
        }
        .emr-wrap { max-width: 860px; margin: 0 auto; }

        .emr-page-head { margin-bottom: 2rem; }
        .emr-eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.22); margin-bottom: 10px; }
        .emr-title { font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 800; letter-spacing: -0.05em; color: #fff; line-height: 1.05; }
        .emr-title em { font-style: normal; background: linear-gradient(120deg,#a78bfa 20%,#818cf8 80%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .emr-sub { font-size: 13px; color: rgba(255,255,255,0.3); margin-top: 6px; }

        .emr-topbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 1.75rem; }
        .emr-sel { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.78); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 9px 32px 9px 12px; outline: none; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; transition: border-color 0.2s; }
        .emr-sel:focus { border-color: rgba(167,139,250,0.4); }
        .emr-sel option { background: #12121e; }
        .emr-status { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 100px; font-size: 11.5px; font-weight: 500; }

        .emr-live { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: rgba(52,211,153,0.55); font-family: 'DM Mono', monospace; letter-spacing: 0.04em; }
        .emr-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; animation: emr-pulse 2s ease-in-out infinite; }
        @keyframes emr-pulse { 0%,100% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.15); } }

        .emr-refresh-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border-radius: 10px; font-size: 11.5px; font-weight: 500; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.4); font-family: 'DM Sans', sans-serif; transition: all 0.18s; margin-left: auto; }
        .emr-refresh-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
        .emr-refresh-btn.spinning svg { animation: emr-spin 0.9s linear infinite; }

        .emr-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 1.75rem; }
        .emr-stat { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 1rem 1.1rem; }
        .emr-stat-val { font-family: 'Syne', sans-serif; font-size: 1.7rem; font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1; }
        .emr-stat-label { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 4px; }
        .emr-stat-bar { height: 2px; background: rgba(255,255,255,0.07); border-radius: 1px; margin-top: 10px; overflow: hidden; }
        .emr-stat-fill { height: 100%; border-radius: 1px; transition: width 1s ease; }

        .emr-month-tabs { display: flex; gap: 4px; margin-bottom: 1.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 4px; }
        .emr-month-tab { flex: 1; padding: 9px 14px; border-radius: 9px; border: none; background: none; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.35); cursor: pointer; transition: all 0.18s; text-align: center; }
        .emr-month-tab.active { background: rgba(167,139,250,0.15); color: #c4b5fd; border: 1px solid rgba(167,139,250,0.25); }
        .emr-month-tab:not(.active):hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.04); }
        .emr-month-tab-sub { font-size: 10px; color: rgba(255,255,255,0.22); display: block; margin-top: 1px; font-family: 'DM Mono', monospace; letter-spacing: 0.04em; }
        .emr-month-tab.active .emr-month-tab-sub { color: rgba(167,139,250,0.6); }

        .sec-card { background: rgba(255,255,255,0.028); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; margin-bottom: 10px; overflow: hidden; }
        .sec-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.2rem; cursor: pointer; user-select: none; transition: background 0.15s; }
        .sec-header:hover { background: rgba(255,255,255,0.02); }
        .sec-title { display: flex; align-items: center; gap: 8px; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
        .sec-badge { font-size: 10px; padding: 2px 8px; border-radius: 100px; font-weight: 500; letter-spacing: 0; font-family: 'DM Sans', sans-serif; }
        .sec-body { padding: 0 1.2rem 1.2rem; }

        .task-row { display: flex; align-items: flex-start; gap: 12px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .task-row:last-child { border-bottom: none; }
        .task-check { flex-shrink: 0; cursor: pointer; color: rgba(255,255,255,0.2); transition: color 0.15s; margin-top: 2px; }
        .task-check.done { color: #34d399; }
        .task-check.saving { opacity: 0.4; cursor: wait; }
        .task-check:not(.saving):hover { color: rgba(255,255,255,0.55); }
        .task-title { font-size: 13.5px; color: rgba(255,255,255,0.8); font-weight: 500; line-height: 1.4; }
        .task-title.done { text-decoration: line-through; color: rgba(255,255,255,0.3); }
        .task-meta { font-size: 10.5px; color: rgba(255,255,255,0.22); font-family: 'DM Mono', monospace; margin-top: 3px; }
        .task-note-label { font-size: 10px; font-family: 'DM Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.28); margin-top: 8px; margin-bottom: 4px; }
        .task-note-area { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; color: rgba(255,255,255,0.6); font-family: 'DM Sans', sans-serif; font-size: 12px; padding: 8px 11px; resize: none; outline: none; transition: border-color 0.2s; }
        .task-note-area:focus { border-color: rgba(167,139,250,0.3); }
        .task-note-area::placeholder { color: rgba(255,255,255,0.14); }
        .task-note-area:disabled { opacity: 0.4; cursor: not-allowed; }

        .act-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .act-row:last-child { border-bottom: none; }
        .act-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .act-name { font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 500; }
        .act-meta { font-size: 10.5px; color: rgba(255,255,255,0.22); font-family: 'DM Mono', monospace; margin-top: 2px; }
        .act-badge { font-size: 10px; padding: 2px 8px; border-radius: 100px; font-weight: 500; white-space: nowrap; }

        .plan-item { position: relative; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
        .plan-field-label { font-size: 9px; font-family: 'DM Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.25); margin-bottom: 5px; display: flex; align-items: center; gap: 4px; }
        .plan-field-row { display: grid; gap: 10px; }
        .plan-field-row-4 { grid-template-columns: repeat(4, 1fr); }
        .plan-field-row-3 { grid-template-columns: repeat(3, 1fr); }
        .plan-field-row-2 { grid-template-columns: repeat(2, 1fr); }
        .plan-inp { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; color: rgba(255,255,255,0.78); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 8px 11px; outline: none; transition: border-color 0.2s; }
        .plan-inp:focus { border-color: rgba(167,139,250,0.4); }
        .plan-inp::placeholder { color: rgba(255,255,255,0.16); }
        .plan-inp:disabled { opacity: 0.4; cursor: not-allowed; }
        .plan-sel { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; color: rgba(255,255,255,0.78); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 8px 11px; outline: none; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; transition: border-color 0.2s; }
        .plan-sel:focus { border-color: rgba(167,139,250,0.4); }
        .plan-sel option { background: #12121e; }
        .plan-sel:disabled { opacity: 0.4; cursor: not-allowed; }
        .plan-notes-area { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; color: rgba(255,255,255,0.6); font-family: 'DM Sans', sans-serif; font-size: 12px; padding: 8px 11px; resize: none; outline: none; transition: border-color 0.2s; }
        .plan-notes-area:focus { border-color: rgba(167,139,250,0.3); }
        .plan-notes-area::placeholder { color: rgba(255,255,255,0.14); }
        .plan-notes-area:disabled { opacity: 0.4; }
        .plan-del { position: absolute; top: 10px; right: 11px; background: none; border: none; color: rgba(255,255,255,0.16); cursor: pointer; display: flex; transition: color 0.15s; padding: 3px; border-radius: 5px; }
        .plan-del:hover { color: #f87171; background: rgba(248,113,113,0.08); }

        .reimb-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .reimb-row:last-child { border-bottom: none; }
        .reimb-name { flex: 1; font-size: 13px; color: rgba(255,255,255,0.75); }
        .reimb-amt { font-size: 12px; color: rgba(255,255,255,0.35); font-family: 'DM Mono', monospace; }
        .reimb-btn { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 7px; font-size: 11px; font-weight: 500; cursor: pointer; border: 1px solid; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .reimb-link { background: rgba(124,58,237,0.1); border-color: rgba(124,58,237,0.25); color: #a78bfa; }
        .reimb-link:hover { background: rgba(124,58,237,0.2); }
        .reimb-unlink { background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.2); color: #f87171; }
        .reimb-unlink:hover { background: rgba(248,113,113,0.15); }

        .freetext { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: rgba(255,255,255,0.72); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 10px 13px; resize: none; outline: none; margin-top: 10px; transition: border-color 0.2s; }
        .freetext:focus { border-color: rgba(167,139,250,0.32); }
        .freetext:disabled { opacity: 0.4; cursor: not-allowed; }
        .freetext::placeholder { color: rgba(255,255,255,0.14); }

        .feedback-box { background: rgba(167,139,250,0.05); border: 1px solid rgba(167,139,250,0.15); border-radius: 14px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
        .feedback-label { font-size: 9.5px; font-family: 'DM Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(167,139,250,0.55); margin-bottom: 8px; }
        .rejection-box { background: rgba(248,113,113,0.05); border: 1px solid rgba(248,113,113,0.14); border-radius: 14px; padding: 1rem 1.2rem; margin-bottom: 1rem; display: flex; gap: 10px; }

        .btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 20px; border-radius: 11px; font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; border: none; transition: all 0.2s; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
        .btn-primary { background: linear-gradient(135deg,#7c3aed,#6366f1); color: #fff; box-shadow: 0 4px 18px rgba(124,58,237,0.28); }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.42); }
        .btn-ghost { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.55); border: 1px solid rgba(255,255,255,0.1); }
        .btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); }
        .btn-save { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.22); }
        .btn-save:hover:not(:disabled) { background: rgba(52,211,153,0.18); }

        .error-box { display: flex; align-items: flex-start; gap: 8px; background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.16); border-radius: 11px; padding: 11px 14px; color: #fca5a5; font-size: 13px; margin-bottom: 1rem; }
        .empty-state { text-align: center; padding: 2.5rem 0; color: rgba(255,255,255,0.2); font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 8px; }

        .prev-task { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
        .prev-task:last-child { border-bottom: none; }

        .action-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 1.5rem; }

        .emr-toast { position: fixed; bottom: 2rem; right: 1.5rem; background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: rgba(255,255,255,0.85); box-shadow: 0 8px 32px rgba(0,0,0,0.45); z-index: 999; font-family: 'DM Sans', sans-serif; }

        .emr-loader { min-height: 55vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; }
        .emr-spin { width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgba(167,139,250,0.18); border-top-color: #a78bfa; animation: emr-spin 0.9s linear infinite; }
        @keyframes emr-spin { to { transform: rotate(360deg); } }

        @media (max-width: 580px) {
          .emr-root { padding: 1.5rem 1rem 6rem; }
          .emr-stats { grid-template-columns: repeat(2, 1fr); }
          .emr-title { font-size: 1.6rem; }
          .plan-field-row-4 { grid-template-columns: 1fr 1fr; }
          .plan-field-row-3 { grid-template-columns: 1fr 1fr; }
          .plan-field-row-2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="emr-root">
        <div className="emr-wrap">

          {/* Page header */}
          <motion.div className="emr-page-head" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
            <div className="emr-eyebrow">Monthly Report · {user?.name || 'Employee'}</div>
            <h1 className="emr-title">My <em>Performance Report</em></h1>
            <p className="emr-sub">Track tasks, activities, plan next month, and submit to your manager.</p>
          </motion.div>

          {/* Top bar */}
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
            <span className="emr-live" title="Updates automatically when admin/manager acts on your report">
              <span className="emr-live-dot" />
              Live
            </span>
            {report?.reportingManager && (
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.25)', fontFamily: 'DM Mono, monospace' }}>
                Manager: {report.reportingManager.name}
              </span>
            )}
            <button
              className={`emr-refresh-btn ${refreshing ? 'spinning' : ''}`}
              onClick={() => fetchAll(false)}
              disabled={loading || refreshing}
              title="Refresh data"
            >
              <RefreshCw size={12} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </motion.div>

          {loading ? (
            <div className="emr-loader">
              <div className="emr-spin" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Loading report…</span>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>

              {/* Stats */}
              {report && (
                <div className="emr-stats" role="region" aria-label="Monthly statistics">
                  {[
                    { label: 'Tasks Done',     val: `${tasksDone}/${tasksTotal}`, fill: taskPct, color: taskPct >= 70 ? '#34d399' : taskPct >= 40 ? '#fbbf24' : '#f87171', showBar: true },
                    { label: 'Activities',     val: `${actDone}/${activities.length}`, fill: activities.length ? Math.round(actDone / activities.length * 100) : 0, color: '#60a5fa', showBar: true },
                    { label: 'Next Plans',     val: String(planItems.length), fill: 0, color: '#a78bfa', showBar: false },
                    { label: 'Reimbursements', val: `₹${reimbTotal.toLocaleString('en-IN')}`, fill: 0, color: '#fb923c', showBar: false },
                  ].map((s, i) => (
                    <motion.div key={s.label} className="emr-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 + i * 0.06 }}>
                      <div className="emr-stat-val" style={{ color: s.color }}>{s.val}</div>
                      <div className="emr-stat-label">{s.label}</div>
                      {s.showBar && <div className="emr-stat-bar"><div className="emr-stat-fill" style={{ width: `${s.fill}%`, background: s.color }} /></div>}
                    </motion.div>
                  ))}
                </div>
              )}

              {error && (
                <div className="error-box" role="alert">
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}
                </div>
              )}

              {report?.status === 'rejected' && report.rejectionNote && (
                <div className="rejection-box" role="alert">
                  <AlertCircle size={15} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#f87171', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Returned for revision</div>
                    <div style={{ fontSize: 13, color: '#fca5a5' }}>{report.rejectionNote}</div>
                  </div>
                </div>
              )}

              {report && ['approved', 'manager_reviewed'].includes(report.status) && (
                <div className="feedback-box">
                  <div className="feedback-label">{report.status === 'approved' ? 'Admin Feedback' : 'Manager Remarks'}</div>
                  {report.managerRemarks && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>Manager: </span>{report.managerRemarks}</div>}
                  {report.adminRemarks && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{report.adminRemarks}</div>}
                  {report.status === 'approved' && typeof report.adminScore === 'number' && (
                    <div style={{ marginTop: 8, fontSize: '2rem', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#34d399', letterSpacing: '-0.04em' }}>
                      {report.adminScore}<span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginLeft: 3 }}>/100</span>
                    </div>
                  )}
                </div>
              )}

              {/* Month tabs */}
              <div className="emr-month-tabs" role="tablist">
                {[
                  { key: 'last', label: `${MONTHS[prevMonth(month, year).m - 1]} ${prevMonth(month, year).y}`,    sub: 'Last Month Review' },
                  { key: 'this', label: `${MONTHS[month - 1]} ${year}`,                                            sub: 'This Month' },
                  { key: 'next', label: `${MONTHS[nextMonthOf(month, year).m - 1]} ${nextMonthOf(month, year).y}`, sub: 'Next Month Plan' },
                ].map(t => (
                  <button key={t.key} role="tab" aria-selected={activeTab === t.key} className={`emr-month-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key as any)}>
                    {t.label}
                    <span className="emr-month-tab-sub">{t.sub}</span>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">

                {/* ── LAST MONTH ── */}
                {activeTab === 'last' && (
                  <motion.div key="last" role="tabpanel" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.22 }}>
                    {!prevReport ? (
                      <div className="empty-state" style={{ minHeight: '30vh' }}>
                        <FileText size={32} style={{ opacity: 0.1 }} />
                        <span>No report found for {MONTHS[prevMonth(month, year).m - 1]} {prevMonth(month, year).y}</span>
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
                          <div className="feedback-box" style={{ marginBottom: 10 }}>
                            <div className="feedback-label">Score</div>
                            <div style={{ fontSize: '1.8rem', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#34d399' }}>
                              {prevReport.adminScore}<span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginLeft: 3 }}>/100</span>
                            </div>
                            {prevReport.adminRemarks && <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{prevReport.adminRemarks}</div>}
                          </div>
                        )}
                        <Section icon={<CheckSquare size={13} />} title="Tasks Completed" badge={`${prevReport.tasks.filter(t => t.isDone).length}/${prevReport.tasks.length}`} accent="#34d399">
                          {prevReport.tasks.length === 0 ? (
                            <div className="empty-state"><Square size={24} style={{ opacity: 0.1 }} /><span>No tasks</span></div>
                          ) : prevReport.tasks.map(t => (
                            <div key={t._id} className="prev-task">
                              <span style={{ color: t.isDone ? '#34d399' : 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{t.isDone ? <CheckSquare size={15} /> : <Square size={15} />}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: t.isDone ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.82)', textDecoration: t.isDone ? 'line-through' : 'none' }}>{t.title}</div>
                                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                                  {t.project?.name && `${t.project.name}`}
                                  {t.startDate && ` · ${fmt(t.startDate)}`}
                                  {t.endDate && ` → ${fmt(t.endDate)}`}
                                </div>
                                {(t.doneNote || t.undoneNote) && <div style={{ fontSize: 11.5, color: t.isDone ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.6)', marginTop: 3, fontStyle: 'italic' }}>{t.isDone ? t.doneNote : t.undoneNote}</div>}
                              </div>
                            </div>
                          ))}
                        </Section>
                        {(prevReport.nextMonthPlan?.length ?? 0) > 0 && (
                          <Section icon={<ArrowRight size={13} />} title="What Was Planned for This Month" badge={String(prevReport.nextMonthPlan.length)} accent="#a78bfa" defaultOpen={false}>
                            {prevReport.nextMonthPlan.map((item, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ width: 6, height: 6, borderRadius: 50, background: PRIORITY_COLOR[item.priority], flexShrink: 0, display: 'inline-block' }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{item.title}</span>
                                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                                    {item.projectName && item.projectName}
                                    {item.assigneeName && ` · ${item.assigneeName}`}
                                    {item.activityType && ` · ${item.activityType}`}
                                    {item.startDate && ` · ${fmt(item.startDate)}`}
                                    {item.endDate && ` → ${fmt(item.endDate)}`}
                                  </div>
                                </div>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: PRIORITY_COLOR[item.priority] + '18', color: PRIORITY_COLOR[item.priority], fontWeight: 500 }}>{item.priority}</span>
                              </div>
                            ))}
                          </Section>
                        )}
                        {prevReport.managerRemarks && (
                          <Section icon={<FileText size={13} />} title="Manager Remarks" accent="#fbbf24" defaultOpen={false}>
                            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{prevReport.managerRemarks}</div>
                          </Section>
                        )}
                      </>
                    )}
                  </motion.div>
                )}

                {/* ── THIS MONTH ── */}
                {activeTab === 'this' && (
                  <motion.div key="this" role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
                    {!report ? (
                      <div className="empty-state" style={{ padding: '4rem 0' }}>
                        <FileText size={36} style={{ opacity: 0.1 }} />
                        <span>No report found for this month</span>
                        <button className="btn btn-primary" onClick={createReport}><Plus size={16} /> Create Report</button>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', maxWidth: 280, textAlign: 'center' }}>Start tracking your tasks, activities, and plan for next month.</p>
                      </div>
                    ) : (
                      <>
                        {/* Tasks */}
                        <Section icon={<CheckSquare size={13} />} title="This Month's Tasks" badge={`${tasksDone}/${tasksTotal} done`} accent="#34d399">
                          {report.tasks.length === 0 ? (
                            <div className="empty-state">
                              <Square size={28} style={{ opacity: 0.1 }} />
                              <span>No tasks assigned yet</span>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>Tasks come from the Tasks module and are assigned by your manager.</span>
                            </div>
                          ) : report.tasks.map(task => {
                            const isSaving = savingTaskIds.has(task._id);
                            return (
                              <div key={task._id} className="task-row">
                                <div
                                  className={`task-check ${task.isDone ? 'done' : ''} ${isSaving ? 'saving' : ''}`}
                                  onClick={() => !isSaving && canEdit && toggleTask(task)}
                                  role="checkbox"
                                  aria-checked={task.isDone}
                                  aria-busy={isSaving}
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
                                  <div className={`task-title ${task.isDone ? 'done' : ''}`}>{task.title}</div>
                                  <div className="task-meta">
                                    {task.assignedBy?.name && `By ${task.assignedBy.name}`}
                                    {task.project?.name && ` · ${task.project.name}`}
                                    {task.priority && ` · `}
                                    {task.priority && <span style={{ color: PRIORITY_COLOR[task.priority] || '#94a3b8' }}>{task.priority}</span>}
                                    {task.startDate && ` · ${fmt(task.startDate)}`}
                                    {task.endDate   && ` → ${fmt(task.endDate)}`}
                                    {task.dueDate   && ` · Due ${fmt(task.dueDate)}`}
                                  </div>
                                  {task.isDone ? (
                                    <div>
                                      <div className="task-note-label">Completion note (optional)</div>
                                      <textarea
                                        className="task-note-area"
                                        rows={2}
                                        disabled={!canEdit}
                                        key={`done-${task._id}-${task.isDone}`}
                                        defaultValue={task.doneNote}
                                        placeholder="What did you achieve?"
                                        onBlur={e => saveTaskNote(task, 'doneNote', e.target.value)}
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="task-note-label" style={{ color: '#f87171' }}>Explain why incomplete *</div>
                                      <textarea
                                        className="task-note-area"
                                        rows={2}
                                        disabled={!canEdit}
                                        key={`undone-${task._id}-${task.isDone}`}
                                        defaultValue={task.undoneNote}
                                        placeholder="Reason / blockers…"
                                        style={{ borderColor: task.undoneNote?.trim() ? undefined : 'rgba(248,113,113,0.25)' }}
                                        onBlur={e => saveTaskNote(task, 'undoneNote', e.target.value)}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </Section>

                        {/* Activities */}
                        <Section icon={<ActivityIcon size={13} />} title="My Activities This Month" badge={`${actDone}/${activities.length}`} accent="#60a5fa">
                          {activities.length === 0 ? (
                            <div className="empty-state"><ActivityIcon size={26} style={{ opacity: 0.1 }} /><span>No activities for this month</span></div>
                          ) : activities.map(a => {
                            const sc = a.status === 'Completed' ? '#34d399' : a.status === 'In Progress' ? '#60a5fa' : '#fbbf24';
                            const sb = a.status === 'Completed' ? 'rgba(52,211,153,0.12)' : a.status === 'In Progress' ? 'rgba(96,165,250,0.12)' : 'rgba(251,191,36,0.12)';
                            return (
                              <div key={a._id} className="act-row">
                                <div className="act-dot" style={{ background: PRIORITY_COLOR[a.priority] || '#94a3b8' }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="act-name">{a.name}</div>
                                  <div className="act-meta">
                                    {a.project?.name && `${a.project.name} · `}
                                    {a.task?.title && `${a.task.title} · `}
                                    {a.activityType}
                                    {a.startDate && ` · ${fmt(a.startDate)}`}
                                    {a.endDate && ` → ${fmt(a.endDate)}`}
                                  </div>
                                </div>
                                <span className="act-badge" style={{ background: sb, color: sc }}>{a.status}</span>
                              </div>
                            );
                          })}
                        </Section>

                        {/* Reimbursements */}
                        <Section icon={<Receipt size={13} />} title="Reimbursements" badge={`${(report.reimbursements || []).length} linked`} accent="#fb923c" defaultOpen={false}>
                          {(report.reimbursements as Reimbursement[]).length > 0 && (
                            <>
                              <div style={{ fontSize: 9.5, fontFamily: 'DM Mono, monospace', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Linked to this report</div>
                              {(report.reimbursements as Reimbursement[]).map(r => (
                                <div key={r._id} className="reimb-row">
                                  <div className="reimb-name">{r.title}</div>
                                  <span className="reimb-amt">₹{r.amount.toLocaleString('en-IN')}</span>
                                  <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 100, background: r.status === 'Approved' ? 'rgba(52,211,153,0.12)' : r.status === 'Rejected' ? 'rgba(248,113,113,0.12)' : r.status === 'Paid' ? 'rgba(96,165,250,0.12)' : 'rgba(251,191,36,0.12)', color: r.status === 'Approved' ? '#34d399' : r.status === 'Rejected' ? '#f87171' : r.status === 'Paid' ? '#60a5fa' : '#fbbf24', marginRight: 6 }}>{r.status}</span>
                                  {canEdit && <button className="reimb-btn reimb-unlink" onClick={() => unlinkReimb(r._id)}><X size={10} /> Remove</button>}
                                </div>
                              ))}
                            </>
                          )}
                          {canEdit && myReimbs.length > 0 && (
                            <>
                              <div style={{ fontSize: 9.5, fontFamily: 'DM Mono, monospace', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>
                                Your reimbursements this month
                              </div>
                              {myReimbs.map(r => (
                                <div key={r._id} className="reimb-row">
                                  <div className="reimb-name">{r.title}</div>
                                  <span className="reimb-amt">₹{r.amount.toLocaleString('en-IN')}</span>
                                  <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 100, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', marginRight: 6 }}>{r.status}</span>
                                  <button className="reimb-btn reimb-link" onClick={() => linkReimb(r)}><Plus size={10} /> Link</button>
                                </div>
                              ))}
                            </>
                          )}
                          {(report.reimbursements || []).length === 0 && myReimbs.length === 0 && (
                            <div className="empty-state"><Receipt size={24} style={{ opacity: 0.1 }} /><span>No reimbursements for this month</span></div>
                          )}
                          {reimbTotal > 0 && (
                            <div style={{ marginTop: 10, padding: '8px 11px', background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.14)', borderRadius: 9, fontSize: 13, color: '#fb923c', fontWeight: 600 }}>
                              Total: ₹{reimbTotal.toLocaleString('en-IN')}
                            </div>
                          )}
                        </Section>

                        {/* Action bar */}
                        <div className="action-bar">
                          {report.status === 'draft' && (
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                              {submitting ? <Loader2 size={14} style={{ animation: 'emr-spin 0.7s linear infinite' }} /> : <Send size={14} />}
                              {submitting ? 'Submitting…' : 'Submit to Manager'}
                            </button>
                          )}
                          {report.status === 'rejected' && (
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                              {submitting ? <Loader2 size={14} style={{ animation: 'emr-spin 0.7s linear infinite' }} /> : <Send size={14} />}
                              {submitting ? 'Resubmitting…' : 'Resubmit Report'}
                            </button>
                          )}
                          {report.status === 'submitted' && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 7 }}><Clock size={14} /> Awaiting manager review…</div>}
                          {report.status === 'manager_reviewed' && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 7 }}><Clock size={14} /> Awaiting admin approval…</div>}
                          {report.status === 'approved' && <div style={{ fontSize: 13, color: '#34d399', display: 'flex', alignItems: 'center', gap: 7 }}><CheckCircle2 size={14} /> Approved — score: {report.adminScore}/100</div>}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

                {/* ── NEXT MONTH ── */}
                {activeTab === 'next' && (
                  <motion.div key="next" role="tabpanel" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                    {!report ? (
                      <div className="empty-state" style={{ padding: '4rem 0' }}>
                        <ArrowRight size={36} style={{ opacity: 0.1 }} />
                        <span>Load a report first to plan next month</span>
                      </div>
                    ) : (
                      <>
                        <Section
                          icon={<TrendingUp size={13} />}
                          title={`Task & Activities Planning for ${MONTHS[nextMonthOf(month, year).m - 1]} ${nextMonthOf(month, year).y}`}
                          badge={`${planItems.length} tasks`}
                          accent="#a78bfa"
                        >
                          {planItems.length === 0 && (
                            <div className="empty-state" style={{ paddingBottom: '1rem' }}>
                              <ArrowRight size={24} style={{ opacity: 0.1 }} />
                              <span>Add your task goals for next month</span>
                            </div>
                          )}

                          {planItems.map((item, idx) => (
                            <motion.div key={idx} className="plan-item" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                              <div style={{ marginBottom: 8 }}>
                                <div className="plan-field-label"><FileText size={9} /> Task / Activity </div>
                                <input
                                  className="plan-inp"
                                  placeholder="What do you plan to work on?"
                                  value={item.title}
                                  disabled={!canEdit}
                                  onChange={e => updatePlanItem(idx, { title: e.target.value })}
                                />
                              </div>

                              <div className="plan-field-row plan-field-row-4" style={{ marginBottom: 8 }}>
                                <div>
                                  <div className="plan-field-label"><FileText size={9} /> Project</div>
                                  <select className="plan-sel" value={item.project || ''} disabled={!canEdit} onChange={e => updatePlanItem(idx, { project: e.target.value })}>
                                    <option value="">No project</option>
                                    {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div className="plan-field-label">Assignee</div>
                                  <select className="plan-sel" value={item.assignee || ''} disabled={!canEdit} onChange={e => updatePlanItem(idx, { assignee: e.target.value })}>
                                    <option value="">Unassigned</option>
                                    {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div className="plan-field-label"><ActivityIcon size={9} /> Activity Type</div>
                                  <input className="plan-inp" placeholder="e.g. Meeting, Research…" value={item.activityType || ''} disabled={!canEdit} onChange={e => updatePlanItem(idx, { activityType: e.target.value })} />
                                </div>
                                <div>
                                  <div className="plan-field-label">Priority</div>
                                  <select className="plan-sel" value={item.priority} disabled={!canEdit} onChange={e => updatePlanItem(idx, { priority: e.target.value as any })}>
                                    <option>Low</option>
                                    <option>Medium</option>
                                    <option>High</option>
                                  </select>
                                </div>
                              </div>

                              <div className="plan-field-row plan-field-row-2" style={{ marginBottom: 8 }}>
                                <div>
                                  <div className="plan-field-label"><Calendar size={9} /> Start Date</div>
                                  <input type="date" className="plan-inp" value={item.startDate || ''} disabled={!canEdit} max={item.endDate || undefined} onChange={e => updatePlanItem(idx, { startDate: e.target.value })} />
                                </div>
                                <div>
                                  <div className="plan-field-label"><Calendar size={9} /> End Date</div>
                                  <input type="date" className="plan-inp" value={item.endDate || ''} disabled={!canEdit} min={item.startDate || undefined} onChange={e => updatePlanItem(idx, { endDate: e.target.value })} />
                                </div>
                              </div>

                              <div>
                                <div className="plan-field-label">Notes / Context</div>
                                <textarea className="plan-notes-area" rows={2} placeholder="Goals, deliverables, or context for this task…" value={item.notes} disabled={!canEdit} onChange={e => updatePlanItem(idx, { notes: e.target.value })} />
                              </div>

                              {canEdit && (
                                <button className="plan-del" onClick={() => removePlanItem(idx)} title="Remove plan item">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </motion.div>
                          ))}

                          {canEdit && (
                            <div style={{ marginTop: planItems.length > 0 ? 4 : 0 }}>
                              <button className="btn btn-ghost" onClick={addPlanItem}><Plus size={13} /> Add Task / Activity</button>
                            </div>
                          )}
                        </Section>

                        <textarea
                          className="freetext"
                          rows={3}
                          placeholder="Overall goals, context, or anything else for next month…"
                          value={planFreeText}
                          disabled={!canEdit}
                          onChange={e => { setPlanFreeText(e.target.value); setPlanDirty(true); }}
                        />

                        {canEdit && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn btn-save" onClick={savePlan} disabled={saving || !planDirty}>
                              {saving ? <Loader2 size={13} style={{ animation: 'emr-spin 0.7s linear infinite' }} /> : <Save size={13} />}
                              {saving ? 'Saving…' : 'Save Plan'}
                            </button>
                            {planDirty && (
                              <span style={{ fontSize: 11.5, color: 'rgba(251,191,36,0.6)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Mono, monospace' }}>
                                ● Unsaved changes
                              </span>
                            )}
                          </div>
                        )}

                        {!canEdit && (
                          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'rgba(255,255,255,0.22)', fontStyle: 'italic', marginTop: 8 }}>
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

      {/* Toast */}
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