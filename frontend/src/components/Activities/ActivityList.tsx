// src/components/Dashboard/ActivityList.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Calendar, Loader2, CheckCircle2, PlayCircle, Repeat } from 'lucide-react';
import api from '../../api/client';
import type { Activity } from '../types/index';

export const ActivityList: React.FC = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const res = await api.get('/activities');
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
      const res = await api.put(`/activities/${id}`, { status: newStatus });
      // Optimistic update
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

        <div className="relative mb-6">
          <input
            type="text"
            placeholder="Search activities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 pl-12 text-white placeholder:text-gray-400 focus:border-violet-400 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading activities...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No activities found</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(activity => {
              const isUpdating = updatingId === activity._id;
              const isCompleted = activity.status === 'Completed';
              const isInProgress = activity.status === 'In Progress';

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
                      className={`px-3 py-1 text-xs rounded-full font-medium ${
                        isCompleted
                          ? 'bg-emerald-500/20 text-emerald-400'
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
                    <button
                      onClick={() => navigate(`/activities/${activity._id}`)}
                      className="flex items-center gap-1 text-violet-400 hover:text-violet-300"
                    >
                      <Eye size={14} /> View
                    </button>
                  </div>

                  {/* Quick Status Buttons */}
                  <div className="flex gap-2">
                    {!isInProgress && !isCompleted && (
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
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};