import React, { useState, useEffect } from 'react';
import {
  getPendingApprovals,
  approveAssignedTask,
  rejectAssignedTask,
} from '../../api/client';

interface TaskUser {
  _id:   string;
  name:  string;
  email: string;
}

interface PendingTask {
  _id:            string;
  title:          string;
  description?:   string;
  status:         string;
  priority?:      string;
  project?:       { _id: string; name: string };
  dueDate?:       string | null;
  assigner:       TaskUser | null;
  assignee:       TaskUser | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalNote?:  string;
  createdAt:      string;
}

type HandledTask = PendingTask & { decision: 'approved' | 'rejected' };

const fmt = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const initials = (name?: string) =>
  (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const normalise = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const v = o.data ?? o.tasks;
    if (Array.isArray(v)) return v;
  }
  return [];
};

const PRIORITY_COLOR: Record<string, string> = {
  Low: 'var(--priority-low)', Medium: 'var(--priority-medium)', High: 'var(--priority-high)',
};

// ─── Approval Card ────────────────────────────────────────────────────────────

const ApprovalCard: React.FC<{
  task:      PendingTask;
  onApprove: (id: string, note: string) => Promise<void>;
  onReject:  (id: string, note: string) => Promise<void>;
}> = ({ task, onApprove, onReject }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [act,  setAct]  = useState<'approve' | 'reject' | null>(null);

  const go = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !note.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }
    setBusy(true); setAct(action);
    try {
      if (action === 'approve') await onApprove(task._id, note);
      else                       await onReject(task._id,  note);
    } finally { setBusy(false); setAct(null); }
  };

  const pc = task.priority ? PRIORITY_COLOR[task.priority] : null;

  return (
    <div
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderLeft: '4px solid var(--color-warning)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', transition: 'box-shadow 0.2s' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'}
    >
      <div style={{ padding: 20 }}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
            ⏳ Pending Approval
          </span>
          {task.project && (
            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 999, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}>
              {task.project.name}
            </span>
          )}
          {pc && task.priority && (
            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 999, background: pc + '18', color: pc, textTransform: 'capitalize' }}>
              {task.priority}
            </span>
          )}
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>
          {task.title}
        </h3>

        {task.description && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
            {task.description.length > 120 ? task.description.slice(0, 120) + '…' : task.description}
          </p>
        )}

        {/* Who → whom */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14, background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', marginBottom: 16, border: '1px solid var(--border-default)' }}>
          {[
            { label: 'Requested By', person: task.assigner },
            { label: 'Assigned To',  person: task.assignee },
          ].map(({ label, person }) => (
            <div key={label}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                {label}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {initials(person?.name)}
                </div>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, fontSize: 13 }}>
                    {person?.name || '—'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{person?.email}</p>
                </div>
              </div>
            </div>
          ))}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Due Date</p>
            <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>{fmt(task.dueDate)}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Requested On</p>
            <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>{fmt(task.createdAt)}</p>
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Comment / Note{' '}
            <span style={{ color: 'var(--color-danger)' }}>* required for rejection</span>
          </label>
          <textarea
            className="tm-textarea"
            placeholder="Add feedback for the requester…"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ minHeight: 70, fontSize: 13 }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={() => go('reject')}
            disabled={busy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1 }}
          >
            ✕ {busy && act === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            onClick={() => go('approve')}
            disabled={busy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.8 : 1 }}
          >
            ✓ {busy && act === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

interface TaskApprovalQueueProps {
  currentUser: { _id: string; name: string; role: string };
}

const TaskApprovalQueue: React.FC<TaskApprovalQueueProps> = ({ currentUser }) => {
  const [tasks,   setTasks]   = useState<PendingTask[]>([]);
  const [handled, setHandled] = useState<HandledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState('');

  const isPrivileged = currentUser.role === 'admin' || currentUser.role === 'manager';

  useEffect(() => {
    if (!isPrivileged) { setLoading(false); return; }
    getPendingApprovals()
      .then(r => setTasks(normalise(r.data) as PendingTask[]))
      .catch(e => {
        setFetchErr(e?.response?.data?.msg || e?.message || 'Failed to load queue');
        console.error('[TaskApproval] fetch error:', e);
      })
      .finally(() => setLoading(false));
  }, [isPrivileged]);

  const handleApprove = async (id: string, note: string) => {
    const res  = await approveAssignedTask(id, note);
    const orig = tasks.find(t => t._id === id);
    if (orig) setHandled(prev => [{ ...orig, ...res.data, decision: 'approved' }, ...prev]);
    setTasks(prev => prev.filter(t => t._id !== id));
  };

  const handleReject = async (id: string, note: string) => {
    const res  = await rejectAssignedTask(id, note);
    const orig = tasks.find(t => t._id === id);
    if (orig) setHandled(prev => [{ ...orig, ...res.data, decision: 'rejected' }, ...prev]);
    setTasks(prev => prev.filter(t => t._id !== id));
  };

  if (!isPrivileged) {
    return (
      <div className="tm-page">
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '80px 24px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.35 }}>🔒</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Access Restricted</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Only managers and admins can access the approval queue.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="tm-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 14 }}>
        <div className="tm-spinner" />
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading approval queue…</span>
      </div>
    );
  }

  const approved = handled.filter(t => t.decision === 'approved').length;
  const rejected = handled.filter(t => t.decision === 'rejected').length;

  return (
    <div className="tm-page">
      <div className="tm-page-header">
        <div>
          <h1 className="tm-page-title">Task Approval Queue</h1>
          <p className="tm-page-subtitle">
            Review peer-assigned tasks before they become visible to the assignee
          </p>
        </div>
        {tasks.length > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', border: '1px solid var(--color-warning)' }}>
            {tasks.length} awaiting review
          </span>
        )}
      </div>

      {fetchErr && (
        <div style={{ padding: '12px 16px', marginBottom: 20, fontSize: 13, background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger-text)' }}>
          ⚠ {fetchErr}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Pending Review', value: tasks.length, color: 'var(--color-warning)', icon: '⏳' },
          { label: 'Approved Today', value: approved,     color: 'var(--color-success)', icon: '✓'  },
          { label: 'Rejected Today', value: rejected,     color: 'var(--color-danger)',  icon: '✕'  },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 22, marginBottom: 8, color: s.color }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Queue */}
      {tasks.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '80px 24px', textAlign: 'center', boxShadow: 'var(--shadow-sm)', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.35 }}>🎉</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Queue is clear!</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No peer-assigned tasks waiting for your review.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16, marginBottom: 32 }}>
          {tasks.map(t => (
            <ApprovalCard key={t._id} task={t} onApprove={handleApprove} onReject={handleReject} />
          ))}
        </div>
      )}

      {/* Handled log */}
      {handled.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
            Recently Handled · {handled.length}
          </h2>
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)' }}>
                  {['Task','Requested By','Assigned To','Decision'].map(h => (
                    <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', textAlign: 'left', borderBottom: '1px solid var(--border-default)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {handled.map((t, i) => (
                  <tr key={`h-${t._id}-${i}`} style={{ borderBottom: i < handled.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                    <td style={{ padding: '13px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{t.title}</td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{t.assigner?.name || '—'}</td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{t.assignee?.name || '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: t.decision === 'approved' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)', color: t.decision === 'approved' ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
                        {t.decision === 'approved' ? '✓ Approved' : '✕ Rejected'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskApprovalQueue;