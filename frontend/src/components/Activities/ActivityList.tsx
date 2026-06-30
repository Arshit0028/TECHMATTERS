// src/components/Dashboard/ActivityList.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  Loader2,
  CheckCircle2,
  PlayCircle,
  Repeat,
  Lock,
} from 'lucide-react';
import api from '../../api/client';
import type { Activity } from '../types/index';

const LOCKED_STATUSES = ['Submitted', 'Completed'];

// Builds "YYYY-MM" options for the last 12 months plus the current month,
// newest first — enough range for a typical reporting workflow without
// needing a full date-picker component.
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

// Shared select styling — fixes white-on-white text by forcing a visible
// text color and dark option background.
const selectClass =
  'bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 focus:outline-none [&>option]:bg-[#0d0e16] [&>option]:text-white';

export const ActivityList: React.FC = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchActivities();
  }, [monthFilter]);

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
        prev.map(act => (act._id === id ? { ...act, status: newStatus } : act))
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

  const filtered = activities.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description && a.description.toLowerCase().includes(search.toLowerCase()))
  );

  // Renders the date/schedule line for a card depending on activity type:
  // Daily has no dates, Weekly shows its selected days, everything else
  // shows the original start-date display.
  const renderSchedule = (activity: Activity) => {
    if (activity.activityType === 'Daily') {
      return (
        <div className="flex items-center gap-1">
          <Repeat size={14} />
          Every day
        </div>
      );
    }

    if (activity.activityType === 'Weekly') {
      const days = (activity as any).reminderDays as string[] | undefined;
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
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
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
              const isUpdatingThis = updatingId === activity._id;
              const isDeletingThis = deletingId === activity._id;
              const isCompleted = activity.status === 'Completed';
              const isInProgress = activity.status === 'In Progress';
              const isLocked = LOCKED_STATUSES.includes(activity.status);

              return (
                <motion.div
                  key={activity._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 hover:border-violet-400 transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="font-semibold text-lg leading-tight">{activity.name}</div>
                    <span
                      className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap ${
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

                  <p className="text-gray-400 text-sm mb-5 line-clamp-2">{activity.description || 'No description'}</p>

                  <div className="flex items-center justify-between text-xs text-gray-400 mb-5">
                    {renderSchedule(activity)}
                  </div>

                  {/* CRUD action row — View always available; Edit shown
                     only when not locked, with a lock icon swapped in when
                     it is, so the restriction is visible rather than the
                     button just disappearing. Delete always available. */}
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/10">
                    <button
                      onClick={() => navigate(`/activities/${activity._id}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 py-2.5 rounded-xl transition-all"
                    >
                      <Eye size={14} /> View
                    </button>

                    {isLocked ? (
                      <button
                        disabled
                        title="Locked — Submitted/Completed activities can't be edited"
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
                      disabled={isDeletingThis}
                      className="flex items-center justify-center gap-1.5 text-sm text-red-400 hover:text-red-300 bg-white/5 hover:bg-red-500/10 py-2.5 px-3 rounded-xl transition-all disabled:opacity-50"
                    >
                      {isDeletingThis ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                    </button>
                  </div>

                  {/* Quick Status Buttons — hidden once locked, since
                     Submitted/Completed activities can't be edited further. */}
                  {!isLocked && (
                    <div className="flex gap-2">
                      {!isInProgress && (
                        <button
                          onClick={() => updateStatus(activity._id, 'In Progress')}
                          disabled={isUpdatingThis}
                          className="flex-1 flex items-center justify-center gap-2 bg-blue-600/90 hover:bg-blue-600 text-white text-sm font-medium py-3 px-4 rounded-2xl transition-all"
                        >
                          {isUpdatingThis ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />}
                          Mark Ongoing
                        </button>
                      )}

                      <button
                        onClick={() => updateStatus(activity._id, 'Completed')}
                        disabled={isUpdatingThis}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-3 px-4 rounded-2xl transition-all"
                      >
                        {isUpdatingThis ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Mark Completed
                      </button>
                    </div>
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