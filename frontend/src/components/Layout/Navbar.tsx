import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

import {
  LogOut,
  LayoutDashboard,
  Users,
  FolderKanban,
  CheckSquare,
  Activity as ActivityIcon,
  Receipt,
  Menu,
  X,
  ChevronDown,
  Bug,
  ListChecks,
  ShieldCheck,
  Sun,
  Moon,
  Bell,
} from 'lucide-react';

import { useState, useEffect, useRef, useCallback } from 'react';

interface NavLinkItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

interface NotificationItem {
  _id: string;
  type: 'activity_created' | 'activity_reminder';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const getAuthToken = (): string | null =>
  localStorage.getItem('token') ||
  localStorage.getItem('authToken') ||
  localStorage.getItem('jwt');

const timeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export const Navbar = () => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // ─────────────────────────────────────────────────────────────────────────
  // ALL hooks must be declared here — unconditionally, before any early return.
  // Moving them below "if (!user) return null" is what caused the hooks error.
  // ─────────────────────────────────────────────────────────────────────────

  const [mobileMenuOpen, setMobileMenuOpen]     = useState(false);
  const [scrolled, setScrolled]                 = useState(false);
  const [userMenuOpen, setUserMenuOpen]         = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const [notifications, setNotifications]   = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount]       = useState(0);
  const [notifOpen, setNotifOpen]           = useState(false);
  const [notifLoading, setNotifLoading]     = useState(true);

  const userMenuRef  = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Derive role flags using optional chaining so they work when user is null
  const isAdmin      = user?.accessLevel === 'admin' || user?.accessLevel === 'super-admin';
  const isHR         = user?.accessLevel === 'hr';
  const hasAdminMenu = isAdmin || isHR;

  // Scroll listener
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  // Click-outside to close user dropdown
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Click-outside to close notifications dropdown
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Pending approval count — guard is INSIDE the callback, not around useCallback
  const fetchPendingCount = useCallback(async () => {
    if (!isAdmin) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch('/api/assigned-tasks/pending-approval', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setPendingApprovals(Array.isArray(data) ? data.length : 0);
    } catch {
      // silent — badge simply won't show if endpoint isn't ready yet
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchPendingCount();
    const id = setInterval(fetchPendingCount, 60_000);
    return () => clearInterval(id);
  }, [fetchPendingCount]);

  // Notifications — same fetch+poll shape as fetchPendingCount above.
  // Hitting GET /api/notifications also lazily generates today's reminder
  // for the user's Daily/Weekly activities server-side, so polling this is
  // what actually surfaces new reminders, not a separate mechanism.
  const fetchNotifications = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setNotifLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
    } catch {
      // silent — bell just won't update this cycle
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    const token = getAuthToken();
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort — next poll will resync if this silently failed
    }
  };

  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    const token = getAuthToken();
    if (!token) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort — next poll will resync if this silently failed
    }
  };

  // ── Safe early return — ALL hooks are already registered above ───────────
  if (!user) return null;

  // ── Nav links ─────────────────────────────────────────────────────────────
  const navLinks: NavLinkItem[] = [
    { to: '/',               icon: <LayoutDashboard size={15} />, label: 'Dashboard'  },
    { to: '/projects',       icon: <FolderKanban size={15} />,    label: 'Projects'   },
    { to: '/tasks',          icon: <CheckSquare size={15} />,      label: 'Tasks'      },
    { to: '/activities',     icon: <ActivityIcon size={15} />,     label: 'Activities' },
    { to: '/reimbursements', icon: <Receipt size={15} />,          label: 'Claims'     },
    ...(hasAdminMenu
      ? [
          { to: '/users',         icon: <Users size={15} />,       label: 'Team'        },
          { to: '/admin-reports', icon: <CheckSquare size={15} />, label: 'Performance' },
          ...(isAdmin
            ? [{
                to:    '/task-approvals',
                icon:  <ShieldCheck size={15} />,
                label: 'Approvals',
                badge: pendingApprovals,
              }]
            : []),
        ]
      : [
          { to: '/my-tasks',       icon: <ListChecks size={15} />,   label: 'Assignments'       },
          { to: '/my-performance', icon: <ActivityIcon size={15} />, label: 'My Performance' },
        ]),
  ];

  const initials = user.email ? user.email.slice(0, 2).toUpperCase() : 'TM';

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <>
      <style>{`
        /* ── Base nav ──────────────────────────────────────────────────── */
        .tm-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 50;
          font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
          transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
          background: rgba(255,255,255,0.88);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 0.5px solid rgba(0,0,0,0.09);
        }
        .tm-nav.scrolled {
          background: rgba(255,255,255,0.82);
          box-shadow: 0 1px 12px rgba(0,0,0,0.06);
          border-bottom: 0.5px solid rgba(0,0,0,0.11);
        }

        /* ── Dark nav ──────────────────────────────────────────────────── */
        [data-theme="dark"] .tm-nav {
          background: rgba(11,15,26,0.88);
          border-bottom-color: rgba(255,255,255,0.07);
        }
        [data-theme="dark"] .tm-nav.scrolled {
          background: rgba(11,15,26,0.94);
          box-shadow: 0 1px 12px rgba(0,0,0,0.35);
          border-bottom-color: rgba(255,255,255,0.10);
        }

        /* ── Layout ────────────────────────────────────────────────────── */
        .tm-inner {
          max-width: 1360px;
          margin: 0 auto;
          padding: 0 28px;
          height: 58px;
          display: flex;
          align-items: center;
        }
        .tm-brand {
          display: flex; align-items: center;
          text-decoration: none;
          flex-shrink: 0;
          margin-right: 32px;
        }
        .tm-logo { height: 34px; width: auto; display: block; object-fit: contain; }

        /* ── Desktop links ─────────────────────────────────────────────── */
        .tm-links {
          display: flex; align-items: center;
          gap: 1px; flex: 1;
          overflow-x: auto; scrollbar-width: none;
        }
        .tm-links::-webkit-scrollbar { display: none; }

        .tm-link {
          position: relative;
          display: flex; align-items: center;
          gap: 6px;
          padding: 6px 13px;
          border-radius: 9px;
          font-size: 13.5px; font-weight: 400;
          color: #48484a;
          text-decoration: none;
          letter-spacing: -0.1px;
          white-space: nowrap;
          flex-shrink: 0;
          transition: color 0.13s ease, background 0.13s ease;
          font-family: inherit;
        }
        .tm-link:hover  { color: #1d1d1f; background: rgba(0,0,0,0.05); }
        .tm-link.active { color: #1d1d1f; background: rgba(0,0,0,0.07); font-weight: 500; }

        [data-theme="dark"] .tm-link        { color: rgba(255,255,255,0.58); }
        [data-theme="dark"] .tm-link:hover  { color: rgba(255,255,255,0.90); background: rgba(255,255,255,0.07); }
        [data-theme="dark"] .tm-link.active { color: rgba(255,255,255,0.96); background: rgba(255,255,255,0.10); }

        .tm-link-icon {
          display: flex; align-items: center;
          color: #8e8e93;
          transition: color 0.13s; flex-shrink: 0;
        }
        .tm-link:hover .tm-link-icon,
        .tm-link.active .tm-link-icon { color: #3a3a3c; }
        [data-theme="dark"] .tm-link-icon { color: rgba(255,255,255,0.32); }
        [data-theme="dark"] .tm-link:hover .tm-link-icon,
        [data-theme="dark"] .tm-link.active .tm-link-icon { color: rgba(255,255,255,0.72); }

        .tm-link-dot {
          position: absolute;
          bottom: 3px; left: 50%;
          transform: translateX(-50%);
          width: 3px; height: 3px;
          border-radius: 50%;
          background: #1d1d1f;
          opacity: 0;
          transition: opacity 0.13s;
        }
        .tm-link.active .tm-link-dot { opacity: 1; }
        [data-theme="dark"] .tm-link-dot { background: rgba(255,255,255,0.9); }

        /* ── Approval badge on nav link ────────────────────────────────── */
        .tm-link-badge {
          display: inline-flex;
          align-items: center; justify-content: center;
          min-width: 16px; height: 16px;
          border-radius: 999px;
          background: #ef4444; color: #fff;
          font-size: 9.5px; font-weight: 700;
          padding: 0 4px; line-height: 1;
          flex-shrink: 0;
        }
        [data-theme="dark"] .tm-link-badge { background: #f87171; color: #1a0000; }

        .tm-mobile-badge {
          display: inline-flex;
          align-items: center; justify-content: center;
          min-width: 16px; height: 16px;
          border-radius: 999px;
          background: #ef4444; color: #fff;
          font-size: 9.5px; font-weight: 700;
          padding: 0 4px; line-height: 1;
          margin-left: auto; flex-shrink: 0;
        }

        /* ── Right controls ────────────────────────────────────────────── */
        .tm-right {
          display: flex; align-items: center;
          gap: 6px; margin-left: auto; flex-shrink: 0;
        }

        /* ── Theme toggle ──────────────────────────────────────────────── */
        .tm-theme-toggle {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          border-radius: 8px; border: none;
          background: transparent; cursor: pointer;
          color: #3a3a3c;
          transition: background 0.13s, color 0.13s;
          flex-shrink: 0;
        }
        .tm-theme-toggle:hover { background: rgba(0,0,0,0.06); }
        [data-theme="dark"] .tm-theme-toggle       { color: rgba(255,255,255,0.60); }
        [data-theme="dark"] .tm-theme-toggle:hover { color: rgba(255,255,255,0.92); background: rgba(255,255,255,0.09); }

        /* ── Notifications ─────────────────────────────────────────────── */
        .tm-notif-wrap { position: relative; }
        .tm-bell-btn {
          position: relative;
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          border-radius: 8px; border: none;
          background: transparent; cursor: pointer;
          color: #3a3a3c;
          transition: background 0.13s, color 0.13s;
          flex-shrink: 0;
        }
        .tm-bell-btn:hover { background: rgba(0,0,0,0.06); }
        [data-theme="dark"] .tm-bell-btn       { color: rgba(255,255,255,0.60); }
        [data-theme="dark"] .tm-bell-btn:hover { color: rgba(255,255,255,0.92); background: rgba(255,255,255,0.09); }

        .tm-bell-badge {
          position: absolute;
          top: 2px; right: 2px;
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 15px; height: 15px;
          border-radius: 999px;
          background: #ef4444; color: #fff;
          font-size: 9px; font-weight: 700;
          padding: 0 3px; line-height: 1;
        }
        [data-theme="dark"] .tm-bell-badge { background: #f87171; color: #1a0000; }

        .tm-notif-dropdown {
          position: absolute;
          top: calc(100% + 8px); right: 0;
          width: min(340px, 92vw);
          max-height: 420px;
          overflow-y: auto;
          background: rgba(255,255,255,0.96);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border: 0.5px solid rgba(0,0,0,0.11);
          border-radius: 13px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06);
          animation: dropIn 0.15s cubic-bezier(0.16,1,0.3,1);
        }
        [data-theme="dark"] .tm-notif-dropdown {
          background: rgba(18,22,34,0.97);
          border-color: rgba(255,255,255,0.10);
          box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.28);
        }

        .tm-notif-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 14px;
          border-bottom: 0.5px solid rgba(0,0,0,0.07);
          position: sticky; top: 0;
          background: inherit;
        }
        [data-theme="dark"] .tm-notif-header { border-bottom-color: rgba(255,255,255,0.07); }
        .tm-notif-title-bar { font-size: 13.5px; font-weight: 500; color: #1d1d1f; }
        [data-theme="dark"] .tm-notif-title-bar { color: rgba(255,255,255,0.90); }

        .tm-notif-markall {
          border: none; background: transparent; cursor: pointer;
          font-family: inherit; font-size: 12px; font-weight: 500;
          color: #4F46E5;
        }
        .tm-notif-markall:hover { text-decoration: underline; }
        [data-theme="dark"] .tm-notif-markall { color: #818cf8; }

        .tm-notif-list { padding: 4px; }
        .tm-notif-empty {
          padding: 26px 14px; text-align: center;
          font-size: 12.5px; color: #8e8e93;
        }
        [data-theme="dark"] .tm-notif-empty { color: rgba(255,255,255,0.38); }

        .tm-notif-item {
          display: flex; align-items: flex-start;
          gap: 9px; width: 100%; text-align: left;
          padding: 10px; border: none; border-radius: 9px;
          background: transparent; cursor: default;
          font-family: inherit;
          transition: background 0.12s;
        }
        .tm-notif-item.unread { cursor: pointer; background: rgba(79,70,229,0.06); }
        .tm-notif-item:hover { background: rgba(0,0,0,0.05); }
        .tm-notif-item.unread:hover { background: rgba(79,70,229,0.10); }
        [data-theme="dark"] .tm-notif-item:hover { background: rgba(255,255,255,0.07); }
        [data-theme="dark"] .tm-notif-item.unread { background: rgba(129,140,248,0.10); }
        [data-theme="dark"] .tm-notif-item.unread:hover { background: rgba(129,140,248,0.16); }

        .tm-notif-dot {
          flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%;
          margin-top: 5px; background: transparent;
        }
        .tm-notif-item.unread .tm-notif-dot { background: #4F46E5; }
        [data-theme="dark"] .tm-notif-item.unread .tm-notif-dot { background: #818cf8; }

        .tm-notif-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .tm-notif-item-title { font-size: 12.5px; font-weight: 600; color: #1d1d1f; }
        [data-theme="dark"] .tm-notif-item-title { color: rgba(255,255,255,0.90); }
        .tm-notif-item-msg {
          font-size: 12px; color: #6e6e73; line-height: 1.4;
          overflow-wrap: break-word;
        }
        [data-theme="dark"] .tm-notif-item-msg { color: rgba(255,255,255,0.50); }
        .tm-notif-item-time { font-size: 10.5px; color: #aeaeb2; }
        [data-theme="dark"] .tm-notif-item-time { color: rgba(255,255,255,0.30); }

        /* ── User menu ─────────────────────────────────────────────────── */
        .tm-user-wrap { position: relative; }
        .tm-user-btn {
          display: flex; align-items: center;
          gap: 8px; padding: 5px 10px 5px 5px;
          border-radius: 10px; border: none;
          background: transparent; cursor: pointer;
          font-family: inherit;
          transition: background 0.13s;
        }
        .tm-user-btn:hover { background: rgba(0,0,0,0.05); }
        [data-theme="dark"] .tm-user-btn:hover { background: rgba(255,255,255,0.07); }

        .tm-avatar {
          width: 28px; height: 28px;
          border-radius: 8px;
          background: #1d1d1f;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600;
          color: white; letter-spacing: 0.4px; flex-shrink: 0;
          transition: background 0.25s;
        }
        [data-theme="dark"] .tm-avatar { background: #4F46E5; }

        .tm-user-info { display: flex; flex-direction: column; align-items: flex-start; }
        .tm-user-name {
          font-size: 12.5px; font-weight: 500; color: #1d1d1f;
          line-height: 1.3; max-width: 130px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        [data-theme="dark"] .tm-user-name { color: rgba(255,255,255,0.90); }
        .tm-user-role { font-size: 11px; color: #8e8e93; text-transform: capitalize; }
        [data-theme="dark"] .tm-user-role { color: rgba(255,255,255,0.38); }

        .tm-chevron {
          color: #aeaeb2; display: flex;
          transition: transform 0.18s ease, color 0.13s; flex-shrink: 0;
        }
        .tm-user-btn.open .tm-chevron { transform: rotate(180deg); color: #3a3a3c; }
        [data-theme="dark"] .tm-chevron { color: rgba(255,255,255,0.28); }
        [data-theme="dark"] .tm-user-btn.open .tm-chevron { color: rgba(255,255,255,0.70); }

        /* ── Dropdown ──────────────────────────────────────────────────── */
        .tm-dropdown {
          position: absolute;
          top: calc(100% + 8px); right: 0;
          width: 220px;
          background: rgba(255,255,255,0.96);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border: 0.5px solid rgba(0,0,0,0.11);
          border-radius: 13px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06);
          overflow: hidden;
          animation: dropIn 0.15s cubic-bezier(0.16,1,0.3,1);
        }
        [data-theme="dark"] .tm-dropdown {
          background: rgba(18,22,34,0.97);
          border-color: rgba(255,255,255,0.10);
          box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.28);
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        .tm-dropdown-header {
          padding: 12px 14px 10px;
          border-bottom: 0.5px solid rgba(0,0,0,0.07);
        }
        [data-theme="dark"] .tm-dropdown-header { border-bottom-color: rgba(255,255,255,0.07); }
        .tm-dropdown-name  { font-size: 13.5px; font-weight: 500; color: #1d1d1f; margin-bottom: 1px; }
        .tm-dropdown-email { font-size: 12px; color: #8e8e93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        [data-theme="dark"] .tm-dropdown-name  { color: rgba(255,255,255,0.90); }
        [data-theme="dark"] .tm-dropdown-email { color: rgba(255,255,255,0.38); }

        .tm-dropdown-body { padding: 6px; }
        .tm-dropdown-item {
          display: flex; align-items: center;
          gap: 9px; width: 100%; padding: 8px 10px;
          border-radius: 8px; border: none;
          background: transparent; font-family: inherit;
          font-size: 13.5px; color: #3a3a3c;
          cursor: pointer; text-align: left;
          transition: background 0.12s, color 0.12s;
        }
        .tm-dropdown-item:hover       { background: rgba(0,0,0,0.05); }
        .tm-dropdown-item.danger      { color: #c0392b; }
        .tm-dropdown-item.danger:hover { background: rgba(192,57,43,0.07); }
        [data-theme="dark"] .tm-dropdown-item       { color: rgba(255,255,255,0.75); }
        [data-theme="dark"] .tm-dropdown-item:hover { background: rgba(255,255,255,0.07); }
        [data-theme="dark"] .tm-dropdown-item.danger       { color: #f87171; }
        [data-theme="dark"] .tm-dropdown-item.danger:hover { background: rgba(248,113,113,0.12); }

        .tm-dropdown-item-icon { display: flex; color: #8e8e93; }
        .tm-dropdown-item.danger .tm-dropdown-item-icon { color: #e74c3c; }
        [data-theme="dark"] .tm-dropdown-item-icon { color: rgba(255,255,255,0.35); }
        [data-theme="dark"] .tm-dropdown-item.danger .tm-dropdown-item-icon { color: #f87171; }

        .tm-dropdown-sep { height: 0.5px; background: rgba(0,0,0,0.07); margin: 4px 6px; }
        [data-theme="dark"] .tm-dropdown-sep { background: rgba(255,255,255,0.07); }

        /* ── Mobile ────────────────────────────────────────────────────── */
        .tm-mobile-btn {
          display: none;
          padding: 6px; border-radius: 8px;
          background: transparent; border: none;
          cursor: pointer; color: #3a3a3c;
          transition: background 0.13s;
        }
        .tm-mobile-btn:hover { background: rgba(0,0,0,0.05); }
        [data-theme="dark"] .tm-mobile-btn       { color: rgba(255,255,255,0.70); }
        [data-theme="dark"] .tm-mobile-btn:hover { background: rgba(255,255,255,0.07); }

        .tm-mobile-drawer {
          border-top: 0.5px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.97);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          padding: 10px 14px 14px;
        }
        [data-theme="dark"] .tm-mobile-drawer {
          background: rgba(11,15,26,0.97);
          border-top-color: rgba(255,255,255,0.08);
        }
        .tm-mobile-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 3px; margin-bottom: 10px;
        }
        .tm-mobile-link {
          display: flex; align-items: center;
          gap: 9px; padding: 10px 12px;
          border-radius: 10px;
          font-size: 13.5px; color: #3a3a3c;
          text-decoration: none; position: relative;
          transition: background 0.12s;
        }
        .tm-mobile-link:hover  { background: rgba(0,0,0,0.05); }
        .tm-mobile-link.active { background: rgba(0,0,0,0.07); font-weight: 500; }
        [data-theme="dark"] .tm-mobile-link        { color: rgba(255,255,255,0.68); }
        [data-theme="dark"] .tm-mobile-link:hover  { background: rgba(255,255,255,0.07); }
        [data-theme="dark"] .tm-mobile-link.active { background: rgba(255,255,255,0.10); color: rgba(255,255,255,0.95); }

        .tm-mobile-footer {
          display: flex; align-items: center; justify-content: space-between;
          border-top: 0.5px solid rgba(0,0,0,0.08);
          padding-top: 10px; margin-top: 2px;
        }
        [data-theme="dark"] .tm-mobile-footer { border-top-color: rgba(255,255,255,0.08); }
        .tm-mobile-user { display: flex; align-items: center; gap: 10px; }
        .tm-mobile-email {
          font-size: 12.5px; color: #6e6e73;
          max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        [data-theme="dark"] .tm-mobile-email { color: rgba(255,255,255,0.38); }

        .tm-mobile-actions { display: flex; align-items: center; gap: 8px; }
        .tm-mobile-theme {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          border-radius: 8px; border: 0.5px solid rgba(0,0,0,0.13);
          background: transparent; cursor: pointer; color: #3a3a3c;
          transition: background 0.12s;
        }
        .tm-mobile-theme:hover { background: rgba(0,0,0,0.05); }
        [data-theme="dark"] .tm-mobile-theme {
          border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.68);
        }
        [data-theme="dark"] .tm-mobile-theme:hover { background: rgba(255,255,255,0.07); }

        .tm-mobile-logout {
          display: flex; align-items: center;
          gap: 5px; padding: 7px 13px;
          border-radius: 8px; border: 0.5px solid rgba(0,0,0,0.13);
          font-size: 13px; background: transparent;
          cursor: pointer; color: #3a3a3c;
          font-family: inherit; transition: background 0.12s;
        }
        .tm-mobile-logout:hover { background: rgba(0,0,0,0.04); }
        [data-theme="dark"] .tm-mobile-logout {
          border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.70);
        }
        [data-theme="dark"] .tm-mobile-logout:hover { background: rgba(255,255,255,0.07); }

        /* ── Breakpoints ───────────────────────────────────────────────── */
        @media (max-width: 840px) {
          .tm-links, .tm-user-info, .tm-chevron { display: none !important; }
          .tm-mobile-btn { display: flex; }
          .tm-user-btn { padding: 4px; }
          .tm-theme-toggle { width: 28px; height: 28px; }
        }
        @media (min-width: 841px) {
          .tm-mobile-drawer, .tm-mobile-btn { display: none !important; }
        }
      `}</style>

      <nav className={`tm-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="tm-inner">

          {/* Brand */}
          <Link to="/" className="tm-brand">
            <img src="/tm.png" alt="TechMatters" className="tm-logo" />
          </Link>

          {/* Desktop links */}
          <div className="tm-links">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`tm-link${isActive(link.to) ? ' active' : ''}`}
              >
                <span className="tm-link-icon">{link.icon}</span>
                {link.label}
                {link.badge != null && link.badge > 0 && (
                  <span className="tm-link-badge">
                    {link.badge > 99 ? '99+' : link.badge}
                  </span>
                )}
                <span className="tm-link-dot" />
              </Link>
            ))}
          </div>

          {/* Right controls */}
          <div className="tm-right">
            {/* Notifications */}
            <div className="tm-notif-wrap" ref={notifMenuRef}>
              <button
                className="tm-bell-btn"
                onClick={() => setNotifOpen(v => !v)}
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="tm-bell-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="tm-notif-dropdown">
                  <div className="tm-notif-header">
                    <span className="tm-notif-title-bar">Notifications</span>
                    {unreadCount > 0 && (
                      <button className="tm-notif-markall" onClick={markAllNotificationsRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="tm-notif-list">
                    {notifLoading ? (
                      <div className="tm-notif-empty">Loading…</div>
                    ) : notifications.length === 0 ? (
                      <div className="tm-notif-empty">No notifications yet</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n._id}
                          className={`tm-notif-item${n.read ? '' : ' unread'}`}
                          onClick={() => !n.read && markNotificationRead(n._id)}
                        >
                          <span className="tm-notif-dot" />
                          <span className="tm-notif-body">
                            <span className="tm-notif-item-title">{n.title}</span>
                            <span className="tm-notif-item-msg">{n.message}</span>
                            <span className="tm-notif-item-time">{timeAgo(n.createdAt)}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              className="tm-theme-toggle"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* User dropdown */}
            <div className="tm-user-wrap" ref={userMenuRef}>
              <button
                className={`tm-user-btn${userMenuOpen ? ' open' : ''}`}
                onClick={() => setUserMenuOpen(v => !v)}
              >
                <div className="tm-avatar">{initials}</div>
                <div className="tm-user-info">
                  <span className="tm-user-name">{user.email?.split('@')[0]}</span>
                  <span className="tm-user-role">{user.accessLevel?.replace('-', ' ')}</span>
                </div>
                <span className="tm-chevron"><ChevronDown size={14} /></span>
              </button>

              {userMenuOpen && (
                <div className="tm-dropdown">
                  <div className="tm-dropdown-header">
                    <div className="tm-dropdown-name">{user.email?.split('@')[0]}</div>
                    <div className="tm-dropdown-email">{user.email}</div>
                  </div>
                  <div className="tm-dropdown-body">
                    <div className="tm-dropdown-sep" />
                    <button
                      className="tm-dropdown-item danger"
                      onClick={() => { logout(); navigate('/login'); }}
                    >
                      <span className="tm-dropdown-item-icon"><LogOut size={14} /></span>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              className="tm-mobile-btn"
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div className="tm-mobile-drawer">
            <div className="tm-mobile-grid">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`tm-mobile-link${isActive(link.to) ? ' active' : ''}`}
                >
                  <span style={{ color: '#8e8e93', display: 'flex', flexShrink: 0 }}>
                    {link.icon}
                  </span>
                  {link.label}
                  {link.badge != null && link.badge > 0 && (
                    <span className="tm-mobile-badge">
                      {link.badge > 99 ? '99+' : link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>

            <div className="tm-mobile-footer">
              <div className="tm-mobile-user">
                <div className="tm-avatar">{initials}</div>
                <span className="tm-mobile-email">{user.email}</span>
              </div>
              <div className="tm-mobile-actions">
                <button
                  className="tm-mobile-theme"
                  onClick={toggleTheme}
                  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                <button
                  className="tm-mobile-logout"
                  onClick={() => { logout(); navigate('/login'); setMobileMenuOpen(false); }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <div style={{ height: 58 }} />
    </>
  );
};