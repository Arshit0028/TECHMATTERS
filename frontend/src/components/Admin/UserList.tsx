import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search, ChevronLeft, ChevronRight, Edit2, Trash2, ShieldCheck, User as UserIcon, Mail, MoreVertical } from 'lucide-react';
import { getUsers, deleteUser } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { User } from '../types/index';

const ROLE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  admin:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Admin'   },
  manager: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Manager' },
  member:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: 'Member'  },
};

const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#7c3aed,#6366f1)',
  'linear-gradient(135deg,#0891b2,#06b6d4)',
  'linear-gradient(135deg,#059669,#10b981)',
  'linear-gradient(135deg,#d97706,#f59e0b)',
  'linear-gradient(135deg,#db2777,#ec4899)',
  'linear-gradient(135deg,#dc2626,#f87171)',
];
const avatarGradient = (name: string) =>
  AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];

export const UserList: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [search, setSearch] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  useEffect(() => { loadUsers(); }, [page]);

  // Reset to page 1 on search change
  useEffect(() => { setPage(1); loadUsers(); }, [search]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await getUsers(page, 10, undefined, undefined);
      const data = res.data;
      const allUsers: User[] = data.users ?? data ?? [];
      // Client-side search filter
      const filtered = search.trim()
        ? allUsers.filter(u =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
          )
        : allUsers;
      setUsers(filtered);
      setTotalPages(data.pages ?? 1);
      setTotalUsers(data.total ?? filtered.length);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await deleteUser(id);
      setActiveMenu(null);
      loadUsers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        .ul-root {
          min-height: 100vh;
          background: #0a0a0f;
          background-image:
            radial-gradient(ellipse 80% 50% at 20% -20%, rgba(99,102,241,0.13) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 110%, rgba(139,92,246,0.08) 0%, transparent 60%);
          padding: 3rem 1.5rem 5rem;
          font-family: 'Sora', sans-serif;
        }
        .ul-container { max-width: 1000px; margin: 0 auto; }

        /* ── Header ── */
        .ul-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .ul-title-group {}
        .ul-breadcrumb {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 0.5rem;
        }
        .ul-title {
          font-size: 2rem;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.03em;
          line-height: 1.1;
          margin: 0;
        }
        .ul-title em {
          font-style: normal;
          background: linear-gradient(135deg, #a78bfa, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .ul-subtitle {
          font-size: 13px;
          color: rgba(255,255,255,0.35);
          margin-top: 6px;
          font-weight: 300;
        }

        /* ── Add button ── */
        .btn-add {
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 11px 22px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(124,58,237,0.35);
          white-space: nowrap;
        }
        .btn-add:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(124,58,237,0.5);
        }

        /* ── Search ── */
        .ul-search-wrap {
          position: relative;
          margin-bottom: 1.5rem;
        }
        .ul-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255,255,255,0.25);
          pointer-events: none;
          display: flex;
        }
        .ul-search {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: rgba(255,255,255,0.85);
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          padding: 12px 16px 12px 42px;
          outline: none;
          transition: all 0.2s ease;
        }
        .ul-search::placeholder { color: rgba(255,255,255,0.2); }
        .ul-search:focus {
          border-color: rgba(167,139,250,0.45);
          background: rgba(167,139,250,0.07);
          box-shadow: 0 0 0 3px rgba(167,139,250,0.08);
        }

        /* ── Stats row ── */
        .ul-stats {
          display: flex;
          gap: 12px;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .ul-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 10px 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ul-stat-num {
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }
        .ul-stat-label {
          font-size: 12px;
          color: rgba(255,255,255,0.35);
        }

        /* ── Table card ── */
        .ul-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          overflow: hidden;
        }

        /* ── Table ── */
        .ul-table { width: 100%; border-collapse: collapse; }
        .ul-thead th {
          padding: 14px 20px;
          text-align: left;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25);
          font-family: 'JetBrains Mono', monospace;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap;
          background: rgba(255,255,255,0.02);
        }
        .ul-row {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.15s ease;
        }
        .ul-row:last-child { border-bottom: none; }
        .ul-row:hover { background: rgba(255,255,255,0.03); }
        .ul-td { padding: 14px 20px; vertical-align: middle; }

        /* ── User cell ── */
        .user-cell { display: flex; align-items: center; gap: 12px; }
        .ul-avatar {
          width: 36px; height: 36px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 600; color: #fff;
          flex-shrink: 0;
        }
        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255,255,255,0.85);
          line-height: 1.2;
        }
        .user-id {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          font-family: 'JetBrains Mono', monospace;
          margin-top: 2px;
        }
        .user-email {
          font-size: 13px;
          color: rgba(255,255,255,0.4);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* ── Badges ── */
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
        }
        .badge-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .badge-active { background: rgba(52,211,153,0.12); color: #34d399; }
        .badge-inactive { background: rgba(248,113,113,0.1); color: #f87171; }

        /* ── Action menu ── */
        .action-cell { position: relative; }
        .menu-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.25);
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          transition: all 0.15s;
        }
        .menu-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
        .dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          z-index: 50;
          background: #1a1a2e;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 6px;
          min-width: 160px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5);
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 400;
          color: rgba(255,255,255,0.65);
          cursor: pointer;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: 'Sora', sans-serif;
          transition: all 0.15s ease;
        }
        .dropdown-item:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.9); }
        .dropdown-item.danger:hover { background: rgba(248,113,113,0.1); color: #f87171; }
        .dropdown-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 5px 0; }

        /* ── Empty / Loading ── */
        .ul-empty {
          padding: 4rem 2rem;
          text-align: center;
          color: rgba(255,255,255,0.2);
          font-size: 14px;
        }
        .ul-empty-icon {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 1rem;
          color: rgba(255,255,255,0.2);
        }
        .ul-loading {
          padding: 4rem 2rem;
          text-align: center;
        }
        .ul-skeleton {
          height: 56px;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        /* ── Pagination ── */
        .ul-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
        }
        .page-info {
          font-size: 13px;
          color: rgba(255,255,255,0.3);
          font-family: 'JetBrains Mono', monospace;
        }
        .page-info strong { color: rgba(255,255,255,0.6); }
        .page-btns { display: flex; gap: 6px; align-items: center; }
        .page-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: rgba(255,255,255,0.5);
          width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: 'Sora', sans-serif;
          font-size: 13px;
        }
        .page-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.9);
          border-color: rgba(255,255,255,0.2);
        }
        .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .page-btn.active {
          background: rgba(124,58,237,0.25);
          border-color: rgba(124,58,237,0.5);
          color: #a78bfa;
        }

        @media (max-width: 680px) {
          .col-email, .col-id { display: none; }
          .ul-td.col-email, .ul-td.col-id { display: none; }
          .ul-header { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      <div className="ul-root" onClick={() => setActiveMenu(null)}>
        <div className="ul-container">

          {/* Header */}
          <motion.div
            className="ul-header"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="ul-title-group">
              <div className="ul-breadcrumb">Settings / <span style={{ color: 'rgba(255,255,255,0.55)' }}>Team</span></div>
              <h1 className="ul-title">Team <em>Management</em></h1>
              <p className="ul-subtitle">Manage members, roles and permissions</p>
            </div>
            <button className="btn-add" onClick={() => navigate('/users/new')}>
              <UserPlus size={16} /> Add Member
            </button>
          </motion.div>

          {/* Stats */}
          <motion.div
            className="ul-stats"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="ul-stat">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa' }} />
              <span className="ul-stat-num">{totalUsers || users.length}</span>
              <span className="ul-stat-label">total members</span>
            </div>
            <div className="ul-stat">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
              <span className="ul-stat-num">{users.filter(u => u.status === 'active').length}</span>
              <span className="ul-stat-label">active</span>
            </div>
            <div className="ul-stat">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa' }} />
              <span className="ul-stat-num">{users.filter(u => u.accessLevel === 'admin' || u.accessLevel === 'manager').length}</span>
              <span className="ul-stat-label">managers / admins</span>
            </div>
          </motion.div>

          {/* Search */}
          <motion.div
            className="ul-search-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <div className="ul-search-icon"><Search size={16} /></div>
            <input
              type="text"
              className="ul-search"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </motion.div>

          {/* Table */}
          <motion.div
            className="ul-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            {loading ? (
              <div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="ul-skeleton" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="ul-empty">
                <div className="ul-empty-icon"><UserIcon size={22} /></div>
                {search ? `No members matching "${search}"` : 'No team members yet'}
              </div>
            ) : (
              <table className="ul-table">
                <thead className="ul-thead">
                  <tr>
                    <th>Member</th>
                    <th className="col-email">Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th style={{ width: 48 }}></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {users.map((u, idx) => {
                      const roleCfg = ROLE_CONFIG[u.accessLevel] ?? ROLE_CONFIG.member;
                      const isMenuOpen = activeMenu === u._id;
                      return (
                        <motion.tr
                          key={u._id}
                          className="ul-row"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                        >
                          {/* Name + Avatar */}
                          <td className="ul-td">
                            <div className="user-cell">
                              <div
                                className="ul-avatar"
                                style={{ background: avatarGradient(u.name) }}
                              >
                                {getInitials(u.name)}
                              </div>
                              <div>
                                <div className="user-name">{u.name}</div>
                                <div className="user-id">#{u._id.slice(-6)}</div>
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="ul-td col-email">
                            <div className="user-email">
                              <Mail size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                              {u.email}
                            </div>
                          </td>

                          {/* Role */}
                          <td className="ul-td">
                            <span
                              className="badge"
                              style={{ background: roleCfg.bg, color: roleCfg.color }}
                            >
                              {(u.accessLevel === 'admin') && <ShieldCheck size={11} />}
                              {roleCfg.label}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="ul-td">
                            <span className={`badge ${u.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                              <span className="badge-dot" style={{ background: u.status === 'active' ? '#34d399' : '#f87171' }} />
                              {u.status ?? 'active'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="ul-td action-cell" onClick={e => e.stopPropagation()}>
                            <button
                              className="menu-btn"
                              onClick={() => setActiveMenu(isMenuOpen ? null : u._id)}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {isMenuOpen && (
                              <div className="dropdown">
                                <button
                                  className="dropdown-item"
                                  onClick={() => { navigate(`/users/${u._id}`); setActiveMenu(null); }}
                                >
                                  <Edit2 size={14} /> Edit profile
                                </button>
                                <div className="dropdown-divider" />
                                <button
                                  className="dropdown-item danger"
                                  onClick={() => handleDelete(u._id)}
                                >
                                  <Trash2 size={14} /> Deactivate
                                </button>
                              </div>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {!loading && users.length > 0 && (
              <div className="ul-pagination">
                <span className="page-info">
                  Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                </span>
                <div className="page-btns">
                  <button
                    className="page-btn"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    const pg = i + 1;
                    return (
                      <button
                        key={pg}
                        className={`page-btn ${page === pg ? 'active' : ''}`}
                        onClick={() => setPage(pg)}
                      >
                        {pg}
                      </button>
                    );
                  })}
                  <button
                    className="page-btn"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>

        </div>
      </div>
    </>
  );
};