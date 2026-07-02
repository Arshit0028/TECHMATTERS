// src/components/Activities/ActivityView.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, ArrowLeft, Pencil, Calendar, Repeat, Paperclip, Lock,
  RefreshCw, CheckCircle2, AlertTriangle, Clock, List, Check,
} from 'lucide-react';
import api from '../../api/client';
import type { Activity } from '../types/index';

const LOCKED_STATUSES = ['Submitted', 'Completed'];

const statusClass = (status: string) => {
  if (status === 'Completed') return 'bg-emerald-500/20 text-emerald-400';
  if (status === 'Submitted') return 'bg-violet-500/20 text-violet-400';
  if (status === 'In Progress') return 'bg-blue-500/20 text-blue-400';
  return 'bg-amber-500/20 text-amber-400';
};

// ── Recurring types ───────────────────────────────────────────────────
type DisplayStatus = 'completed' | 'late' | 'pending';

interface Occurrence {
  _id: string;
  scheduledDate: string;
  status: 'pending' | 'completed';
  displayStatus: DisplayStatus;
  completedAt?: string;
}

interface RecurringStats {
  total: number;
  completed: number;
  late: number;
  pending: number;
}

// ── Recurring helpers ─────────────────────────────────────────────────
const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const toDateStr = (iso: string) => iso.split('T')[0];

const occMeta: Record<DisplayStatus, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  completed: { color: '#34d399', bg: 'rgba(52,211,153,0.15)',  icon: <CheckCircle2 size={13} />, label: 'Completed' },
  late:      { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  icon: <AlertTriangle size={13} />, label: 'Late' },
  pending:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  icon: <Clock size={13} />,         label: 'Pending' },
};

const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const getFirstDay    = (y: number, m: number) => new Date(y, m, 1).getDay();

