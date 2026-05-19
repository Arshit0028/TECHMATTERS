// src/components/Tasks/TaskForm.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getTask, createTask, updateTask, getProjects, getUsers } from '../../api/client';
import type { Project, User, Task } from '../types/index';
import { Save, X, Upload, Trash2, AlertCircle, Download } from 'lucide-react';

// ─── Toast Notification (production note: replace with react-hot-toast in real app) ──────────────────────────────────────────────────────
const notify = (message: string, type: 'success' | 'error' = 'success') => {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;padding:16px 24px;border-radius:12px;
    font-size:14px;font-weight:500;box-shadow:0 10px 30px rgba(0,0,0,0.3);
    z-index:9999;transition:all 0.3s;display:flex;align-items:center;gap:10px;
    ${type === 'success' ? 'background:#34d399;color:#fff;' : 'background:#f87171;color:#fff;'}
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
};

// ─── Validation ───────────────────────────────────────────────────────────────
interface FormErrors {
  title?: string;
  project?: string;
  endDate?: string;
}

const validate = (formData: typeof INITIAL_FORM): FormErrors => {
  const errors: FormErrors = {};
  if (!formData.title.trim()) errors.title = 'Title is required';
  if (!formData.project) errors.project = 'Project is required';
  if (formData.startDate && formData.endDate && new Date(formData.endDate) < new Date(formData.startDate)) {
    errors.endDate = 'End date must be after start date';
  }
  return errors;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const INITIAL_FORM = {
  title: '',
  description: '',
  project: '',
  assignee: '',
  startDate: '',
  endDate: '',
  priority: 'Medium' as 'Low' | 'Medium' | 'High',
  status: 'To Do' as 'To Do' | 'In Progress' | 'Review' | 'Done',
};

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const extractProjects = (res: any): Project[] => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.projects)) return res.projects;
  if (Array.isArray(res.data?.projects)) return res.data.projects;
  return [];
};

