// src/components/Reimbursements/ReimbursementDetail.tsx
// Updated: dark theme matching EmployeeMonthlyReport + AdminReportReview
// • SuperAdmin / Admin / Manager → can Approve, Reject, Mark Paid
// • Employee → read-only (status visible, no action buttons)
// • "View Monthly Report" link if the claim is attached to one

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getReimbursement, updateReimbursementStatus } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Reimbursement } from '../types/index';
import {
  ArrowLeft, Download, CheckCircle2, XCircle, Clock,
  DollarSign, Receipt, Calendar, FileText, AlertCircle, Loader2,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Pending:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.25)',  label: 'Pending'  },
  Approved: { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.25)',  label: 'Approved' },
  Rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)', label: 'Rejected' },
  Paid:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)',  label: 'Paid'     },
};

// ─── Component ────────────────────────────────────────────────────────────────
export const ReimbursementDetail: React.FC = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [claim,    setClaim]    = useState<Reimbursement | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error,    setError]    = useState('');
  const [toast,    setToast]    = useState('');

  const isPrivileged = ['super-admin', 'admin', 'manager'].includes(user?.accessLevel || '');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { loadClaim(); }, [id]);

  const loadClaim = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getReimbursement(id!);
      setClaim(res.data);
    } catch {
      setError('Could not load claim.');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: string, paymentStatus?: string) => {
    if (!window.confirm(`Mark this claim as "${status}"?`)) return;
    setUpdating(status);
    setError('');
    try {
      await updateReimbursementStatus(id!, { status, paymentStatus });
      await loadClaim();
      showToast(`✅ Claim marked as ${status}`);
    } catch {
      setError('Failed to update status. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const sm = claim ? (STATUS_META[claim.status] ?? STATUS_META['Pending']) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        .rd-root { min-height: 100vh; background: #0c0c16; font-family: 'DM Sans', sans-serif; padding: 2rem 1.5rem; }
        .rd-wrap { max-width: 760px; margin: 0 auto; }

        .rd-back { display: inline-flex; align-items: center; gap: 7px; color: rgba(255,255,255,0.35); font-size: 13px; cursor: pointer; border: none; background: none; font-family: 'DM Sans', sans-serif; transition: color 0.18s; padding: 0; margin-bottom: 1.5rem; }
        .rd-back:hover { color: rgba(255,255,255,0.72); }

        .rd-card { background: rgba(255,255,255,0.028); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; overflow: hidden; }

        /* Header band */
        .rd-header { padding: 24px 28px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .rd-title-wrap {}
        .rd-eyebrow { font-size: 9px; font-family: 'DM Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(167,139,250,0.55); margin-bottom: 6px; }
        .rd-title { font-family: 'Syne', sans-serif; font-size: 1.55rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; line-height: 1.2; }
        .rd-date  { font-size: 11px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; margin-top: 6px; }

        /* Stats strip */
        .rd-pills { display: flex; gap: 10px; flex-wrap: wrap; padding: 16px 28px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .rd-pill  { display: flex; flex-direction: column; align-items: center; padding: 10px 14px; border-radius: 12px; min-width: 64px; }
        .rd-pill-val { font-family: 'Syne', sans-serif; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; }
        .rd-pill-lbl { font-size: 9.5px; font-family: 'DM Mono', monospace; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(255,255,255,0.28); margin-top: 3px; }

        /* Body */
        .rd-body { padding: 24px 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 540px) { .rd-body { grid-template-columns: 1fr; } }
        .rd-field-lbl { font-size: 9.5px; font-family: 'DM Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 5px; }
        .rd-field-val { font-size: 13.5px; color: rgba(255,255,255,0.78); }

        /* Description */
        .rd-desc-wrap { padding: 0 28px 20px; }
        .rd-desc { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 13px; padding: 14px 16px; font-size: 13.5px; color: rgba(255,255,255,0.65); line-height: 1.65; }

        /* Receipts */
        .rd-receipts { padding: 0 28px 20px; }
        .rd-receipt-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 15px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: rgba(255,255,255,0.6); font-size: 12px; text-decoration: none; transition: all 0.18s; margin: 4px; }
        .rd-receipt-btn:hover { background: rgba(255,255,255,0.08); color: #fff; border-color: rgba(255,255,255,0.15); }

        /* Monthly report link */
        .rd-report-link { display: flex; align-items: center; gap: 8px; margin: 0 28px 20px; padding: 12px 15px; background: rgba(167,139,250,0.06); border: 1px solid rgba(167,139,250,0.15); border-radius: 12px; color: rgba(167,139,250,0.8); font-size: 12.5px; cursor: pointer; transition: all 0.18s; }
        .rd-report-link:hover { background: rgba(167,139,250,0.11); color: #c4b5fd; }

        /* Action section */
        .rd-actions { padding: 20px 28px; border-top: 1px solid rgba(255,255,255,0.06); }
        .rd-actions-lbl { font-size: 9.5px; font-family: 'DM Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 12px; }
        .rd-btn { display: inline-flex; align-items: center; gap: 7px; padding: 11px 22px; border-radius: 11px; font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; border: none; transition: all 0.2s; }
        .rd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .rd-btn-approve { background: rgba(52,211,153,0.12); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
        .rd-btn-approve:hover:not(:disabled) { background: rgba(52,211,153,0.2); }
        .rd-btn-reject  { background: rgba(248,113,113,0.10); color: #f87171; border: 1px solid rgba(248,113,113,0.25); }
        .rd-btn-reject:hover:not(:disabled) { background: rgba(248,113,113,0.18); }
        .rd-btn-paid    { background: rgba(96,165,250,0.10); color: #60a5fa; border: 1px solid rgba(96,165,250,0.25); }
        .rd-btn-paid:hover:not(:disabled) { background: rgba(96,165,250,0.18); }

        /* Employee read-only notice */
        .rd-readonly { display: flex; align-items: center; gap: 9px; padding: 12px 15px; background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.15); border-radius: 11px; font-size: 12.5px; color: rgba(251,191,36,0.75); margin: 0 28px 20px; }

        /* Error */
        .rd-error { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.18); border-radius: 10px; color: #fca5a5; font-size: 12.5px; margin: 0 28px 16px; }

        /* Toast */
        .rd-toast { position: fixed; bottom: 2rem; right: 1.5rem; background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 18px; font-size: 13px; color: rgba(255,255,255,0.85); box-shadow: 0 8px 32px rgba(0,0,0,0.45); z-index: 999; font-family: 'DM Sans', sans-serif; }

        /* Loader */
        .rd-loader { min-height: 60vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; }
        .rd-spin { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(167,139,250,0.15); border-top-color: #a78bfa; animation: rd-spin 0.9s linear infinite; }
        @keyframes rd-spin { to { transform: rotate(360deg); } }

        .btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
      `}</style>

      <div className="rd-root">
        <div className="rd-wrap">
          <button className="rd-back" onClick={() => navigate('/reimbursements')}>
            <ArrowLeft size={16} /> Back to Claims
          </button>

          {loading ? (
            <div className="rd-loader">
              <div className="rd-spin" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Loading claim…</span>
            </div>
          ) : !claim ? (
            <div style={{ textAlign: 'center', color: '#f87171', padding: '4rem 0', fontSize: 14 }}>
              Claim not found or could not be loaded.
            </div>
          ) : (
            <motion.div className="rd-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>

              {/* Header */}
              <div className="rd-header">
                <div className="rd-title-wrap">
                  <div className="rd-eyebrow">Expense Claim</div>
                  <div className="rd-title">{claim.title}</div>
                  <div className="rd-date">Expense date: {fmt(claim.expenseDate)}</div>
                </div>
                {sm && (
                  <span style={{
                    padding: '5px 14px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                    background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {sm.label}
                  </span>
                )}
              </div>

              {/* Stats pills */}
              <div className="rd-pills">
                <div className="rd-pill" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.18)' }}>
                  <span className="rd-pill-val" style={{ color: '#fb923c' }}>₹{(claim.amount || 0).toLocaleString('en-IN')}</span>
                  <span className="rd-pill-lbl">Amount</span>
                </div>
                {sm && (
                  <div className="rd-pill" style={{ background: sm.bg, border: `1px solid ${sm.border}` }}>
                    <span className="rd-pill-val" style={{ color: sm.color, fontSize: '0.95rem' }}>{sm.label}</span>
                    <span className="rd-pill-lbl">Status</span>
                  </div>
                )}
                {(claim as any).receipts?.length > 0 && (
                  <div className="rd-pill" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.18)' }}>
                    <span className="rd-pill-val" style={{ color: '#a78bfa' }}>{(claim as any).receipts.length}</span>
                    <span className="rd-pill-lbl">Receipts</span>
                  </div>
                )}
              </div>

              {/* Fields grid */}
              <div className="rd-body">
                <div>
                  <div className="rd-field-lbl">Employee</div>
                  <div className="rd-field-val">{(claim as any).employee?.name || '—'}</div>
                </div>
                <div>
                  <div className="rd-field-lbl">Submitted To</div>
                  <div className="rd-field-val">{(claim as any).submittedTo?.name || '—'}</div>
                </div>
                <div>
                  <div className="rd-field-lbl">Project</div>
                  <div className="rd-field-val">{(claim as any).project?.name || 'Not linked'}</div>
                </div>
                <div>
                  <div className="rd-field-lbl">Submitted On</div>
                  <div className="rd-field-val">{fmt((claim as any).createdAt)}</div>
                </div>
              </div>

              {/* Description */}
              {claim.description && (
                <div className="rd-desc-wrap">
                  <div className="rd-field-lbl" style={{ marginBottom: 8 }}>Description</div>
                  <div className="rd-desc">{claim.description}</div>
                </div>
              )}

              {/* Receipts */}
              {(claim as any).receipts?.length > 0 && (
                <div className="rd-receipts">
                  <div className="rd-field-lbl" style={{ marginBottom: 8 }}>Receipts</div>
                  <div>
                    {(claim as any).receipts.map((r: any, i: number) => (
                      <a
                        key={i}
  href={`${process.env.REACT_APP_API_URL}/${r.url}`}
  target="_blank"
  rel="noopener noreferrer"
  className="rd-receipt-btn"
>
  <Download size={13} /> {r.name || `Receipt ${i + 1}`}
</a>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly Report deep-link */}
              {(claim as any).monthlyReport && (
                <div
                  className="rd-report-link"
                  onClick={() => navigate('/monthly-report')}
                >
                  <FileText size={14} />
                  <span>This claim is linked to a Monthly Report — click to view</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rd-error">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              {/* ── Privileged: Approve / Reject / Paid ── */}
              {isPrivileged && claim.status !== 'Paid' && (
                <div className="rd-actions">
                  <div className="rd-actions-lbl">Update Status</div>
                  <div className="btn-row">
                    {claim.status !== 'Approved' && (
                      <button
                        className="rd-btn rd-btn-approve"
                        disabled={!!updating}
                        onClick={() => updateStatus('Approved')}
                      >
                        {updating === 'Approved'
                          ? <Loader2 size={13} style={{ animation: 'rd-spin 0.7s linear infinite' }} />
                          : <CheckCircle2 size={13} />}
                        {updating === 'Approved' ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                    {claim.status !== 'Rejected' && (
                      <button
                        className="rd-btn rd-btn-reject"
                        disabled={!!updating}
                        onClick={() => updateStatus('Rejected')}
                      >
                        {updating === 'Rejected'
                          ? <Loader2 size={13} style={{ animation: 'rd-spin 0.7s linear infinite' }} />
                          : <XCircle size={13} />}
                        {updating === 'Rejected' ? 'Rejecting…' : 'Reject'}
                      </button>
                    )}
                    {claim.status === 'Approved' && (
                      <button
                        className="rd-btn rd-btn-paid"
                        disabled={!!updating}
                        onClick={() => updateStatus('Paid', 'Paid')}
                      >
                        {updating === 'Paid'
                          ? <Loader2 size={13} style={{ animation: 'rd-spin 0.7s linear infinite' }} />
                          : <DollarSign size={13} />}
                        {updating === 'Paid' ? 'Marking…' : 'Mark as Paid'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Employee: read-only notice ── */}
              {!isPrivileged && claim.status === 'Pending' && (
                <div className="rd-readonly">
                  <Clock size={14} />
                  Your claim is pending review. You will be notified once it is processed.
                </div>
              )}
              {!isPrivileged && claim.status === 'Approved' && (
                <div className="rd-readonly" style={{ background: 'rgba(52,211,153,0.06)', borderColor: 'rgba(52,211,153,0.2)', color: 'rgba(52,211,153,0.8)' }}>
                  <CheckCircle2 size={14} />
                  Your claim has been approved.
                </div>
              )}
              {!isPrivileged && claim.status === 'Rejected' && (
                <div className="rd-readonly" style={{ background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.2)', color: 'rgba(248,113,113,0.75)' }}>
                  <XCircle size={14} />
                  This claim was rejected. Please contact your manager for details.
                </div>
              )}
              {!isPrivileged && claim.status === 'Paid' && (
                <div className="rd-readonly" style={{ background: 'rgba(96,165,250,0.06)', borderColor: 'rgba(96,165,250,0.2)', color: 'rgba(96,165,250,0.8)' }}>
                  <DollarSign size={14} />
                  This claim has been paid.
                </div>
              )}

            </motion.div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <motion.div
          className="rd-toast"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          role="status"
        >
          {toast}
        </motion.div>
      )}
    </>
  );
};