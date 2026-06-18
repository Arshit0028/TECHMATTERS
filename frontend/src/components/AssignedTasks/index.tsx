import React, { useState, useEffect, useCallback } from 'react';
import {
  getAllMyAssignedTasks,
  createAssignedTask,
  updateAssignedTaskStatus,
  getProjects,
  getAllEmployees,
  type CreateAssignedTaskPayload,
  type AssignedTaskStatus,
} from '../../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskUser {
  _id:   string;
  name:  string;
  email: string;
}

interface AssignedTask {
  _id:            string;
  title:          string;
  description?:   string;
  status:         AssignedTaskStatus;
  priority:       'Low' | 'Medium' | 'High';
  project?:       { _id: string; name: string } | null;
  dueDate?:       string | null;
  assigner?:      TaskUser | null;
  assignee?:      TaskUser | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalNote?:  string;
  createdAt:      string;
}

interface Project  { _id: string; name: string }
interface Employee { _id: string; name: string; email: string }

type TabKey = 'received' | 'outgoing' | 'pending' | 'completed' | 'rejected';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const isOverdue = (t: AssignedTask) => {
  if (!t.dueDate || t.status === 'Done') return false;
  return new Date(t.dueDate) < new Date();
};

const normaliseList = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const v = o.data ?? o.tasks ?? o.users ?? o.projects;
    if (Array.isArray(v)) return v;
  }
  return [];
};

const initials = (name?: string) =>
  (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const APPROVAL_CFG = {
  approved: { label: '✓ Approved',         bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', border: 'var(--color-success)' },
  pending:  { label: '⏳ Pending Approval', bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', border: 'var(--color-warning)' },
  rejected: { label: '✕ Rejected',          bg: 'var(--color-danger-bg)',  color: 'var(--color-danger-text)',  border: 'var(--color-danger)'  },
} as const;

const STATUS_COLOR: Record<string, string> = {
  'To Do':      'var(--text-tertiary)',
  'In Progress':'var(--color-warning)',
  'Done':       'var(--color-success)',
};

const PRIORITY_COLOR: Record<string, { bg: string; color: string }> = {
  Low:    { bg: 'var(--priority-low-bg)',    color: 'var(--priority-low)'    },
  Medium: { bg: 'var(--priority-medium-bg)', color: 'var(--priority-medium)' },
  High:   { bg: 'var(--priority-high-bg)',   color: 'var(--priority-high)'   },
};

// ─── Card shell ───────────────────────────────────────────────────────────────

const CardShell: React.FC<{ accent: string; children: React.ReactNode }> = ({ accent, children }) => (
  <div
    style={{
      background:   'var(--bg-surface)',
      border:       '1px solid var(--border-default)',
      borderLeft:   `4px solid ${accent}`,
      borderRadius: 'var(--radius-lg)',
      boxShadow:    'var(--shadow-sm)',
      transition:   'box-shadow 0.2s, transform 0.15s',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
      (e.currentTarget as HTMLDivElement).style.transform = 'none';
    }}
  >
    <div style={{ padding: 20 }}>{children}</div>
  </div>
);

// ─── Assign Modal ─────────────────────────────────────────────────────────────

const AssignModal: React.FC<{
  projects:    Project[];
  employees:   Employee[];
  currentUser: { _id: string; name: string };
  onClose:     () => void;
  onDone:      () => void;
}> = ({ projects, employees, currentUser, onClose, onDone }) => {
  const [title,    setTitle]    = useState('');
  const [desc,     setDesc]     = useState('');
  const [project,  setProject]  = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState<'Low'|'Medium'|'High'>('Medium');
  const [dueDate,  setDueDate]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const others = employees.filter(e => e._id !== currentUser._id);

  const submit = async () => {
    if (!title.trim()) { setError('Title is required');         return; }
    if (!project)      { setError('Please select a project');   return; }
    if (!assignee)     { setError('Please select an assignee'); return; }
    setError('');
    setLoading(true);
    try {
      const payload: CreateAssignedTaskPayload = {
        title:    title.trim(),
        project,
        assignee,
        priority,
        ...(desc    && { description: desc.trim() }),
        ...(dueDate && { dueDate }),
      };
      await createAssignedTask(payload);
      onDone();
      onClose();
    } catch (e: any) {
      setError(
        e?.response?.data?.msg     ||
        e?.response?.data?.message ||
        e?.message                 ||
        'Failed to assign task'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tm-modal" style={{ maxWidth: 540 }}>

        <div className="tm-modal-header">
          <div>
            <h3 className="tm-modal-title">Assign Task to Teammate</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              Goes to a manager for approval before the assignee sees it.
            </p>
          </div>
          <button className="tm-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="tm-modal-body">
          {/* Flow banner */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 14px', marginBottom: 18,
            background: 'var(--color-info-bg)',
            border: '1px solid var(--color-info)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13, color: 'var(--color-info-text)',
          }}>
            <span style={{ flexShrink: 0 }}>ℹ️</span>
            <span>
              <strong>Flow:</strong> You assign → Manager approves → Assignee sees the task.
              Track status in the <strong>I Assigned</strong> tab.
            </span>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: 16, fontSize: 13,
              background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)',
              borderRadius: 'var(--radius-md)',
            }}>
              ⚠ {error}
            </div>
          )}

          <div className="tm-form-group">
            <label className="tm-label">Task Title *</label>
            <input
              className="tm-input"
              placeholder="What needs to be done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="tm-form-group">
            <label className="tm-label">Description</label>
            <textarea
              className="tm-textarea"
              placeholder="Add context, acceptance criteria…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              style={{ minHeight: 80 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="tm-form-group">
              <label className="tm-label">Project *</label>
              <select className="tm-select" value={project} onChange={e => { setProject(e.target.value); setError(''); }}>
                <option value="">Select project</option>
                {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>

            <div className="tm-form-group">
              <label className="tm-label">Assign To *</label>
              <select className="tm-select" value={assignee} onChange={e => { setAssignee(e.target.value); setError(''); }}>
                <option value="">Select teammate</option>
                {others.map(u => (
                  <option key={u._id} value={u._id}>
                    {u.name || u.email?.split('@')[0]}
                  </option>
                ))}
              </select>
              {others.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--color-warning)', marginTop: 4 }}>
                  No other team members found.
                </p>
              )}
            </div>

            <div className="tm-form-group">
              <label className="tm-label">Priority</label>
              <select className="tm-select" value={priority} onChange={e => setPriority(e.target.value as any)}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div className="tm-form-group">
              <label className="tm-label">Due Date (optional)</label>
              <input
                className="tm-input" type="date" value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="tm-modal-footer">
          <button className="tm-btn tm-btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="tm-btn tm-btn-primary"
            onClick={submit}
            disabled={loading || !title.trim() || !project || !assignee}
          >
            {loading ? 'Assigning…' : '📤 Assign Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Received Card ────────────────────────────────────────────────────────────

const ReceivedCard: React.FC<{
  task:     AssignedTask;
  onUpdate: (id: string, status: AssignedTaskStatus) => void;
}> = ({ task, onUpdate }) => {
  const od  = isOverdue(task);
  const sc  = STATUS_COLOR[task.status]     || 'var(--text-tertiary)';
  const pc  = PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.Medium;

  return (
    <CardShell accent={od ? 'var(--color-danger)' : 'var(--color-success)'}>
      {task.project && (
        <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}>
          {task.project.name}
        </span>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, flex: 1 }}>
          {task.title}
        </h3>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: sc + '20', color: sc, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {task.status}
        </span>
      </div>

      {task.description && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
          {task.description.length > 130 ? task.description.slice(0, 130) + '…' : task.description}
        </p>
      )}

      <div style={{
        display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-tertiary)',
        padding: '10px 0',
        borderTop: '1px solid var(--border-default)',
        borderBottom: '1px solid var(--border-default)',
        marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: pc.bg, color: pc.color }}>
          {task.priority}
        </span>
        {task.dueDate && (
          <span style={{ color: od ? 'var(--color-danger)' : 'inherit' }}>
            {od ? '⚠️' : '🗓'}{' '}
            <strong style={{ color: od ? 'var(--color-danger)' : 'var(--text-secondary)' }}>Due:</strong>{' '}
            {fmt(task.dueDate)}
          </span>
        )}
        {task.assigner && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials(task.assigner.name)}
            </div>
            <strong style={{ color: 'var(--text-secondary)' }}>Assigned by:</strong> {task.assigner.name}
          </span>
        )}
        <span>📅 {fmt(task.createdAt)}</span>
      </div>

      {task.approvalNote && (
        <div style={{ padding: '8px 12px', marginBottom: 12, fontSize: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-success-bg)', color: 'var(--color-success-text)' }}>
          <strong>Manager note:</strong> {task.approvalNote}
        </div>
      )}

      {/* Status actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {task.status === 'To Do' && (
          <button className="tm-btn tm-btn-primary tm-btn-sm" onClick={() => onUpdate(task._id, 'In Progress')}>
            ▶ Start Working
          </button>
        )}
        {task.status === 'In Progress' && (
          <button
            className="tm-btn tm-btn-sm"
            style={{ background: 'var(--color-success)', color: '#fff' }}
            onClick={() => onUpdate(task._id, 'Done')}
          >
            ✓ Mark Done
          </button>
        )}
        {task.status === 'Done' && (
          <button className="tm-btn tm-btn-secondary tm-btn-sm" onClick={() => onUpdate(task._id, 'In Progress')}>
            ↩ Re-open
          </button>
        )}
      </div>
    </CardShell>
  );
};

// ─── Outgoing Card ────────────────────────────────────────────────────────────

const OutgoingCard: React.FC<{ task: AssignedTask }> = ({ task }) => {
  const appr = APPROVAL_CFG[task.approvalStatus];
  const sc   = STATUS_COLOR[task.status] || 'var(--text-tertiary)';

  return (
    <CardShell accent={appr.border}>
      {task.project && (
        <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}>
          {task.project.name}
        </span>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, flex: 1 }}>
          {task.title}
        </h3>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: appr.bg, color: appr.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {appr.label}
        </span>
      </div>

      {task.description && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
          {task.description.length > 130 ? task.description.slice(0, 130) + '…' : task.description}
        </p>
      )}

      <div style={{
        display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-tertiary)',
        padding: '10px 0',
        borderTop: '1px solid var(--border-default)',
        borderBottom: task.approvalNote ? '1px solid var(--border-default)' : 'none',
        marginBottom: task.approvalNote ? 12 : 0, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {task.assignee && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials(task.assignee.name)}
            </div>
            <strong style={{ color: 'var(--text-secondary)' }}>Assigned to:</strong> {task.assignee.name}
          </span>
        )}
        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: sc + '20', color: sc }}>
          {task.status}
        </span>
        {task.dueDate && <span>🗓 <strong style={{ color: 'var(--text-secondary)' }}>Due:</strong> {fmt(task.dueDate)}</span>}
        <span>📅 {fmt(task.createdAt)}</span>
      </div>

      {task.approvalNote && (
        <div style={{ padding: '8px 12px', marginTop: 12, fontSize: 12, borderRadius: 'var(--radius-md)', background: task.approvalStatus === 'rejected' ? 'var(--color-danger-bg)' : 'var(--color-success-bg)', color: task.approvalStatus === 'rejected' ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>
          <strong>Manager note:</strong> {task.approvalNote}
        </div>
      )}

      {task.approvalStatus === 'pending' && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', fontSize: 12 }}>
          ⏳ Waiting for manager approval — assignee cannot see this yet.
        </div>
      )}
    </CardShell>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

interface AssignedTasksProps {
  currentUser: { _id: string; name: string; role: string };
}

const AssignedTasks: React.FC<AssignedTasksProps> = ({ currentUser }) => {
  const [received,  setReceived]  = useState<AssignedTask[]>([]);
  const [outgoing,  setOutgoing]  = useState<AssignedTask[]>([]);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [fetchErr,  setFetchErr]  = useState('');
  const [showModal, setShowModal] = useState(false);
  const [tab,       setTab]       = useState<TabKey>('received');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setFetchErr('');
    try {
      const res  = await getAllMyAssignedTasks();
      const data = res.data;
      setReceived(Array.isArray(data.received) ? data.received : []);
      setOutgoing(Array.isArray(data.outgoing) ? data.outgoing : []);
    } catch (e: any) {
      setFetchErr(e?.response?.data?.msg || e?.message || 'Failed to load tasks');
      console.error('[AssignedTasks] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    // Projects for modal
    getProjects()
      .then(r => {
        const list = normaliseList(r.data) as any[];
        setProjects(list.map(p => ({ _id: p._id, name: p.name || p.title || '' })));
      })
      .catch(console.error);

    // Employees for modal
    getAllEmployees()
      .then(users => {
        setEmployees(users.map(u => ({
          _id:   u._id,
          name:  (u as any).name  || '',
          email: (u as any).email || '',
        })));
      })
      .catch(console.error);
  }, [fetchAll]);

  // ── Status update ─────────────────────────────────────────────────────────
  const statusUpdate = async (id: string, status: AssignedTaskStatus) => {
    try {
      const r = await updateAssignedTaskStatus(id, status);
      setReceived(prev => prev.map(t => t._id === id ? { ...t, ...r.data } : t));
    } catch (e: any) {
      console.error('[AssignedTasks] status update failed:', e?.response?.data || e);
    }
  };

  // ── Categorise ─────────────────────────────────────────────────────────────
  const active    = received.filter(t => t.status !== 'Done');
  const completed = received.filter(t => t.status === 'Done');
  const pending   = outgoing.filter(t => t.approvalStatus === 'pending');
  const rejected  = outgoing.filter(t => t.approvalStatus === 'rejected');

  const tabConfig: { key: TabKey; label: string; count: number; icon: string }[] = [
    { key: 'received',  label: 'Assigned to Me',  count: active.length,    icon: '📥' },
    { key: 'outgoing',  label: 'I Assigned',       count: outgoing.length,  icon: '📤' },
    { key: 'pending',   label: 'Pending Approval', count: pending.length,   icon: '⏳' },
    { key: 'completed', label: 'Completed',        count: completed.length, icon: '✓'  },
    { key: 'rejected',  label: 'Rejected',         count: rejected.length,  icon: '✕'  },
  ];

  const displayMap: Record<TabKey, AssignedTask[]> = {
    received: active, outgoing, pending, completed, rejected,
  };

  const emptyMap: Record<TabKey, { icon: string; title: string; desc: string }> = {
    received:  { icon: '📥', title: 'No tasks assigned to you',  desc: 'Tasks approved by a manager will appear here.'         },
    outgoing:  { icon: '📤', title: 'No tasks assigned out yet', desc: 'Click "+ Assign Task to Teammate" to get started.'     },
    pending:   { icon: '⏳', title: 'No tasks pending approval', desc: 'All your assigned tasks have been reviewed.'            },
    completed: { icon: '🎉', title: 'No completed tasks yet',    desc: 'Tasks you mark as Done appear here.'                   },
    rejected:  { icon: '❌', title: 'No rejected tasks',         desc: 'Tasks rejected by your manager will appear here.'      },
  };

  if (loading) {
    return (
      <div className="tm-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 14 }}>
        <div className="tm-spinner" />
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading tasks…</span>
      </div>
    );
  }

  const displayed = displayMap[tab];
  const empty     = emptyMap[tab];

  return (
    <div className="tm-page">
      {/* Header */}
      <div className="tm-page-header">
        <div>
          <h1 className="tm-page-title">My Tasks</h1>
          <p className="tm-page-subtitle">
            Tasks assigned to you · Tasks you have assigned to teammates
          </p>
        </div>
        <button className="tm-btn tm-btn-primary" onClick={() => setShowModal(true)}>
          + Assign Task to Teammate
        </button>
      </div>

      {/* Error */}
      {fetchErr && (
        <div style={{ padding: '12px 16px', marginBottom: 20, fontSize: 13, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>⚠ {fetchErr}</span>
          <button onClick={fetchAll} style={{ background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Assigned to Me',   value: active.length,    color: 'var(--color-info)',    icon: '📥' },
          { label: 'I Assigned Out',   value: outgoing.length,  color: 'var(--color-primary)', icon: '📤' },
          { label: 'Pending Approval', value: pending.length,   color: 'var(--color-warning)', icon: '⏳' },
          { label: 'Completed',        value: completed.length, color: 'var(--color-success)', icon: '✓'  },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 22, marginBottom: 8, color: s.color }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 3, marginBottom: 20, width: 'fit-content' }}>
        {tabConfig.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '7px 14px',
              borderRadius: 'calc(var(--radius-md) - 2px)',
              border: 'none', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.13s',
              background: tab === t.key ? 'var(--bg-surface)'    : 'transparent',
              color:      tab === t.key ? 'var(--color-primary)'  : 'var(--text-secondary)',
              boxShadow:  tab === t.key ? 'var(--shadow-xs)'      : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {t.icon} {t.label}
            {t.count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: tab === t.key ? 'var(--color-primary)' : 'var(--bg-surface-3)', color: tab === t.key ? '#fff' : 'var(--text-secondary)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Banners */}
      {tab === 'outgoing' && outgoing.length > 0 && (
        <div style={{ padding: '12px 16px', marginBottom: 20, fontSize: 13, background: 'var(--color-info-bg)', border: '1px solid var(--color-info)', borderRadius: 'var(--radius-md)', color: 'var(--color-info-text)', display: 'flex', gap: 8 }}>
          📤 Tasks you assigned — pending ones need manager approval before the assignee can see them.
        </div>
      )}
      {tab === 'pending' && pending.length > 0 && (
        <div style={{ padding: '12px 16px', marginBottom: 20, fontSize: 13, background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-md)', color: 'var(--color-warning-text)', display: 'flex', gap: 8 }}>
          ⏳ These tasks are awaiting manager approval — the assignee cannot see them yet.
        </div>
      )}

      {/* Cards */}
      {displayed.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '80px 24px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.35 }}>{empty.icon}</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{empty.title}</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>{empty.desc}</p>
          {(tab === 'received' || tab === 'outgoing') && (
            <button className="tm-btn tm-btn-primary" onClick={() => setShowModal(true)}>
              + Assign a Task to Someone
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {displayed.map(t =>
            tab === 'outgoing' || tab === 'pending' || tab === 'rejected'
              ? <OutgoingCard key={t._id} task={t} />
              : <ReceivedCard key={t._id} task={t} onUpdate={statusUpdate} />
          )}
        </div>
      )}

      {showModal && (
        <AssignModal
          projects={projects}
          employees={employees}
          currentUser={currentUser}
          onClose={() => setShowModal(false)}
          onDone={fetchAll}
        />
      )}
    </div>
  );
};

export default AssignedTasks;