const extractUsers = (res: any): User[] => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data?.users)) return res.data.users;
  if (Array.isArray(res.data)) return res.data;
  return [];
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ─── Component ────────────────────────────────────────────────────────────────
export const TaskForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]); // Task attachment objects
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState(INITIAL_FORM);

  // ── Load form data ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [projectsRes, usersRes] = await Promise.all([getProjects(), getUsers()]);
      setProjects(extractProjects(projectsRes));
      setUsers(extractUsers(usersRes));

      if (id) {
        const taskRes = await getTask(id);
        const task: Task = taskRes?.data ?? taskRes;
        setFormData({
          title: task.title || '',
          description: task.description || '',
          project: typeof task.project === 'string' ? task.project : task.project?._id || '',
          assignee: typeof task.assignee === 'string' ? task.assignee : task.assignee?._id || '',
          startDate: task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : '',
          endDate: task.endDate ? new Date(task.endDate).toISOString().split('T')[0] : '',
          priority: task.priority || 'Medium',
          status: task.status || 'To Do',
        });
        setExistingAttachments(task.attachments || []);
        setNewAttachments([]);
        setRemovedAttachmentIds([]);
      }
    } catch (err) {
      notify('Failed to load form data', 'error');
    } finally {
      setInitialLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Field helpers ───────────────────────────────────────────────────────────
  const setField = <K extends keyof typeof INITIAL_FORM>(key: K, value: typeof INITIAL_FORM[K]) => {
    const updated = { ...formData, [key]: value };
    setFormData(updated);
    if (touched[key]) {
      setFormErrors(validate(updated));
    }
  };

  const handleBlur = (key: string) => {
    setTouched(prev => ({ ...prev, [key]: true }));
    setFormErrors(validate(formData));
  };

  // ── Existing attachment removal ─────────────────────────────────────────────
  const removeExistingAttachment = (attachmentId: string) => {
    setExistingAttachments(prev => prev.filter(a => a._id !== attachmentId));
    setRemovedAttachmentIds(prev => [...prev, attachmentId]);
  };

  // ── File handling ───────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    const invalidType = files.find(f => !ALLOWED_TYPES.includes(f.type));
    if (invalidType) {
      notify(`"${invalidType.name}" has an unsupported file type`, 'error');
      e.target.value = '';
      return;
    }

    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      notify(`"${oversized.name}" exceeds the 10 MB limit`, 'error');
      e.target.value = '';
      return;
    }

    const combined = [...newAttachments, ...files];
    if (combined.length > MAX_FILES) {
      notify(`You can attach at most ${MAX_FILES} files`, 'error');
      e.target.value = '';
      return;
    }

    setNewAttachments(combined);
    e.target.value = ''; // reset input
  };

  const removeNewAttachment = (index: number) =>
    setNewAttachments(prev => prev.filter((_, i) => i !== index));

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched
    setTouched({ title: true, project: true, endDate: true });
    const errors = validate(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    const data = new FormData();
    data.append('title', formData.title.trim());
    data.append('description', formData.description.trim());
    data.append('project', formData.project);
    if (formData.assignee) data.append('assignee', formData.assignee);
    if (formData.startDate) data.append('startDate', formData.startDate);
    if (formData.endDate) data.append('endDate', formData.endDate);
    data.append('priority', formData.priority);
    data.append('status', formData.status);

    // New files
    newAttachments.forEach(file => data.append('attachments', file));

    // Removed existing attachments (only for updates)
    if (id && removedAttachmentIds.length > 0) {
      data.append('removedAttachments', JSON.stringify(removedAttachmentIds));
    }

    try {
      if (id) {
        await updateTask(id, data);
        notify('Task updated successfully');
      } else {
        await createTask(data);
        notify('Task created successfully');
      }
      navigate('/tasks');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.msg ||
        'Failed to save task';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-zinc-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading form...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .task-form-root {
          min-height: 100vh;
          background: #07080e;
          background-image:
            radial-gradient(ellipse 70% 50% at 88% 0%, rgba(124,58,237,0.11) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at 8% 100%, rgba(88,80,236,0.08) 0%, transparent 55%);
          padding: 2.75rem 1.75rem 6rem;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,0.84);
        }
        .field-error { color: #f87171; font-size: 12px; margin-top: 6px; display: flex; align-items: center; gap: 4px; }
        .input-error { border-color: #f87171 !important; }
      `}</style>

      <div className="task-form-root">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto"
        >
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-white">
              {id ? 'Edit Task' : 'Create New Task'}
            </h1>
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="p-2 hover:bg-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-colors"
            >
              <X size={22} />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-700 rounded-3xl p-8 space-y-8">

            {/* Title */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Task Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setField('title', e.target.value)}
                onBlur={() => handleBlur('title')}
                className={`w-full px-6 py-5 bg-zinc-800 border rounded-3xl outline-none text-white focus:border-violet-500 transition-colors ${formErrors.title && touched.title ? 'input-error' : 'border-zinc-700'}`}
                placeholder="Enter task title..."
                aria-invalid={!!formErrors.title}
              />
              {formErrors.title && touched.title && (
                <p className="field-error"><AlertCircle size={12} />{formErrors.title}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setField('description', e.target.value)}
                rows={5}
                placeholder="Describe the task..."
                className="w-full px-6 py-5 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white resize-y transition-colors"
              />
            </div>

            {/* Project + Assignee */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Project *</label>
                <select
                  value={formData.project}
                  onChange={e => setField('project', e.target.value)}
                  onBlur={() => handleBlur('project')}
                  className={`w-full px-6 py-5 bg-zinc-800 border rounded-3xl outline-none text-white focus:border-violet-500 transition-colors ${formErrors.project && touched.project ? 'input-error' : 'border-zinc-700'}`}
                >
                  <option value="">Select a project...</option>
                  {projects.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
                {formErrors.project && touched.project && (
                  <p className="field-error"><AlertCircle size={12} />{formErrors.project}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Assignee</label>
                <select
                  value={formData.assignee}
                  onChange={e => setField('assignee', e.target.value)}
                  className="w-full px-6 py-5 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white transition-colors"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Start Date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={e => setField('startDate', e.target.value)}
                  className="w-full px-6 py-5 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">End Date</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={e => setField('endDate', e.target.value)}
                  onBlur={() => handleBlur('endDate')}
                  min={formData.startDate || undefined}
                  className={`w-full px-6 py-5 bg-zinc-800 border rounded-3xl outline-none text-white focus:border-violet-500 transition-colors ${formErrors.endDate && touched.endDate ? 'input-error' : 'border-zinc-700'}`}
                />
                {formErrors.endDate && touched.endDate && (
                  <p className="field-error"><AlertCircle size={12} />{formErrors.endDate}</p>
                )}
              </div>
            </div>

            {/* Priority + Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={e => setField('priority', e.target.value as any)}
                  className="w-full px-6 py-5 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white transition-colors"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setField('status', e.target.value as any)}
                  className="w-full px-6 py-5 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-3xl outline-none text-white transition-colors"
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Review">Review</option>
                  <option value="Done">Done</option>
                </select>
              </div>
            </div>

            {/* Attachments Section */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2 flex items-center gap-2">
                <Upload size={16} /> Attachments
                <span className="text-zinc-600 text-xs ml-1">
                  (max {MAX_FILES} files, 10 MB each — PDF, Word, Excel, Images)
                </span>
              </label>

              {/* Existing Attachments (edit mode only) */}
              {id && existingAttachments.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs text-zinc-500 mb-3">CURRENT ATTACHMENTS</p>
                  <div className="space-y-3">
                    {existingAttachments.map((att) => (
                      <motion.div
                        key={att._id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex justify-between items-center bg-zinc-800 px-5 py-3 rounded-2xl text-sm border border-zinc-700"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="truncate text-white font-medium">{att.name}</span>
                        </div>
                        <div className="flex items-center gap-6">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-violet-400 hover:text-violet-300 text-xs font-medium"
                          >
                            <Download size={14} /> View
                          </a>
                          <button
                            type="button"
                            onClick={() => removeExistingAttachment(att._id)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                            aria-label={`Remove ${att.name}`}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload new attachments */}
              <label className="flex flex-col items-center justify-center w-full px-6 py-8 bg-zinc-800 border border-dashed border-zinc-700 hover:border-violet-500 rounded-3xl text-zinc-400 hover:text-violet-400 cursor-pointer transition-colors">
                <Upload size={24} className="mb-2" />
                <span className="text-sm font-medium">Click to upload or drag &amp; drop new files</span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                />
              </label>

              {/* New attachments preview */}
              {newAttachments.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-zinc-500 mb-3">NEW ATTACHMENTS TO BE ADDED</p>
                  {newAttachments.map((file, i) => (
                    <motion.div
                      key={`${file.name}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex justify-between items-center bg-zinc-800 px-5 py-3 rounded-2xl text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="truncate text-white">{file.name}</span>
                        <span className="text-zinc-500 shrink-0 text-xs">{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeNewAttachment(i)}
                        className="text-red-400 hover:text-red-300 ml-4 shrink-0 transition-colors"
                        aria-label={`Remove ${file.name}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-8">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed py-5 rounded-3xl font-semibold text-white flex items-center justify-center gap-3 transition-colors"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    {id ? 'Update Task' : 'Create Task'}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                className="flex-1 py-5 border border-zinc-700 hover:bg-zinc-800 rounded-3xl font-medium text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  );
};