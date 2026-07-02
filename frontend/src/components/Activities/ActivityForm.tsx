// src/components/Activities/ActivityForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createActivity, updateActivity } from '../../api/client';
import { Save, X, Loader2, Lock, RefreshCw, Info } from 'lucide-react';

const WEEKDAYS: { value: string; label: string }[] = [
  { value: 'Mon', label: 'Mon' },
  { value: 'Tue', label: 'Tue' },
  { value: 'Wed', label: 'Wed' },
  { value: 'Thu', label: 'Thu' },
  { value: 'Fri', label: 'Fri' },
  { value: 'Sat', label: 'Sat' },
  { value: 'Sun', label: 'Sun' },
];

const LOCKED_STATUSES = ['Submitted', 'Completed'];

const selectClass =
  'w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none [&>option]:bg-[#0d0e16] [&>option]:text-white';

// Mirrors the server-side occurrence count so the employee sees a live
// preview before submitting.
const WEEKDAY_JS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
function countOccurrences(start: string, end: string, days: string[]): number {
  if (!start || !end || days.length === 0) return 0;
  const set = new Set(days.map(d => WEEKDAY_JS[d]));
  let count = 0;
  const cur = new Date(start + 'T00:00:00Z');
  const endD = new Date(end + 'T00:00:00Z');
  while (cur <= endD) {
    if (set.has(cur.getUTCDay())) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export const ActivityForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

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
  const [loadingActivity, setLoadingActivity] = useState(isEditMode);
  const [isLocked, setIsLocked] = useState(false);

  // ── Recurring state ────────────────────────────────────────────────
  const [isRecurring, setIsRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<string[]>([]);
  // Recurring activities cannot have their schedule changed after creation
  const [recurringLocked, setRecurringLocked] = useState(false);

  const isDaily = formData.activityType === 'Daily';
  const isWeekly = formData.activityType === 'Weekly';
  const occurrencePreview = isRecurring
    ? countOccurrences(formData.startDate, formData.endDate, weekdays)
    : 0;

  useEffect(() => {
    if (id) loadActivity();
  }, [id]);

  const loadActivity = async () => {
    try {
      const res = await (await import('../../api/client')).getActivity(id!);
      const act = res.data;

      if (LOCKED_STATUSES.includes(act.status)) {
        setIsLocked(true);
        navigate(`/activities/${id}`, { replace: true });
        return;
      }

      setFormData({
        name: act.name || '',
        description: act.description || '',
        startDate: act.startDate ? act.startDate.split('T')[0] : '',
        endDate: act.endDate ? act.endDate.split('T')[0] : '',
        activityType: act.activityType || 'One Time',
        priority: act.priority || 'Medium',
        status: act.status || 'Pending',
      });
      setReminderDays(act.reminderDays || []);

      // Restore recurring state — but lock schedule editing since
      // changing weekdays/dates after occurrence generation is not supported.
      if ((act as any).isRecurring) {
        setIsRecurring(true);
        setWeekdays((act as any).weekdays || []);
        setRecurringLocked(true); // can't change schedule on existing recurring activity
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActivity(false);
    }
  };

  const toggleDay = (day: string) => {
    if (recurringLocked) return;
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  };

  const handleTypeChange = (newType: string) => {
    setFormData(prev => ({
      ...prev,
      activityType: newType,
      ...(newType === 'Daily' ? { startDate: '', endDate: '' } : {}),
    }));
    if (newType !== 'Weekly') setReminderDays([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate recurring-specific fields
    if (isRecurring && !recurringLocked) {
      if (weekdays.length === 0) {
        alert('Please select at least one weekday for the recurring activity.');
        return;
      }
      if (!formData.startDate || !formData.endDate) {
        alert('Start and end date are required for recurring activities.');
        return;
      }
      if (occurrencePreview === 0) {
        alert('No occurrences fall within the selected date range and weekdays. Widen the date range.');
        return;
      }
    }

    setSubmitting(true);

    const data = new FormData();
    data.append('name', formData.name);
    data.append('description', formData.description);
    if (!isDaily && formData.startDate) data.append('startDate', formData.startDate);
    if (!isDaily && formData.endDate) data.append('endDate', formData.endDate);
    data.append('activityType', formData.activityType);
    data.append('priority', formData.priority);
    data.append('status', formData.status);
    if (isWeekly) data.append('reminderDays', JSON.stringify(reminderDays));

    // Recurring fields — only sent on create, not edit
    if (!isEditMode) {
      data.append('isRecurring', String(isRecurring));
      if (isRecurring) {
        data.append('weekdays', JSON.stringify(weekdays));
      }
    }

    attachments.forEach(file => data.append('attachments', file));

    try {
      if (id) {
        await updateActivity(id, data);
      } else {
        await createActivity(data);
      }
      navigate('/activities');
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.msg || 'Error saving activity.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingActivity) {
    return (
      <div className="min-h-screen bg-[#07080e] text-white p-8 flex items-center justify-center">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (isLocked) return null;

  return (
    <div className="min-h-screen bg-[#07080e] text-white p-8">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8"
        >
          <h1 className="text-3xl font-bold mb-8">{isEditMode ? 'Edit Activity' : 'New Activity'}</h1>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Name */}
            <input
              placeholder="Activity Name *"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white placeholder:text-gray-400 focus:border-violet-400 outline-none"
              required
            />

            {/* Description */}
            <textarea
              placeholder="Description"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white placeholder:text-gray-400 focus:border-violet-400 outline-none"
            />

            {/* Recurring toggle — only shown on create for non-daily activities */}
            {!isEditMode && !isDaily && (
              <button
                type="button"
                onClick={() => { setIsRecurring(v => !v); setWeekdays([]); }}
                className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl border text-sm font-medium transition-all ${
                  isRecurring
                    ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                    : 'bg-white/5 border-white/20 text-gray-400 hover:border-white/40'
                }`}
              >
                <RefreshCw size={16} className={isRecurring ? 'text-violet-400' : 'text-gray-500'} />
                {isRecurring ? 'Recurring Activity (ON)' : 'Make this a Recurring Activity'}
                <span className="ml-auto text-xs opacity-60">
                  {isRecurring ? 'Tracks completion per scheduled date' : 'Tap to enable'}
                </span>
              </button>
            )}

            {/* Recurring schedule: weekdays + date range */}
            {isRecurring && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 overflow-hidden"
              >
                {recurringLocked && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
                    <Lock size={13} />
                    Schedule is locked — weekdays and dates can't be changed after creation.
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-400 block mb-2">
                    Repeats on these days *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(day => {
                      const active = weekdays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          disabled={recurringLocked}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                            active
                              ? 'bg-violet-600 border-violet-500 text-white'
                              : 'bg-white/10 border-white/20 text-gray-300 hover:border-violet-400'
                          } ${recurringLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Date range for recurring */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-2">Start Date *</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                      disabled={recurringLocked}
                      required={isRecurring}
                      className={`w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none ${recurringLocked ? 'opacity-60' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-2">End Date *</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                      min={formData.startDate || undefined}
                      disabled={recurringLocked}
                      required={isRecurring}
                      className={`w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none ${recurringLocked ? 'opacity-60' : ''}`}
                    />
                  </div>
                </div>

                {/* Occurrence preview */}
                {occurrencePreview > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl px-5 py-3"
                  >
                    <Info size={15} className="text-violet-400 flex-shrink-0" />
                    <p className="text-sm text-violet-300">
                      <span className="font-bold text-white">{occurrencePreview} occurrence{occurrencePreview !== 1 ? 's' : ''}</span> will be scheduled on {weekdays.join(', ')}.
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Activity Type + Priority (existing, unchanged) */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs text-gray-400 block mb-2">Activity Type</label>
                <select
                  value={formData.activityType}
                  onChange={e => handleTypeChange(e.target.value)}
                  className={selectClass}
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
                  onChange={e => setFormData({ ...formData, priority: e.target.value })}
                  className={selectClass}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            {/* Dates (existing, only shown when NOT recurring — recurring
                has its own date pickers above) */}
            {!isRecurring && !isDaily && (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-gray-400 block mb-2">
                    {isWeekly ? 'Start Date (optional)' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
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
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none"
                  />
                </div>
              </div>
            )}

            {isDaily && !isRecurring && (
              <p className="text-xs text-gray-400 -mt-2">
                Daily activities don't use start/end dates — you'll get a reminder every day until it's marked Completed.
              </p>
            )}

            {/* Weekly reminder days (existing, unchanged) */}
            {isWeekly && !isRecurring && (
              <div>
                <label className="text-xs text-gray-400 block mb-2">Repeats on these days *</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(day => {
                    const active = reminderDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() =>
                          setReminderDays(prev =>
                            prev.includes(day.value)
                              ? prev.filter(d => d !== day.value)
                              : [...prev, day.value],
                          )
                        }
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

            {/* Attachments (unchanged) */}
            <div>
              <label className="text-xs text-gray-400 block mb-2">Attachments</label>
              <input
                type="file"
                multiple
                onChange={e => setAttachments(Array.from(e.target.files || []))}
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-white focus:border-violet-400 outline-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-6">
              <button
                type="submit"
                disabled={submitting || (isWeekly && !isRecurring && reminderDays.length === 0)}
                className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-semibold"
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {isEditMode ? 'Update Activity' : 'Create Activity'}
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