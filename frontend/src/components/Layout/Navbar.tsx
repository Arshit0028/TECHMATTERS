import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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
  FileText,
} from 'lucide-react';

import { useState, useEffect, useRef } from 'react';

export const Navbar = () => {
  const { user, logout } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!user) return null;

  const isAdmin =
    user.accessLevel === 'admin' ||
    user.accessLevel === 'super-admin';

  const isHR = user.accessLevel === 'hr';

  // HR and admins share the same expanded menu (Team + Performance);
  // everyone else gets the personal "My Performance" link.
  const hasAdminMenu = isAdmin || isHR;

  const navLinks = [
    {
      to: '/',
      icon: <LayoutDashboard size={15} />,
      label: 'Dashboard',
    },

    {
      to: '/monthly-report',
      icon: <FileText size={15} />,
      label: 'Report',
    },

    {
      to: '/projects',
      icon: <FolderKanban size={15} />,
      label: 'Projects',
    },

    {
      to: '/tasks',
      icon: <CheckSquare size={15} />,
      label: 'Tasks',
    },

    {
      to: '/activities',
      icon: <ActivityIcon size={15} />,
      label: 'Activities',
    },

    {
      to: '/reimbursements',
      icon: <Receipt size={15} />,
      label: 'Claims',
    },

    ...(hasAdminMenu
      ? [
          {
            to: '/users',
            icon: <Users size={15} />,
            label: 'Team',
          },

          {
            to: '/admin-reports',
            icon: <CheckSquare size={15} />,
            label: 'Performance',
          },
        ]
      : [
          {
            to: '/my-performance',
            icon: <ActivityIcon size={15} />,
            label: 'My Performance',
          },
        ]),
  ];

  const initials = user.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'TM';

  const isActive = (to: string) =>
    to === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(to);

  return (
    <>
      <style>{`
        .tm-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;

          font-family:
            -apple-system,
            BlinkMacSystemFont,
            'Helvetica Neue',
            sans-serif;

          transition:
            background 0.25s ease,
            border-color 0.25s ease,
            box-shadow 0.25s ease;

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

        .tm-inner {
          max-width: 1360px;
          margin: 0 auto;

          padding: 0 28px;

          height: 58px;

          display: flex;
          align-items: center;

          gap: 0;
        }

        .tm-brand {
          display: flex;
          align-items: center;

          text-decoration: none;

          flex-shrink: 0;

          margin-right: 32px;
        }

        .tm-logo {
          height: 34px;
          width: auto;

          display: block;

          object-fit: contain;
        }

        .tm-links {
          display: flex;
          align-items: center;

          gap: 1px;

          flex: 1;
        }

        .tm-link {
          position: relative;

          display: flex;
          align-items: center;

          gap: 6px;

          padding: 6px 13px;

          border-radius: 9px;

          font-size: 13.5px;
          font-weight: 400;

          color: #48484a;

          text-decoration: none;

          letter-spacing: -0.1px;

          white-space: nowrap;

          transition:
            color 0.13s ease,
            background 0.13s ease;

          font-family: inherit;
        }

        .tm-link:hover {
          color: #1d1d1f;
          background: rgba(0,0,0,0.05);
        }

        .tm-link.active {
          color: #1d1d1f;
          background: rgba(0,0,0,0.07);
          font-weight: 500;
        }

        .tm-link-icon {
          display: flex;
          align-items: center;

          color: #8e8e93;

          transition: color 0.13s;

          flex-shrink: 0;
        }

        .tm-link:hover .tm-link-icon,
        .tm-link.active .tm-link-icon {
          color: #3a3a3c;
        }

        .tm-link-dot {
          position: absolute;

          bottom: 3px;
          left: 50%;

          transform: translateX(-50%);

          width: 3px;
          height: 3px;

          border-radius: 50%;

          background: #1d1d1f;

          opacity: 0;

          transition: opacity 0.13s;
        }

        .tm-link.active .tm-link-dot {
          opacity: 1;
        }

        .tm-right {
          display: flex;
          align-items: center;

          gap: 8px;

          margin-left: auto;

          flex-shrink: 0;
        }

        .tm-user-wrap {
          position: relative;
        }

        .tm-user-btn {
          display: flex;
          align-items: center;

          gap: 8px;

          padding: 5px 10px 5px 5px;

          border-radius: 10px;

          border: none;

          background: transparent;

          cursor: pointer;

          font-family: inherit;

          transition: background 0.13s;
        }

        .tm-user-btn:hover {
          background: rgba(0,0,0,0.05);
        }

        .tm-avatar {
          width: 28px;
          height: 28px;

          border-radius: 8px;

          background: #1d1d1f;

          display: flex;
          align-items: center;
          justify-content: center;

          font-size: 10px;
          font-weight: 600;

          color: white;

          letter-spacing: 0.4px;

          flex-shrink: 0;
        }

        .tm-user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .tm-user-name {
          font-size: 12.5px;
          font-weight: 500;

          color: #1d1d1f;

          line-height: 1.3;

          max-width: 130px;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tm-user-role {
          font-size: 11px;

          color: #8e8e93;

          text-transform: capitalize;
        }

        .tm-chevron {
          color: #aeaeb2;

          display: flex;

          transition:
            transform 0.18s ease,
            color 0.13s;

          flex-shrink: 0;
        }

        .tm-user-btn.open .tm-chevron {
          transform: rotate(180deg);
          color: #3a3a3c;
        }

        .tm-dropdown {
          position: absolute;

          top: calc(100% + 8px);
          right: 0;

          width: 220px;

          background: rgba(255,255,255,0.96);

          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);

          border: 0.5px solid rgba(0,0,0,0.11);

          border-radius: 13px;

          box-shadow:
            0 8px 32px rgba(0,0,0,0.10),
            0 2px 8px rgba(0,0,0,0.06);

          overflow: hidden;

          animation: dropIn 0.15s cubic-bezier(0.16,1,0.3,1);
        }

        @keyframes dropIn {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.97);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .tm-dropdown-header {
          padding: 12px 14px 10px;

          border-bottom: 0.5px solid rgba(0,0,0,0.07);
        }

        .tm-dropdown-name {
          font-size: 13.5px;
          font-weight: 500;

          color: #1d1d1f;

          margin-bottom: 1px;
        }

        .tm-dropdown-email {
          font-size: 12px;

          color: #8e8e93;

          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tm-dropdown-body {
          padding: 6px;
        }

        .tm-dropdown-item {
          display: flex;
          align-items: center;

          gap: 9px;

          width: 100%;

          padding: 8px 10px;

          border-radius: 8px;

          border: none;

          background: transparent;

          font-family: inherit;

          font-size: 13.5px;

          color: #3a3a3c;

          cursor: pointer;

          text-align: left;

          transition:
            background 0.12s,
            color 0.12s;
        }

        .tm-dropdown-item:hover {
          background: rgba(0,0,0,0.05);
        }

        .tm-dropdown-item.danger {
          color: #c0392b;
        }

        .tm-dropdown-item.danger:hover {
          background: rgba(192,57,43,0.07);
        }

        .tm-dropdown-item-icon {
          display: flex;

          color: #8e8e93;
        }

        .tm-dropdown-item.danger .tm-dropdown-item-icon {
          color: #e74c3c;
        }

        .tm-dropdown-sep {
          height: 0.5px;

          background: rgba(0,0,0,0.07);

          margin: 4px 6px;
        }

        .tm-mobile-btn {
          display: none;

          padding: 6px;

          border-radius: 8px;

          background: transparent;

          border: none;

          cursor: pointer;

          color: #3a3a3c;

          transition: background 0.13s;
        }

        .tm-mobile-btn:hover {
          background: rgba(0,0,0,0.05);
        }

        .tm-mobile-drawer {
          border-top: 0.5px solid rgba(0,0,0,0.08);

          background: rgba(255,255,255,0.97);

          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);

          padding: 10px 14px 14px;
        }

        .tm-mobile-grid {
          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 3px;

          margin-bottom: 10px;
        }

        .tm-mobile-link {
          display: flex;
          align-items: center;

          gap: 9px;

          padding: 10px 12px;

          border-radius: 10px;

          font-size: 13.5px;

          color: #3a3a3c;

          text-decoration: none;

          transition: background 0.12s;
        }

        .tm-mobile-link:hover {
          background: rgba(0,0,0,0.05);
        }

        .tm-mobile-link.active {
          background: rgba(0,0,0,0.07);

          font-weight: 500;
        }

        .tm-mobile-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;

          border-top: 0.5px solid rgba(0,0,0,0.08);

          padding-top: 10px;
        }

        .tm-mobile-user {
          display: flex;
          align-items: center;

          gap: 10px;
        }

        .tm-mobile-email {
          font-size: 12.5px;

          color: #6e6e73;

          max-width: 180px;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tm-mobile-logout {
          display: flex;
          align-items: center;

          gap: 5px;

          padding: 7px 13px;

          border-radius: 8px;

          border: 0.5px solid rgba(0,0,0,0.13);

          font-size: 13px;

          background: transparent;

          cursor: pointer;
        }

        .tm-mobile-logout:hover {
          background: rgba(0,0,0,0.04);
        }

        @media (max-width: 840px) {
          .tm-links,
          .tm-user-info,
          .tm-chevron {
            display: none !important;
          }

          .tm-mobile-btn {
            display: flex;
          }

          .tm-user-btn {
            padding: 4px;
          }
        }

        @media (min-width: 841px) {
          .tm-mobile-drawer,
          .tm-mobile-btn {
            display: none !important;
          }
        }
      `}</style>

      <nav className={`tm-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="tm-inner">

          <Link to="/" className="tm-brand">
            <img
              src="/tm.png"
              alt="TechMatters"
              className="tm-logo"
            />
          </Link>

          <div className="tm-links">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`tm-link${
                  isActive(link.to) ? ' active' : ''
                }`}
              >
                <span className="tm-link-icon">
                  {link.icon}
                </span>

                {link.label}

                <span className="tm-link-dot" />
              </Link>
            ))}
          </div>

          <div className="tm-right">

            <div
              className="tm-user-wrap"
              ref={userMenuRef}
            >
              <button
                className={`tm-user-btn${
                  userMenuOpen ? ' open' : ''
                }`}
                onClick={() =>
                  setUserMenuOpen(!userMenuOpen)
                }
              >
                <div className="tm-avatar">
                  {initials}
                </div>

                <div className="tm-user-info">
                  <span className="tm-user-name">
                    {user.email?.split('@')[0]}
                  </span>

                  <span className="tm-user-role">
                    {user.accessLevel?.replace('-', ' ')}
                  </span>
                </div>

                <span className="tm-chevron">
                  <ChevronDown size={14} />
                </span>
              </button>

              {userMenuOpen && (
                <div className="tm-dropdown">

                  <div className="tm-dropdown-header">
                    <div className="tm-dropdown-name">
                      {user.email?.split('@')[0]}
                    </div>

                    <div className="tm-dropdown-email">
                      {user.email}
                    </div>
                  </div>

                  <div className="tm-dropdown-body">

                    <div className="tm-dropdown-sep" />

                    <button
                      className="tm-dropdown-item danger"
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                    >
                      <span className="tm-dropdown-item-icon">
                        <LogOut size={14} />
                      </span>

                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              className="tm-mobile-btn"
              onClick={() =>
                setMobileMenuOpen(!mobileMenuOpen)
              }
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X size={20} />
              ) : (
                <Menu size={20} />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="tm-mobile-drawer">

            <div className="tm-mobile-grid">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`tm-mobile-link${
                    isActive(link.to)
                      ? ' active'
                      : ''
                  }`}
                >
                  <span
                    style={{
                      color: '#8e8e93',
                      display: 'flex',
                    }}
                  >
                    {link.icon}
                  </span>

                  {link.label}
                </Link>
              ))}
            </div>

            <div className="tm-mobile-footer">

              <div className="tm-mobile-user">
                <div className="tm-avatar">
                  {initials}
                </div>

                <span className="tm-mobile-email">
                  {user.email}
                </span>
              </div>

              <button
                className="tm-mobile-logout"
                onClick={() => {
                  logout();
                  navigate('/login');
                  setMobileMenuOpen(false);
                }}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        )}
      </nav>

      <div style={{ height: 58 }} />
    </>
  );
};