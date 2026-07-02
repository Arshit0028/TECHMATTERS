// src/components/Activities/ActivityList.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Eye, Pencil, Trash2, Calendar, Loader2,
  CheckCircle2, PlayCircle, Repeat, Lock, RefreshCw,
  AlertTriangle, Clock,
} from 'lucide-react';
import api from '../../api/client';

const LOCKED_STATUSES = ['Submitted', 'Completed'];

const buildMonthOptions = () => {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
};
const MONTH_OPTIONS = buildMonthOptions();

const selectClass =
  'bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 focus:outline-none [&>option]:bg-[#0d0e16] [&>option]:text-white';

interface RecurringStats { total: number; completed: number; late: number; pending: number; }

const RecurringProgressBar: React.FC<{ stats: RecurringStats }> = ({ stats }) => {
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const color = pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171';
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{stats.completed}/{stats.total} completed</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <div className="flex gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1 text-amber-400">
          <AlertTriangle size={10} /> {stats.late} late
        </span>
        <span className="flex items-center gap-1 text-blue-400">
          <Clock size={10} /> {stats.pending} pending
        </span>
      </div>
    </div>
  );
};

export const ActivityList: React.FC = () => {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchActivities(); }, [monthFilter]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const res = await api.get('/activities', {
        params: monthFilter ? { month: monthFilter } : {},
      });
      setActivities(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: 'In Progress' | 'Completed') => {
    setUpdatingId(id);
    try {
      await api.put(`/activities/${id}`, { status: newStatus });
      setActivities(prev =>
        prev.map(act => act._id === id ? { ...act, status: newStatus } : act),
      );
    } catch (err) {
      console.error(err);
      alert('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/activities/${id}`);
      setActivities(prev => prev.filter(act => act._id !== id));
    } catch (err) {
      console.error(err);
      alert('Failed to delete activity');
    } finally {
      setDeletingId(null);
    }
  };

  const renderSchedule = (activity: any) => {
    if (activity.isRecurring) {
      return (
        <div className="flex items-center gap-1">
          <RefreshCw size={13} className="text-violet-400" />
          <span className="text-violet-300 text-xs">{(activity.weekdays || []).join(', ')}</span>
        </div>
      );
    }
    if (activity.activityType === 'Daily') {
      return (
        <div className="flex items-center gap-1">
          <Repeat size={14} /> Every day
        </div>
      );
    }
    if (activity.activityType === 'Weekly') {
      const days = activity.reminderDays as string[] | undefined;
      return (
        <div className="flex items-center gap-1">
          <Repeat size={14} />
          {days && days.length > 0 ? days.join(', ') : 'No days set'}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <Calendar size={14} />
        {activity.startDate ? new Date(activity.startDate).toLocaleDateString('en-IN') : '—'}
      </div>
    );
  };

  const filtered = activities.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description && a.description.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="min-h-screen bg-[#07080e] text-white p-8">
      <div className="max-w-6xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Activities</h1>
            <p className="text-gray-400">Quickly mark as Ongoing or Completed</p>
          </div>
          <button
            onClick={() => navigate('/activities/new')}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 px-6 py-3 rounded-2xl font-semibold transition-all"
          >
            <Plus size={18} /> New Activity
          </button>
        </motion.div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            type="text"
            placeholder="Search activities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white placeholder:text-gray-400 focus:border-violet-400 focus:outline-none"
          />
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">All Months</option>
            {MONTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading activities...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No activities found</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(activity => {
              const isUpdating = updatingId === activity._id;
              const isDeleting = deletingId === activity._id;
              const isCompleted = activity.status === 'Completed';
              const isInProgress = activity.status === 'In Progress';
              const isLocked = LOCKED_STATUSES.includes(activity.status);
              const recurring = activity.isRecurring;
              const stats: RecurringStats | null = recurring ? activity.recurringStats : null;

              return (
                <motion.div
                  key={activity._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white/5 backdrop-blur-xl border rounded-3xl p-6 hover:border-violet-400 transition-all ${
                    recurring ? 'border-violet-500/30' : 'border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {recurring && <RefreshCw size={14} className="text-violet-400 flex-shrink-0" />}
                      <span className="font-semibold text-lg leading-tight">{activity.name}</span>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap ml-2 ${
                        isCompleted
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : activity.status === 'Submitted'
                          ? 'bg-violet-500/20 text-violet-400'
                          : isInProgress
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {activity.status}
                    </span>
                  </div>

                  {recurring && (
                    <span className="text-[10px] bg-violet-500/15 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-full font-medium">
                      Recurring
                    </span>
                  )}

                  <p className="text-gray-400 text-sm mb-4 mt-3 line-clamp-2">
                    {activity.description || 'No description'}
                  </p>

                  <div className="text-xs text-gray-400 mb-4">
                    {renderSchedule(activity)}
                  </div>

                  {recurring && stats && (
                    <RecurringProgressBar stats={stats} />
                  )}

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                    <button
                      onClick={() => navigate(`/activities/${activity._id}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 py-2.5 rounded-xl transition-all"
                    >
                      <Eye size={14} /> View
                    </button>

                    {isLocked ? (
                      <button
                        disabled
                        title="Locked"
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-500 bg-white/5 py-2.5 rounded-xl cursor-not-allowed"
                      >
                        <Lock size={14} /> Locked
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/activities/${activity._id}/edit`)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 py-2.5 rounded-xl transition-all"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(activity._id, activity.name)}
                      disabled={isDeleting}
                      className="flex items-center justify-center text-sm text-red-400 hover:text-red-300 bg-white/5 hover:bg-red-500/10 py-2.5 px-3 rounded-xl transition-all disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                    </button>
                  </div>

                  {!recurring && !isLocked && (
                    <div className="flex gap-2 mt-3">
                      {!isInProgress && (
                        <button
                          onClick={() => updateStatus(activity._id, 'In Progress')}
                          disabled={isUpdating}
                          className="flex-1 flex items-center justify-center gap-2 bg-blue-600/90 hover:bg-blue-600 text-white text-sm font-medium py-3 px-4 rounded-2xl transition-all"
                        >
                          {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />}
                          Mark Ongoing
                        </button>
                      )}
                      {!isCompleted && (
                        <button
                          onClick={() => updateStatus(activity._id, 'Completed')}
                          disabled={isUpdating}
                          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-3 px-4 rounded-2xl transition-all"
                        >
                          {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                          Mark Completed
                        </button>
                      )}
                    </div>
                  )}

                  {recurring && (
                    <button
                      onClick={() => navigate(`/activities/${activity._id}`)}
                      className="w-full mt-3 flex items-center justify-center gap-2 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-sm font-medium py-3 rounded-2xl transition-all border border-violet-500/20"
                    >
                      <RefreshCw size={15} /> Track Occurrences
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};