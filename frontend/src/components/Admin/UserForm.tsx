import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getUser, createUser, updateUser, getUsers } from '../../api/client';
import type { User, Permission } from '../types/index';
import {
  Save, X, User as UserIcon, Briefcase, Shield,
  Eye, EyeOff, Upload, Calendar, Phone, Mail,
  Hash, Building2, Award, AlertCircle, CheckCircle2
} from 'lucide-react';

type PermissionAction = 'read' | 'write' | 'create' | 'delete' | 'import' | 'export';

const MODULE_ICONS: Record<string, string> = {
  projects: '◈',
  tasks: '◎',
  invoices: '◉',
};

const ACCESS_CONFIG: Record<string, { color: string; bg: string; desc: string }> = {
  entry:            { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', desc: 'Basic read access' },
  tech:             { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  desc: 'Technical contributor' },
  senior:           { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  desc: 'Senior contributor' },
  'project-manager':{ color: '#818cf8', bg: 'rgba(129,140,248,0.12)', desc: 'Project management' },
  manager:          { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', desc: 'Team management' },
  admin:            { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  desc: 'Full system access' },
  'super-admin':    { color: '#f87171', bg: 'rgba(248,113,113,0.12)', desc: 'Unrestricted access' },
};

type AccessLevel = 'entry' | 'tech' | 'senior' | 'project-manager' | 'manager' | 'admin' | 'super-admin';

export const UserForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    joiningDate: new Date().toISOString().split('T')[0],
    email: '',
    phone: '',
    bio: '',
    department: '',
    designation: '',
    reportingManager: '',
    password: '',
    status: 'active' as 'active' | 'inactive',
    accessLevel: 'entry' as AccessLevel,
    permissions: [] as Permission[],
  });

  useEffect(() => { loadManagers(); if (id) loadUser(); }, [id]);

  const loadManagers = async () => {
    try {
      const res = await getUsers(1, 100, undefined, undefined);
      const allUsers: User[] = res.data.users ?? res.data ?? [];
      setManagers(allUsers.filter(u => ['manager', 'admin', 'super-admin'].includes(u.accessLevel)));
    } catch (err) { console.error('Failed to load managers:', err); }
  };

  const loadUser = async () => {
    try {
      const res = await getUser(id!);
      const user = res.data;
      setFormData({
        name: user.name ?? '',
        employeeId: user.employeeId ?? '',
        joiningDate: user.joiningDate?.split('T')[0] ?? new Date().toISOString().split('T')[0],
        email: user.email ?? '',
        phone: user.phone ?? '',
        bio: user.bio ?? '',
        department: user.department ?? '',
        designation: user.designation ?? '',
        reportingManager: typeof user.reportingManager === 'string'
          ? user.reportingManager
          : user.reportingManager?._id ?? '',
        password: '',
        status: user.status ?? 'active',
        accessLevel: user.accessLevel ?? 'entry',
        permissions: user.permissions ?? [],
      });
    } catch (err) { console.error(err); }
  };

  // ── Client-side validation ────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const name = formData.name.trim();
    const email = formData.email.trim();
    const password = formData.password.trim();

    if (!name) errs.name = 'Full name is required';
    if (!email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address';
    if (!id && !password) errs.password = 'Password is required for new users';
    else if (!id && password.length < 6) errs.password = 'Password must be at least 6 characters';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    setLoading(true);
    const data = new FormData();
    data.append('name', formData.name.trim());
    data.append('email', formData.email.trim());
    if (formData.password) data.append('password', formData.password);
    if (formData.employeeId) data.append('employeeId', formData.employeeId.trim());
    if (formData.joiningDate) data.append('joiningDate', formData.joiningDate);
    if (formData.phone) data.append('phone', formData.phone.trim());
    if (formData.bio) data.append('bio', formData.bio.trim());
    if (formData.department) data.append('department', formData.department.trim());
    if (formData.designation) data.append('designation', formData.designation.trim());
    if (formData.reportingManager) data.append('reportingManager', formData.reportingManager);
    data.append('status', formData.status);
    data.append('accessLevel', formData.accessLevel);
    data.append('permissions', JSON.stringify(formData.permissions));
    if (resumeFile) data.append('resume', resumeFile);

    try {
      if (id) await updateUser(id, data);
      else await createUser(data);
      setSuccess(true);
      setTimeout(() => navigate('/users'), 800);
    } catch (err: any) {
      const msg = err.response?.data?.msg || err.response?.data?.message || 'Failed to save. Please try again.';
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const set = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  };

  const updatePermissions = (module: string, action: PermissionAction, checked: boolean) => {
    const newPerms = formData.permissions.map(p => ({ ...p, actions: { ...p.actions } }));
    let modPerm = newPerms.find(p => p.module === module);
    if (!modPerm) {
      modPerm = {
        module: module as 'projects' | 'tasks' | 'invoices',
        actions: { read: false, write: false, create: false, delete: false, import: false, export: false }
      };
      newPerms.push(modPerm);
    }
    modPerm.actions[action] = checked;
    setFormData(prev => ({ ...prev, permissions: newPerms }));
  };

  const getModulePerms = (module: string) =>
    formData.permissions.find(p => p.module === module);

  const acCfg = ACCESS_CONFIG[formData.accessLevel] ?? ACCESS_CONFIG.entry;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        .uf-root {
          min-height: 100vh;
          background: #0a0a0f;
          background-image:
            radial-gradient(ellipse 80% 50% at 20% -20%, rgba(99,102,241,0.13) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 110%, rgba(139,92,246,0.08) 0%, transparent 60%);
          padding: 3rem 1rem 5rem;
          font-family: 'Sora', sans-serif;
        }
        .uf-container { max-width: 800px; margin: 0 auto; }

        .uf-breadcrumb {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 0.5rem;
        }
        .uf-breadcrumb span { color: rgba(255,255,255,0.55); }
        .uf-title {
          font-size: 2rem; font-weight: 600; color: #fff;
          letter-spacing: -0.03em; line-height: 1.1; margin: 0 0 0.4rem;
        }
        .uf-title em {
          font-style: normal;
          background: linear-gradient(135deg,#a78bfa,#818cf8);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .uf-subtitle { font-size: 13px; color: rgba(255,255,255,0.35); font-weight: 300; margin-bottom: 2.5rem; }

        /* Card */
        .uf-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          backdrop-filter: blur(20px);
          overflow: hidden;
        }

        /* Section */
        .uf-section {
          padding: 2rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .uf-section:last-child { border-bottom: none; }
        .uf-section-title {
          font-size: 11px; font-weight: 500;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: rgba(255,255,255,0.28);
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 1.5rem;
          display: flex; align-items: center; gap: 8px;
        }
        .uf-section-title::after {
          content: ''; flex: 1; height: 1px;
          background: rgba(255,255,255,0.06);
        }

        /* Grid */
        .uf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .uf-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
        .uf-stack { display: flex; flex-direction: column; gap: 1.25rem; }
        .col-span-2 { grid-column: span 2; }

        /* Field */
        .uf-field { display: flex; flex-direction: column; gap: 7px; }
        .uf-label {
          font-size: 12px; font-weight: 500;
          color: rgba(255,255,255,0.45);
          display: flex; align-items: center; gap: 6px;
          letter-spacing: 0.02em;
        }
        .uf-label-icon { color: rgba(167,139,250,0.65); display: flex; }
        .uf-required { color: #f87171; font-size: 10px; margin-left: 2px; }

        /* Input */
        .uf-input, .uf-textarea, .uf-select {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: rgba(255,255,255,0.88);
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          padding: 11px 15px;
          width: 100%; box-sizing: border-box;
          outline: none;
          transition: all 0.2s ease;
        }
        .uf-input::placeholder, .uf-textarea::placeholder { color: rgba(255,255,255,0.2); }
        .uf-input:focus, .uf-textarea:focus, .uf-select:focus {
          border-color: rgba(167,139,250,0.5);
          background: rgba(167,139,250,0.07);
          box-shadow: 0 0 0 3px rgba(167,139,250,0.08);
        }
        .uf-input:hover, .uf-textarea:hover, .uf-select:hover {
          border-color: rgba(255,255,255,0.18);
        }
        .uf-input.error, .uf-textarea.error { border-color: rgba(248,113,113,0.5) !important; background: rgba(248,113,113,0.06) !important; }
        .uf-textarea { resize: vertical; min-height: 80px; line-height: 1.6; }
        .uf-select {
          appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 38px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 13px center;
        }
        .uf-select option { background: #1a1a2e; color: #fff; }
        input[type="date"].uf-input::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }

        /* Password wrapper */
        .pw-wrap { position: relative; }
        .pw-wrap .uf-input { padding-right: 44px; }
        .pw-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: rgba(255,255,255,0.3);
          cursor: pointer; display: flex; padding: 4px; border-radius: 6px;
          transition: color 0.15s;
        }
        .pw-toggle:hover { color: rgba(255,255,255,0.6); }

        /* Field error */
        .field-error {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; color: #f87171;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

        /* File upload */
        .file-upload {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 15px;
          background: rgba(255,255,255,0.05);
          border: 1px dashed rgba(255,255,255,0.15);
          border-radius: 12px;
          cursor: pointer; transition: all 0.2s ease;
        }
        .file-upload:hover { border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.06); }
        .file-upload input { display: none; }
        .file-upload-text { font-size: 13px; color: rgba(255,255,255,0.4); }
        .file-upload-name { font-size: 13px; color: rgba(167,139,250,0.9); }

        /* Access level pills */
        .access-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .access-pill {
          padding: 10px 8px; border-radius: 12px; text-align: center;
          border: 1px solid rgba(255,255,255,0.08); cursor: pointer;
          background: rgba(255,255,255,0.03);
          transition: all 0.18s ease;
        }
        .access-pill:hover { border-color: rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); }
        .access-pill.active { border-width: 1px; }
        .access-pill-name { font-size: 12px; font-weight: 500; margin-bottom: 3px; }
        .access-pill-desc { font-size: 10px; color: rgba(255,255,255,0.3); line-height: 1.3; }

        /* Status toggle */
        .status-row { display: flex; gap: 10px; }
        .status-chip {
          flex: 1; padding: 10px; border-radius: 12px; text-align: center;
          border: 1px solid rgba(255,255,255,0.08); cursor: pointer;
          background: rgba(255,255,255,0.03); font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,0.4); transition: all 0.18s ease;
        }
        .status-chip.active-status {
          background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.4); color: #34d399;
        }
        .status-chip.inactive-status {
          background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.4); color: #f87171;
        }

        /* Permissions */
        .perm-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          overflow: hidden;
        }
        .perm-header {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.02);
        }
        .perm-module-icon { font-size: 16px; color: rgba(167,139,250,0.7); }
        .perm-module-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); text-transform: capitalize; }
        .perm-actions { padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .perm-check {
          display: flex; align-items: center; gap: 8px;
          cursor: pointer; user-select: none;
        }
        .perm-check input { display: none; }
        .perm-box {
          width: 16px; height: 16px; border-radius: 5px;
          border: 1.5px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.04);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.15s ease;
        }
        .perm-box.checked { background: #7c3aed; border-color: #7c3aed; }
        .perm-label { font-size: 12px; color: rgba(255,255,255,0.55); text-transform: capitalize; }
        .perm-label.checked { color: rgba(255,255,255,0.85); }

        /* Submit error / success */
        .submit-error {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 14px 16px; border-radius: 12px;
          background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2);
          color: #fca5a5; font-size: 14px;
          margin: 0 2rem 1rem;
        }
        .submit-success {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 16px; border-radius: 12px;
          background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2);
          color: #6ee7b7; font-size: 14px;
          margin: 0 2rem 1rem;
        }

        /* Actions */
        .uf-actions {
          display: flex; gap: 12px;
          padding: 1.75rem 2rem;
          border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
        }
        .btn-primary {
          background: linear-gradient(135deg,#7c3aed,#6366f1);
          color: #fff; border: none; border-radius: 12px;
          padding: 12px 28px; font-size: 14px; font-weight: 600;
          font-family: 'Sora', sans-serif; cursor: pointer;
          display: flex; align-items: center; gap: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(124,58,237,0.35);
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(124,58,237,0.5); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-ghost {
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          padding: 12px 22px; font-size: 14px; font-weight: 500;
          font-family: 'Sora', sans-serif; cursor: pointer;
          display: flex; align-items: center; gap: 8px; transition: all 0.18s ease;
        }
        .btn-ghost:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff; border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .uf-grid, .uf-grid-3 { grid-template-columns: 1fr; }
          .col-span-2 { grid-column: span 1; }
          .access-grid { grid-template-columns: repeat(2, 1fr); }
          .uf-section { padding: 1.5rem; }
          .uf-actions { padding: 1.25rem 1.5rem; }
          .uf-title { font-size: 1.5rem; }
        }
      `}</style>

      <div className="uf-root">
        <div className="uf-container">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="uf-breadcrumb">Team / <span>{id ? 'Edit Member' : 'New Member'}</span></div>
            <h1 className="uf-title">{id ? <>Edit <em>Member</em></> : <>Add <em>New Member</em></>}</h1>
            <p className="uf-subtitle">{id ? 'Update profile, role and permissions.' : 'Fill in the details to onboard a new team member.'}</p>
          </motion.div>

          <motion.div
            className="uf-card"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <form onSubmit={handleSubmit} noValidate>

              {/* ── 01 Basic Info ── */}
              <div className="uf-section">
                <div className="uf-section-title">01 — Basic information</div>
                <div className="uf-grid">

                  <div className="uf-field">
                    <label className="uf-label">
                      <span className="uf-label-icon"><UserIcon size={12} /></span>
                      Full name <span className="uf-required">*</span>
                    </label>
                    <input
                      className={`uf-input ${errors.name ? 'error' : ''}`}
                      placeholder="e.g. Rahul Sharma"
                      value={formData.name}
                      onChange={e => set('name', e.target.value)}
                    />
                    {errors.name && <span className="field-error"><AlertCircle size={11} />{errors.name}</span>}
                  </div>

                  <div className="uf-field">
                    <label className="uf-label">
                      <span className="uf-label-icon"><Hash size={12} /></span>
                      Employee ID
                    </label>
                    <input className="uf-input" placeholder="e.g. EMP-0042" value={formData.employeeId} onChange={e => set('employeeId', e.target.value)} />
                  </div>

                  <div className="uf-field">
                    <label className="uf-label">
                      <span className="uf-label-icon"><Mail size={12} /></span>
                      Email address <span className="uf-required">*</span>
                    </label>
                    <input
                      type="email"
                      className={`uf-input ${errors.email ? 'error' : ''}`}
                      placeholder="rahul@company.com"
                      value={formData.email}
                      onChange={e => set('email', e.target.value)}
                    />
                    {errors.email && <span className="field-error"><AlertCircle size={11} />{errors.email}</span>}
                  </div>

                  <div className="uf-field">
                    <label className="uf-label">
                      <span className="uf-label-icon"><Phone size={12} /></span>
                      Phone number
                    </label>
                    <input className="uf-input" placeholder="+91 98765 43210" value={formData.phone} onChange={e => set('phone', e.target.value)} />
                  </div>

                  <div className="uf-field">
                    <label className="uf-label">
                      <span className="uf-label-icon"><Calendar size={12} /></span>
                      Joining date
                    </label>
                    <input type="date" className="uf-input" value={formData.joiningDate} onChange={e => set('joiningDate', e.target.value)} />
                  </div>

                  <div className="uf-field col-span-2">
                    <label className="uf-label">Bio</label>
                    <textarea className="uf-textarea" placeholder="A short bio or introduction…" value={formData.bio} onChange={e => set('bio', e.target.value)} />
                  </div>

                </div>
              </div>

              {/* ── 02 Professional ── */}
              <div className="uf-section">
                <div className="uf-section-title">02 — Professional details</div>
                <div className="uf-grid">

                  <div className="uf-field">
                    <label className="uf-label"><span className="uf-label-icon"><Building2 size={12} /></span>Department</label>
                    <input className="uf-input" placeholder="e.g. Engineering" value={formData.department} onChange={e => set('department', e.target.value)} />
                  </div>

                  <div className="uf-field">
                    <label className="uf-label"><span className="uf-label-icon"><Award size={12} /></span>Designation</label>
                    <input className="uf-input" placeholder="e.g. Senior Developer" value={formData.designation} onChange={e => set('designation', e.target.value)} />
                  </div>

                  <div className="uf-field">
                    <label className="uf-label"><span className="uf-label-icon"><UserIcon size={12} /></span>Reporting manager</label>
                    <select className="uf-select" value={formData.reportingManager} onChange={e => set('reportingManager', e.target.value)}>
                      <option value="">No manager assigned</option>
                      {managers.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
                    </select>
                  </div>

                  <div className="uf-field">
                    <label className="uf-label"><span className="uf-label-icon"><Upload size={12} /></span>Resume</label>
                    <label className="file-upload">
                      <input type="file" accept=".pdf,.doc,.docx,.jpg,.png" onChange={e => setResumeFile(e.target.files?.[0] || null)} />
                      <Upload size={15} style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0 }} />
                      {resumeFile
                        ? <span className="file-upload-name">{resumeFile.name}</span>
                        : <span className="file-upload-text">Click to upload PDF or image</span>
                      }
                    </label>
                  </div>

                </div>
              </div>

              {/* ── 03 Account ── */}
              <div className="uf-section">
                <div className="uf-section-title">03 — Account &amp; access</div>
                <div className="uf-stack">

                  {!id && (
                    <div className="uf-field">
                      <label className="uf-label">
                        <span className="uf-label-icon"><Shield size={12} /></span>
                        Password <span className="uf-required">*</span>
                      </label>
                      <div className="pw-wrap">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className={`uf-input ${errors.password ? 'error' : ''}`}
                          placeholder="Minimum 6 characters"
                          value={formData.password}
                          onChange={e => set('password', e.target.value)}
                        />
                        <button type="button" className="pw-toggle" onClick={() => setShowPassword(s => !s)}>
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {errors.password && <span className="field-error"><AlertCircle size={11} />{errors.password}</span>}
                    </div>
                  )}

                  <div className="uf-field">
                    <label className="uf-label">Account status</label>
                    <div className="status-row">
                      {(['active', 'inactive'] as const).map(s => (
                        <button
                          key={s}
                          type="button"
                          className={`status-chip ${formData.status === s ? (s === 'active' ? 'active-status' : 'inactive-status') : ''}`}
                          onClick={() => set('status', s)}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="uf-field">
                    <label className="uf-label">Access level</label>
                    <div className="access-grid">
                      {(Object.entries(ACCESS_CONFIG) as [string, typeof ACCESS_CONFIG[string]][]).map(([level, cfg]) => (
                        <button
                          key={level}
                          type="button"
                          className={`access-pill ${formData.accessLevel === level ? 'active' : ''}`}
                          style={formData.accessLevel === level
                            ? { background: cfg.bg, borderColor: cfg.color + '60', color: cfg.color }
                            : {}}
                          onClick={() => set('accessLevel', level as AccessLevel)}
                        >
                          <div className="access-pill-name" style={formData.accessLevel === level ? { color: cfg.color } : { color: 'rgba(255,255,255,0.6)' }}>
                            {level === 'super-admin' ? 'Super' : level === 'project-manager' ? 'PM' : level.charAt(0).toUpperCase() + level.slice(1)}
                          </div>
                          <div className="access-pill-desc">{cfg.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* ── 04 Permissions ── */}
              <div className="uf-section">
                <div className="uf-section-title">04 — Module permissions</div>
                <div className="uf-grid-3">
                  {(['projects', 'tasks', 'invoices'] as const).map(module => {
                    const perms = getModulePerms(module);
                    return (
                      <div key={module} className="perm-card">
                        <div className="perm-header">
                          <span className="perm-module-icon">{MODULE_ICONS[module]}</span>
                          <span className="perm-module-name">{module}</span>
                        </div>
                        <div className="perm-actions">
                          {(['read','write','create','delete','import','export'] as PermissionAction[]).map(action => {
                            const checked = perms?.actions[action] ?? false;
                            return (
                              <label key={action} className="perm-check" onClick={() => updatePermissions(module, action, !checked)}>
                                <div className={`perm-box ${checked ? 'checked' : ''}`}>
                                  {checked && (
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                <span className={`perm-label ${checked ? 'checked' : ''}`}>{action}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Error / Success banners */}
              <AnimatePresence>
                {submitError && (
                  <motion.div className="submit-error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {submitError}
                  </motion.div>
                )}
                {success && (
                  <motion.div className="submit-success" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} /> {id ? 'User updated!' : 'User created!'} Redirecting…
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="uf-actions">
                <button type="submit" className="btn-primary" disabled={loading || success}>
                  {loading ? <div className="spinner" /> : <Save size={15} />}
                  {loading ? 'Saving…' : id ? 'Update Member' : 'Create Member'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => navigate('/users')}>
                  <X size={15} /> Cancel
                </button>
              </div>

            </form>
          </motion.div>
        </div>
      </div>
    </>
  );
};