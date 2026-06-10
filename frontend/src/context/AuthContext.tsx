import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin, register as apiRegister, getMe } from '../api/client';
import { clearCache } from '../lib/queryCache';
import type { User } from '../components/types/index';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser]           = useState<User | null>(null);
  const [loading, setLoading]     = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const token      = localStorage.getItem('token');
    const cachedUser = localStorage.getItem('user');

    if (!token) {
      setLoading(false);
      setAuthReady(true);
      return;
    }

    if (cachedUser) {
      try { setUser(JSON.parse(cachedUser)); } catch {}
    }

    getMe()
      .then(res => {
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
        setAuthReady(true);
      });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await apiRegister(name, email, password);
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearCache(); // drop all cached query data so it never leaks to the next session
    setUser(null);
  };

  // Keep spinner until initial token check finishes
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          border: '2px solid rgba(167,139,250,0.18)',
          borderTopColor: '#a78bfa',
          animation: 'auth-spin 0.85s linear infinite',
        }} />
        <style>{`@keyframes auth-spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{
          fontFamily: 'system-ui, sans-serif', fontSize: 12,
          color: 'rgba(255,255,255,0.22)', letterSpacing: '0.08em',
        }}>Loading workspace…</span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, authReady, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};