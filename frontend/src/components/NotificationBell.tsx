// src/components/common/NotificationBell.tsx
//
// Drop this into your existing Navbar.tsx, e.g.:
//   import { NotificationBell } from '../common/NotificationBell';
//   ... <NotificationBell />  (anywhere in the top bar / near the user avatar)
//
// Self-contained: fetches its own data, polls every 60s, no props required.
// Uses CSS variables from theme.css with safe fallbacks, so it should match
// your existing chrome without needing edits.

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api/client';

interface NotificationItem {
  _id: string;
  type: 'activity_created' | 'activity_reminder';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export const NotificationBell: React.FC = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await getNotifications();
      setItems(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleItemClick = async (item: NotificationItem) => {
    if (item.read) return;
    // Optimistic update.
    setItems((prev) => prev.map((n) => (n._id === item._id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(item._id);
    } catch (err) {
      console.error('Failed to mark notification read', err);
      fetchNotifications(); // resync on failure
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.error('Failed to mark all read', err);
      fetchNotifications();
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          borderRadius: 'var(--radius-md, 10px)',
          border: 'none',
          background: open ? 'var(--bg-hover, rgba(0,0,0,0.06))' : 'transparent',
          cursor: 'pointer',
          color: 'var(--text-primary, #1a1a1a)',
        }}
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: 'var(--color-danger, #ef4444)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 999,
              minWidth: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 46,
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--bg-surface, #ffffff)',
            border: '1px solid var(--border-default, #e5e7eb)',
            borderRadius: 'var(--radius-lg, 14px)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-default, #e5e7eb)',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #1a1a1a)' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  color: 'var(--color-primary, #6366f1)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
              No notifications yet
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item._id}
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'flex',
                  width: '100%',
                  textAlign: 'left',
                  gap: 10,
                  padding: '12px 16px',
                  border: 'none',
                  borderBottom: '1px solid var(--border-default, #f1f1f1)',
                  background: item.read ? 'transparent' : 'var(--bg-app, #f9fafb)',
                  cursor: item.read ? 'default' : 'pointer',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    marginTop: 6,
                    background: item.read ? 'transparent' : 'var(--color-primary, #6366f1)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #1a1a1a)' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', marginTop: 2 }}>
                    {item.message}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary, #9ca3af)', marginTop: 4 }}>
                    {timeAgo(item.createdAt)}
                  </div>
                </div>
                {item.read && <Check size={14} color="var(--text-secondary, #9ca3af)" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};