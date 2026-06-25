// src/components/Activities/ActivityForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createActivity, updateActivity } from '../../api/client';
import { Save, X, Loader2 } from 'lucide-react';

const WEEKDAYS: { value: string; label: string }[] = [
  { value: 'Sun', label: 'Sun' },
  { value: 'Mon', label: 'Mon' },
  { value: 'Tue', label: 'Tue' },
  { value: 'Wed', label: 'Wed' },
  { value: 'Thu', label: 'Thu' },
  { value: 'Fri', label: 'Fri' },
  { value: 'Sat', label: 'Sat' },
];

export const ActivityForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    activityType: 'One Time',
    priority: 'Medium',
    status: 'Pending',
  });

  const [reminderDays, setReminderDays] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isDaily = formData.activityType === 'Daily';
  const isWeekly = formData.activityType === 'Weekly';

  useEffect(() => {
    if (id) loadActivity();
  }, [id]);

  const loadActivity = async () => {
    try {
      const res = await (await import('../../api/client')).getActivity(id!);
      const act = res.data;
      setFormData({
        name: act.name || '',
        description: act.description || '',
        startDate: act.startDate ? act.startDate.split('T')[0] : '',
        endDate: act.endDate ? act.endDate.split('T')[0] : '',
        activityType: act.activityType || 'One Time',
        priority: act.priority || 'Medium',
        status: act.status || 'Pending',
      });
      setReminderDays([]);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleDay = (day: string) => {
    setReminderDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // When switching type away from Daily/Weekly, clear the fields that no
  // longer apply so stale values don't get submitted silently.
  const handleTypeChange = (newType: string) => {
    setFormData((prev) => ({
      ...prev,
      activityType: newType,
      ...(newType === 'Daily' ? { startDate: '', endDate: '' } : {}),
    }));
    if (newType !== 'Weekly') setReminderDays([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const data = new FormData();
    data.append('name', formData.name);
    data.append('description', formData.description);
    if (!isDaily && formData.startDate) data.append('startDate', formData.startDate);
    if (!isDaily && formData.endDate) data.append('endDate', formData.endDate);
    data.append('activityType', formData.activityType);
    data.append('priority', formData.priority);
    data.append('status', formData.status);

    if (isWeekly) {
      data.append('reminderDays', JSON.stringify(reminderDays));
    }

    attachments.forEach((file) => data.append('attachments', file));

    try {
      if (id) {
        await updateActivity(id, data);
      } else {
        await createActivity(data);
      }
      navigate('/activities');
    } catch (err) {
      console.error(err);
      alert('Error saving activity. Please check the console.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080e] text-white p-8">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8"
        >
          <h1 className="text-3xl font-bold mb-8">{id ? 'Edit Activity' : 'New Activity'}</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <input
              placeholder="Activity Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white placeholder:text-gray-400 focus:border-violet-400 outline-none"
              required
            />

            <textarea
              placeholder="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white placeholder:text-gray-400 focus:border-violet-400 outline-none"
            />

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs text-gray-400 block mb-2">Activity Type</label>
                <select
                  value={formData.activityType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none"
                >
                  <option value="One Time">One Time</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            {/* Daily: no dates at all. Weekly: optional bounding range +
               day-of-week picker below. One Time / Monthly: unchanged. */}
            {!isDaily && (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-gray-400 block mb-2">
                    {isWeekly ? 'Start Date (optional)' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-2">
                    {isWeekly ? 'End Date (optional)' : 'End Date'}
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none"
                  />
                </div>
              </div>
            )}

            {isDaily && (
              <p className="text-xs text-gray-400 -mt-2">
                Daily activities don't use start/end dates — you'll get a reminder every day until it's marked Completed.
              </p>
            )}

            {isWeekly && (
              <div>
                <label className="text-xs text-gray-400 block mb-2">
                  Repeats on these days *
                </label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const active = reminderDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                          active
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-white/10 border-white/20 text-gray-300 hover:border-violet-400'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  You'll get a reminder on each selected day{formData.startDate || formData.endDate ? ', within the date range above' : ''}.
                </p>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 block mb-2">Attachments</label>
              <input
                type="file"
                multiple
                onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none"
              />
            </div>

            <div className="flex gap-4 pt-6">
              <button
                type="submit"
                disabled={submitting || (isWeekly && reminderDays.length === 0)}
                className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-semibold"
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {id ? 'Update Activity' : 'Create Activity'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/activities')}
                className="flex-1 flex items-center justify-center gap-2 border border-white/30 py-4 rounded-2xl font-semibold"
              >
                <X size={20} /> Cancel
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};