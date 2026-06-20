// src/components/Reimbursements/ReimbursementForm.tsx
// submittedTo field removed — manager is auto-assigned on backend

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createReimbursement, getProjects } from '../../api/client';
import type { Project } from '../types/index';
import {
  ArrowLeft, Save, X, Upload, DollarSign,
  FileText, Calendar, Briefcase,
  CheckCircle2, AlertCircle, Loader2, Paperclip, Trash2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface FormData {
  title: string;
  description: string;
  project: string;
  amount: string;
  expenseDate: string;
}

interface FieldErrors {
  title?: string;
  description?: string;
  amount?: string;
  expenseDate?: string;
  receipts?: string;
  [key: string]: string | undefined;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_RECEIPTS  = 5;
const MAX_FILE_MB   = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXT   = ['.jpg', '.jpeg', '.png'];

// ─── Sub-components ───────────────────────────────────────────────────────────

const Label: React.FC<{ icon: React.ReactNode; text: string; required?: boolean }> = ({ icon, text, required }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 9.5, fontFamily: "'DM Mono', monospace",
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.32)', marginBottom: 8,
  }}>
    {icon}
    {text}
    {required && <span style={{ color: '#f87171', marginLeft: 2 }}>*</span>}
  </div>
);

const FieldError: React.FC<{ msg?: string }> = ({ msg }) => (
  <AnimatePresence>
    {msg && (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: '#f87171', marginTop: 5,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <AlertCircle size={10} /> {msg}
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Component ────────────────────────────────────────────────────────────────
export const ReimbursementForm: React.FC = () => {
  const navigate = useNavigate();

  const [projects,    setProjects]    = useState<Project[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [serverError, setServerError] = useState('');
  const [isDragging,  setIsDragging]  = useState(false);
  const [receipts,    setReceipts]    = useState<File[]>([]);
  const [errors,      setErrors]      = useState<FieldErrors>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    title:       '',
    description: '',
    project:     '',
    amount:      '',
    expenseDate: new Date().toISOString().split('T')[0],
  });

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingData(true);
      try {
        const projRes = await getProjects();
        setProjects(Array.isArray(projRes.data) ? projRes.data : []);
      } catch {
        setServerError('Failed to load form data. Please refresh.');
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.title.trim())
      e.title = 'Title is required';
    else if (form.title.trim().length < 3)
      e.title = 'Title must be at least 3 characters';
    if (!form.description.trim())
      e.description = 'Description is required';
    else if (form.description.trim().length < 10)
      e.description = 'Please provide more detail (min 10 chars)';
    if (!form.amount)
      e.amount = 'Amount is required';
    else if (isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Enter a valid positive amount';
    if (!form.expenseDate)
      e.expenseDate = 'Expense date is required';
    else if (new Date(form.expenseDate) > new Date())
      e.expenseDate = 'Date cannot be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  // ── File handling ─────────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const valid = arr.filter(f =>
      ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_MB * 1024 * 1024
    );
    setReceipts(prev => {
      const combined = [...prev, ...valid].slice(0, MAX_RECEIPTS);
      if (combined.length < prev.length + valid.length) {
        setErrors(e => ({ ...e, receipts: `Max ${MAX_RECEIPTS} files. Some were omitted.` }));
      } else {
        setErrors(e => ({ ...e, receipts: undefined }));
      }
      return combined;
    });
  }, []);

  const removeFile = (i: number) =>
    setReceipts(prev => prev.filter((_, idx) => idx !== i));

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setSubmitting(true);
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) data.append(k, v); });
    receipts.forEach(f => data.append('receipts', f));

    try {
      await createReimbursement(data);
      setSubmitted(true);
      setTimeout(() => navigate('/reimbursements'), 1800);
    } catch (err: any) {
      setServerError(
        err?.response?.data?.message ?? 'Failed to submit claim. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared input style ────────────────────────────────────────────────────
  const inputStyle = (hasError?: string): React.CSSProperties => ({
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${hasError ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.09)'}`,
    borderRadius: 12,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13.5,
    padding: '11px 14px',
    outline: 'none',
    transition: 'border-color 0.2s, background 0.2s',
    boxSizing: 'border-box',
  });

  const selectStyle = (hasError?: string): React.CSSProperties => ({
    ...inputStyle(hasError),
    cursor: 'pointer',
    appearance: 'none',
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        .rf-root { min-height: 100vh; background: #0c0c16; font-family: 'DM Sans', sans-serif; padding: 2rem 1.5rem; }
        .rf-wrap { max-width: 680px; margin: 0 auto; }

        .rf-back { display: inline-flex; align-items: center; gap: 7px; color: rgba(255,255,255,0.3); font-size: 13px; cursor: pointer; border: none; background: none; font-family: 'DM Sans', sans-serif; transition: color 0.18s; padding: 0; margin-bottom: 1.6rem; }
        .rf-back:hover { color: rgba(255,255,255,0.7); }

        .rf-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; overflow: hidden; }

        .rf-head { padding: 26px 30px 22px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .rf-eyebrow { font-size: 9px; font-family: 'DM Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(167,139,250,0.5); margin-bottom: 6px; }
        .rf-title { font-family: 'Syne', sans-serif; font-size: clamp(1.4rem,3.5vw,1.9rem); font-weight: 800; color: #fff; letter-spacing: -0.03em; display: flex; align-items: center; gap: 10px; }
        .rf-title-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        .rf-body { padding: 26px 30px; display: flex; flex-direction: column; gap: 20px; }

        .rf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 520px) { .rf-row { grid-template-columns: 1fr; } }

        .rf-field { display: flex; flex-direction: column; }

        input.rf-inp:focus, textarea.rf-inp:focus, select.rf-inp:focus {
          border-color: rgba(167,139,250,0.4) !important;
          background: rgba(255,255,255,0.06) !important;
        }
        input.rf-inp::placeholder, textarea.rf-inp::placeholder { color: rgba(255,255,255,0.18); }
        select.rf-inp option { background: #12121e; color: rgba(255,255,255,0.8); }
        input[type='date'].rf-inp::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }

        .rf-drop { border: 1.5px dashed rgba(255,255,255,0.12); border-radius: 13px; padding: 22px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; text-align: center; background: rgba(255,255,255,0.015); }
        .rf-drop:hover, .rf-drop.dragging { border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.04); }
        .rf-drop-icon { width: 38px; height: 38px; border-radius: 10px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.18); display: flex; align-items: center; justify-content: center; margin-bottom: 2px; }
        .rf-drop-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.65); }
        .rf-drop-sub { font-size: 11px; color: rgba(255,255,255,0.22); font-family: 'DM Mono', monospace; }

        .rf-files { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .rf-file  { display: flex; align-items: center; gap: 9px; padding: 9px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; }
        .rf-file-name { flex: 1; font-size: 12px; color: rgba(255,255,255,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'DM Mono', monospace; }
        .rf-file-size { font-size: 10.5px; color: rgba(255,255,255,0.22); font-family: 'DM Mono', monospace; flex-shrink: 0; }
        .rf-file-rm { background: none; border: none; cursor: pointer; color: rgba(248,113,113,0.5); display: flex; align-items: center; padding: 2px; transition: color 0.18s; flex-shrink: 0; }
        .rf-file-rm:hover { color: #f87171; }

        .rf-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 0; }

        .rf-footer { padding: 22px 30px; display: flex; gap: 12px; }
        .rf-btn-submit { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 24px; background: linear-gradient(135deg,#7c3aed,#6366f1); color: #fff; border: none; border-radius: 13px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 20px rgba(124,58,237,0.3); transition: all 0.2s; }
        .rf-btn-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(124,58,237,0.45); }
        .rf-btn-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .rf-btn-cancel { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 14px 22px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 13px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.2s; }
        .rf-btn-cancel:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.75); }

        .rf-server-err { display: flex; align-items: center; gap: 9px; padding: 12px 14px; background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.2); border-radius: 11px; font-size: 12.5px; color: #fca5a5; margin: 0 30px; }

        .rf-success { min-height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; }
        .rf-success-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.25); display: flex; align-items: center; justify-content: center; }
        .rf-success-title { font-family: 'Syne', sans-serif; font-size: 1.35rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
        .rf-success-sub { font-size: 12.5px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; }

        .rf-skeleton { animation: rf-pulse 1.5s ease-in-out infinite; background: rgba(255,255,255,0.05); border-radius: 10px; }
        @keyframes rf-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }

        @keyframes rf-spin { to { transform: rotate(360deg); } }
        .rf-spinning { animation: rf-spin 0.8s linear infinite; }
      `}</style>

      <div className="rf-root">
        <div className="rf-wrap">

          {submitted ? (
            <motion.div className="rf-success" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="rf-success-icon">
                <CheckCircle2 size={26} color="#34d399" />
              </div>
              <div className="rf-success-title">Claim Submitted!</div>
              <div className="rf-success-sub">Redirecting to your claims…</div>
            </motion.div>
          ) : (
            <>
              <button className="rf-back" onClick={() => navigate('/reimbursements')}>
                <ArrowLeft size={15} /> Back to Claims
              </button>

              <motion.div className="rf-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>

                {/* Header */}
                <div className="rf-head">
                  <div className="rf-eyebrow">New Expense · Reimbursement</div>
                  <div className="rf-title">
                    <div className="rf-title-icon">
                      <DollarSign size={17} color="#a78bfa" />
                    </div>
                    Submit Claim
                  </div>
                </div>

                {/* Server error */}
                <AnimatePresence>
                  {serverError && (
                    <motion.div
                      className="rf-server-err"
                      style={{ margin: '20px 30px 0' }}
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    >
                      <AlertCircle size={14} /> {serverError}
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="rf-body">

                    {/* Title */}
                    <div className="rf-field">
                      <Label icon={<FileText size={10} />} text="Claim Title" required />
                      {loadingData
                        ? <div className="rf-skeleton" style={{ height: 44 }} />
                        : <input
                            className="rf-inp"
                            style={inputStyle(errors.title)}
                            placeholder="e.g. Flight tickets – Client visit Mumbai"
                            value={form.title}
                            onChange={set('title')}
                            maxLength={120}
                          />
                      }
                      <FieldError msg={errors.title} />
                    </div>

                    {/* Description */}
                    <div className="rf-field">
                      <Label icon={<FileText size={10} />} text="Description" required />
                      {loadingData
                        ? <div className="rf-skeleton" style={{ height: 92 }} />
                        : <textarea
                            className="rf-inp"
                            style={{ ...inputStyle(errors.description), resize: 'vertical', minHeight: 88 }}
                            placeholder="Describe the purpose of this expense…"
                            rows={4}
                            value={form.description}
                            onChange={set('description')}
                            maxLength={1000}
                          />
                      }
                      <FieldError msg={errors.description} />
                    </div>

                    {/* Amount + Date */}
                    <div className="rf-row">
                      <div className="rf-field">
                        <Label icon={<DollarSign size={10} />} text="Amount (₹)" required />
                        {loadingData
                          ? <div className="rf-skeleton" style={{ height: 44 }} />
                          : <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="rf-inp"
                              style={inputStyle(errors.amount)}
                              placeholder="0.00"
                              value={form.amount}
                              onChange={set('amount')}
                            />
                        }
                        <FieldError msg={errors.amount} />
                      </div>
                      <div className="rf-field">
                        <Label icon={<Calendar size={10} />} text="Expense Date" required />
                        {loadingData
                          ? <div className="rf-skeleton" style={{ height: 44 }} />
                          : <input
                              type="date"
                              className="rf-inp"
                              style={inputStyle(errors.expenseDate)}
                              value={form.expenseDate}
                              max={new Date().toISOString().split('T')[0]}
                              onChange={set('expenseDate')}
                            />
                        }
                        <FieldError msg={errors.expenseDate} />
                      </div>
                    </div>

                    {/* Project (optional) */}
                    <div className="rf-field">
                      <Label icon={<Briefcase size={10} />} text="Project" />
                      {loadingData
                        ? <div className="rf-skeleton" style={{ height: 44 }} />
                        : <select
                            className="rf-inp"
                            style={selectStyle()}
                            value={form.project}
                            onChange={set('project')}
                          >
                            <option value="">No project (optional)</option>
                            {projects.map(p => (
                              <option key={p._id} value={p._id}>{p.name}</option>
                            ))}
                          </select>
                      }
                    </div>

                    {/* Receipts */}
                    <div className="rf-field">
                      <Label icon={<Paperclip size={10} />} text={`Receipts (max ${MAX_RECEIPTS}, ${MAX_FILE_MB}MB each)`} />

                      <div
                        className={`rf-drop${isDragging ? ' dragging' : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={onDrop}
                      >
                        <div className="rf-drop-icon">
                          <Upload size={16} color="#a78bfa" />
                        </div>
                        <div className="rf-drop-title">Drop files here or click to browse</div>
                        <div className="rf-drop-sub">{ALLOWED_EXT.join(', ')} · Max {MAX_FILE_MB}MB each</div>
                        <div className="rf-drop-sub" style={{ color: 'rgba(167,139,250,0.45)', marginTop: 2 }}>
                          {receipts.length}/{MAX_RECEIPTS} uploaded
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ALLOWED_EXT.join(',')}
                        style={{ display: 'none' }}
                        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                      />

                      <FieldError msg={errors.receipts} />

                      {receipts.length > 0 && (
                        <div className="rf-files">
                          {receipts.map((f, i) => (
                            <motion.div
                              key={`${f.name}-${i}`}
                              className="rf-file"
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -8 }}
                            >
                              <Paperclip size={12} color="rgba(167,139,250,0.6)" style={{ flexShrink: 0 }} />
                              <span className="rf-file-name">{f.name}</span>
                              <span className="rf-file-size">
                                {(f.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                              <button
                                type="button"
                                className="rf-file-rm"
                                onClick={() => removeFile(i)}
                                aria-label="Remove file"
                              >
                                <Trash2 size={13} />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="rf-divider" />

                  <div className="rf-footer">
                    <button
                      type="submit"
                      className="rf-btn-submit"
                      disabled={submitting || loadingData}
                    >
                      {submitting
                        ? <><Loader2 size={16} className="rf-spinning" /> Submitting…</>
                        : <><Save size={16} /> Submit Claim</>}
                    </button>
                    <button
                      type="button"
                      className="rf-btn-cancel"
                      onClick={() => navigate('/reimbursements')}
                      disabled={submitting}
                    >
                      <X size={15} /> Cancel
                    </button>
                  </div>

                </form>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </>
  );
};