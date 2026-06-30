// src/components/Activities/ActivityView.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Pencil, Calendar, Repeat, Paperclip, Lock } from 'lucide-react';
import api from '../../api/client';
import type { Activity } from '../types/index';

const LOCKED_STATUSES = ['Submitted', 'Completed'];

const statusClass = (status: string) => {
  if (status === 'Completed') return 'bg-emerald-500/20 text-emerald-400';
  if (status === 'Submitted') return 'bg-violet-500/20 text-violet-400';
  if (status === 'In Progress') return 'bg-blue-500/20 text-blue-400';
  return 'bg-amber-500/20 text-amber-400';
};

export const ActivityView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) load();
  }, [id]);

  const load = async () => {
    try {
      const res = await api.get(`/activities/${id}`);
      setActivity(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080e] text-white p-8 flex items-center justify-center">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-screen bg-[#07080e] text-white p-8 text-center text-gray-400">
        Activity not found.
      </div>
    );
  }

  const isLocked = LOCKED_STATUSES.includes(activity.status);
  const reminderDays = activity.reminderDays;

  return (
    <div className="min-h-screen bg-[#07080e] text-white p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/activities')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 text-sm"
        >
          <ArrowLeft size={16} /> Back to Activities
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8"
        >
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
              <p className="text-gray-200 whitespace-pre-wrap">
                {activity.description || 'No description'}
              </p>
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
              <div className="flex items-center gap-2 text-gray-200 text-sm">
                <Repeat size={16} /> Repeats every day
              </div>
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
                  {activity.attachments.map((file, idx) => (
                    <a
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300"
                    >
                      <Paperclip size={14} /> {file.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isLocked && (
            <div className="pt-8">
              <Link
                to={`/activities/${activity._id}/edit`}
                className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 py-4 rounded-2xl font-semibold"
              >
                <Pencil size={18} /> Edit Activity
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};