// ── Progress Ring ─────────────────────────────────────────────────────
const ProgressRing: React.FC<{ stats: RecurringStats }> = ({ stats }) => {
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const r = 34; const circ = 2 * Math.PI * r;
  const color = pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#a78bfa';
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
          transform="rotate(-90 42 42)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-base font-bold text-white">{pct}%</div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────
export const ActivityView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Recurring-specific state
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [completingDate, setCompletingDate] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });

  const today = todayStr();

  useEffect(() => { if (id) load(); }, [id]);

  // Set calendar to activity's start month on first load
  useEffect(() => {
    if (activity?.isRecurring && activity.startDate) {
      const d = new Date(activity.startDate);
      setCalMonth({ year: d.getFullYear(), month: d.getUTCMonth() });
    }
  }, [activity?._id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/activities/${id}`);
      setActivity(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleComplete = async (scheduledDate: string) => {
    if (!activity) return;
    setCompletingDate(scheduledDate);
    try {
      const res = await api.post(`/activities/${activity._id}/complete-occurrence`, { scheduledDate });
      setActivity((prev: any) => ({
        ...prev,
        recurringStats: res.data.stats,
        occurrences: prev.occurrences.map((o: Occurrence) =>
          toDateStr(o.scheduledDate) === scheduledDate ? { ...o, ...res.data.occurrence } : o,
        ),
      }));
    } catch (err: any) {
      alert(err?.response?.data?.msg || 'Failed to complete');
    } finally { setCompletingDate(null); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#07080e] text-white p-8 flex items-center justify-center">
      <Loader2 className="animate-spin" size={28} />
    </div>
  );

  if (!activity) return (
    <div className="min-h-screen bg-[#07080e] text-white p-8 text-center text-gray-400">
      Activity not found.
    </div>
  );

  const isLocked = LOCKED_STATUSES.includes(activity.status);

  // ── NON-RECURRING view (original, completely unchanged) ───────────────
  if (!activity.isRecurring) {
    const reminderDays = activity.reminderDays;
    return (
      <div className="min-h-screen bg-[#07080e] text-white p-8">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate('/activities')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 text-sm">
            <ArrowLeft size={16} /> Back to Activities
          </button>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8">
            <div className="flex justify-between items-start mb-6">
              <h1 className="text-3xl font-bold pr-4">{activity.name}</h1>
              <span className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap ${statusClass(activity.status)}`}>
                {activity.status}
              </span>
            </div>
            {isLocked && (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 mb-6">
                <Lock size={14} />
                This activity is {activity.status.toLowerCase()} and can no longer be edited.
              </div>
            )}
            <div className="space-y-6">
              <div>
                <div className="text-xs text-gray-400 mb-1">Description</div>
                <p className="text-gray-200 whitespace-pre-wrap">{activity.description || 'No description'}</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Activity Type</div>
                  <p className="text-gray-200">{activity.activityType}</p>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Priority</div>
                  <p className="text-gray-200">{activity.priority}</p>
                </div>
              </div>
              {activity.activityType === 'Daily' && (
                <div className="flex items-center gap-2 text-gray-200 text-sm"><Repeat size={16} /> Repeats every day</div>
              )}
              {activity.activityType === 'Weekly' && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Repeats On</div>
                  <div className="flex items-center gap-2 text-gray-200 text-sm">
                    <Repeat size={16} />
                    {reminderDays && reminderDays.length > 0 ? reminderDays.join(', ') : 'No days set'}
                  </div>
                </div>
              )}
              {activity.activityType !== 'Daily' && (activity.startDate || activity.endDate) && (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Start Date</div>
                    <div className="flex items-center gap-2 text-gray-200 text-sm">
                      <Calendar size={16} />
                      {activity.startDate ? new Date(activity.startDate).toLocaleDateString('en-IN') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">End Date</div>
                    <div className="flex items-center gap-2 text-gray-200 text-sm">
                      <Calendar size={16} />
                      {activity.endDate ? new Date(activity.endDate).toLocaleDateString('en-IN') : '—'}
                    </div>
                  </div>
                </div>
              )}
              {activity.attachments && activity.attachments.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-2">Attachments</div>
                  <div className="space-y-2">
                    {activity.attachments.map((file: any, idx: number) => (
                      <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300">
                        <Paperclip size={14} /> {file.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {!isLocked && (
              <div className="pt-8">
                <Link to={`/activities/${activity._id}/edit`}
                  className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 py-4 rounded-2xl font-semibold">
                  <Pencil size={18} /> Edit Activity
                </Link>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // ── RECURRING view ────────────────────────────────────────────────────
  const occurrences: Occurrence[] = activity.occurrences || [];
  const stats: RecurringStats = activity.recurringStats || { total: 0, completed: 0, late: 0, pending: 0 };
  const occByDate = Object.fromEntries(occurrences.map(o => [toDateStr(o.scheduledDate), o]));

  const daysInMonth = getDaysInMonth(calMonth.year, calMonth.month);
  const firstDay    = getFirstDay(calMonth.year, calMonth.month);
  const calLabel    = new Date(calMonth.year, calMonth.month, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const prevMonth = () => setCalMonth(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextMonth = () => setCalMonth(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  return (
    <div className="min-h-screen bg-[#07080e] text-white p-6 md:p-10">
      <div className="max-w-4xl mx-auto">

        <button onClick={() => navigate('/activities')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Activities
        </button>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <RefreshCw size={20} className="text-violet-400" />
            <h1 className="text-2xl md:text-3xl font-bold">{activity.name}</h1>
            <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full">Recurring</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
            <Calendar size={13} />
            {new Date(activity.startDate).toLocaleDateString('en-IN')} → {new Date(activity.endDate).toLocaleDateString('en-IN')}
            <span className="text-violet-400 font-medium ml-1">· {(activity.weekdays || []).join(', ')}</span>
          </div>
          {activity.description && <p className="text-gray-400 mt-2 text-sm">{activity.description}</p>}
        </motion.div>

        {/* Stats cards */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-8">
          <div className="col-span-2 md:col-span-1 bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col items-center justify-center gap-2">
            <ProgressRing stats={stats} />
            <p className="text-xs text-gray-400">Overall</p>
          </div>
          {[
            { label: 'Completed', value: stats.completed, total: stats.total, color: '#34d399', icon: <CheckCircle2 size={17} /> },
            { label: 'Late',      value: stats.late,      total: null,         color: '#fbbf24', icon: <AlertTriangle size={17} /> },
            { label: 'Pending',   value: stats.pending,   total: null,         color: '#60a5fa', icon: <Clock size={17} /> },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col justify-between">
              <div style={{ color: s.color }}>{s.icon}</div>
              <div>
                <div className="text-2xl font-bold text-white mt-2">
                  {s.value}
                  {s.total !== null && <span className="text-base text-gray-500">/{s.total}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* View toggle */}
        <div className="flex gap-2 mb-5">
          <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1">
            {(['calendar', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  view === v ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {v === 'calendar' ? <Calendar size={14} /> : <List size={14} />}
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ── CALENDAR VIEW ─────────────────────────────────────────── */}
          {view === 'calendar' && (
            <motion.div key="cal" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              className="bg-white/5 border border-white/10 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-5">
                <button onClick={prevMonth} className="text-gray-400 hover:text-white px-3 py-1 rounded-xl hover:bg-white/10 transition-all">‹</button>
                <span className="font-semibold">{calLabel}</span>
                <button onClick={nextMonth} className="text-gray-400 hover:text-white px-3 py-1 rounded-xl hover:bg-white/10 transition-all">›</button>
              </div>

              <div className="grid grid-cols-7 mb-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const occ = occByDate[dateStr];
                  const isToday = dateStr === today;
                  const isFuture = dateStr > today;
                  const completing = completingDate === dateStr;

                  return (
                    <div key={day}
                      className={`relative rounded-xl p-1 min-h-[52px] flex flex-col items-center pt-1.5 transition-all ${isToday ? 'ring-1 ring-violet-400' : ''}`}
                      style={{ background: occ ? occMeta[occ.displayStatus].bg : 'transparent' }}>
                      <span className={`text-xs font-medium mb-1 ${isToday ? 'text-violet-300' : occ ? 'text-white' : 'text-gray-500'}`}>
                        {day}
                      </span>
                      {occ && (
                        <div className="flex flex-col items-center gap-0.5 w-full">
                          <div style={{ color: occMeta[occ.displayStatus].color }}>{occMeta[occ.displayStatus].icon}</div>
                          {occ.displayStatus !== 'completed' && !isFuture && (
                            <button onClick={() => handleComplete(dateStr)} disabled={completing}
                              className="mt-0.5 w-full text-[9px] font-semibold py-0.5 px-1 rounded-md bg-white/10 hover:bg-emerald-500/30 hover:text-emerald-300 transition-all disabled:opacity-50"
                              style={{ color: occ.displayStatus === 'late' ? '#fbbf24' : '#60a5fa' }}>
                              {completing ? '…' : occ.displayStatus === 'late' ? 'Late' : 'Done'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-white/10">
                {(['completed','late','pending'] as DisplayStatus[]).map(s => (
                  <div key={s} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <div style={{ color: occMeta[s].color }}>{occMeta[s].icon}</div>
                    {occMeta[s].label}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── LIST VIEW ──────────────────────────────────────────────── */}
          {view === 'list' && (
            <motion.div key="list" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
              <div className="divide-y divide-white/5">
                {occurrences.map(occ => {
                  const dateStr = toDateStr(occ.scheduledDate);
                  const isFuture = dateStr > today;
                  const isToday = dateStr === today;
                  const completing = completingDate === dateStr;
                  const meta = occMeta[occ.displayStatus];
                  return (
                    <div key={occ._id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: meta.bg, color: meta.color }}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">
                            {new Date(occ.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {isToday && <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">Today</span>}
                          {occ.displayStatus === 'late' && (
                            <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                              You're late — still completable
                            </span>
                          )}
                        </div>
                        {occ.completedAt && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Completed {new Date(occ.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap"
                        style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                      {occ.displayStatus !== 'completed' && !isFuture && (
                        <button onClick={() => handleComplete(dateStr)} disabled={completing}
                          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                          {completing ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                          {completing ? 'Saving…' : 'Mark Complete'}
                        </button>
                      )}
                      {isFuture && occ.displayStatus === 'pending' && (
                        <span className="text-xs text-gray-600 italic">Not yet</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};