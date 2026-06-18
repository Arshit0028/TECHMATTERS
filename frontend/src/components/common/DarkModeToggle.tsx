import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface DarkModeToggleProps {
  compact?: boolean; // true = icon only, false = labelled pill
}

const DarkModeToggle: React.FC<DarkModeToggleProps> = ({ compact = false }) => {
  const { isDark, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-sidebar)',
          fontSize: '17px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background var(--transition-fast)',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-sidebar-hover)')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
      >
        {isDark ? '☀️' : '🌙'}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 14px',
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-full)',
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        fontSize: '13px',
        fontFamily: 'inherit',
        fontWeight: 500,
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-focus)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
      }}
    >
      {isDark ? <><span>☀️</span><span>Light Mode</span></> : <><span>🌙</span><span>Dark Mode</span></>}
    </button>
  );
};

export default DarkModeToggle;