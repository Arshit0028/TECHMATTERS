import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const Login = () => {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      // Use replace so back-button doesn't return to /login
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      background: '#f5f5f7',
    }}>
      <style>{`
        .lp-left {
          flex: 1; display: flex; flex-direction: column;
          justify-content: space-between; padding: 56px 64px;
          background: #1d1d1f; position: relative; overflow: hidden;
        }
        .lp-left::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse at 25% 55%, rgba(99,99,102,0.22) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp-grid-bg {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .lp-brand-mark { display: flex; align-items: center; gap: 10px; position: relative; }
        .lp-hero { position: relative; }
        .lp-headline {
          font-size: 40px; font-weight: 600; color: white;
          letter-spacing: -1.2px; line-height: 1.16; margin-bottom: 18px;
        }
        .lp-headline span { color: rgba(255,255,255,0.3); }
        .lp-sub { font-size: 14.5px; color: rgba(255,255,255,0.42); line-height: 1.65; max-width: 320px; }
        .lp-features { display: flex; flex-direction: column; gap: 14px; position: relative; }
        .lp-feat { display: flex; align-items: center; gap: 11px; }
        .lp-feat-dot { width: 5px; height: 2px; border-radius: 50%; background: rgba(255,255,255,0.2); flex-shrink: 0; }
        .lp-feat-text { font-size: 13px; color: rgba(255,255,255,0.38); letter-spacing: -0.1px; }
        .lp-right {
          width: 460px; flex-shrink: 0; display: flex; flex-direction: column;
          justify-content: center; padding: 60px 52px; background: #f5f5f7;
        }
        .lp-eyebrow { font-size: 11px; font-weight: 500; color: #8e8e93; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; }
        .lp-heading { font-size: 26px; font-weight: 600; color: #1d1d1f; letter-spacing: -0.6px; margin-bottom: 6px; }
        .lp-subhead { font-size: 14px; color: #6e6e73; margin-bottom: 32px; letter-spacing: -0.1px; }
        .lp-field { margin-bottom: 12px; }
        .lp-label { font-size: 11.5px; font-weight: 500; color: #3a3a3c; letter-spacing: 0.1px; margin-bottom: 6px; display: block; }
        .lp-input-wrap { position: relative; }
        .lp-input-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #aeaeb2; pointer-events: none; display: flex; }
        .lp-input {
          width: 100%; padding: 11px 13px 11px 38px; background: white;
          border: 0.5px solid rgba(0,0,0,0.12); border-radius: 10px;
          font-size: 14px; color: #1d1d1f; font-family: inherit; outline: none;
          transition: border-color 0.14s, box-shadow 0.14s; box-sizing: border-box; -webkit-appearance: none;
        }
        .lp-input::placeholder { color: #c7c7cc; }
        .lp-input:hover { border-color: rgba(0,0,0,0.2); }
        .lp-input:focus { border-color: #1d1d1f; box-shadow: 0 0 0 3px rgba(29,29,31,0.07); }
        .lp-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #aeaeb2; padding: 2px; display: flex; transition: color 0.12s; }
        .lp-eye:hover { color: #3a3a3c; }
        .lp-error { display: flex; align-items: center; gap: 8px; background: #fff1f1; border: 0.5px solid rgba(226,75,74,0.22); border-radius: 8px; padding: 9px 12px; margin-bottom: 14px; }
        .lp-error-dot { width: 5px; height: 5px; border-radius: 50%; background: #e24b4a; flex-shrink: 0; }
        .lp-error-text { font-size: 13px; color: #a32d2d; }
        .lp-submit {
          width: 100%; padding: 12px; background: #1d1d1f; color: white;
          border: none; border-radius: 10px; font-size: 14.5px; font-weight: 500;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.14s, transform 0.1s; letter-spacing: -0.1px; margin-top: 22px;
        }
        .lp-submit:hover { background: #3a3a3c; }
        .lp-submit:active { transform: scale(0.99); }
        .lp-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .lp-hint { margin-top: 20px; text-align: center; font-size: 12px; color: #aeaeb2; line-height: 1.6; }
        @media (max-width: 860px) { .lp-left { display: none; } .lp-right { width: 100%; padding: 48px 32px; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="lp-left">
        <div className="lp-grid-bg" />
        <div className="lp-brand-mark">
          <img src="/tm.png" alt="TechMatters" style={{ height: 48 }} />
        </div>
        <div className="lp-hero">
          <h1 className="lp-headline">Work flows<br /><span>better here.</span></h1>
          <p className="lp-sub">A unified workspace for projects, tasks, and team — built for teams that move fast.</p>
        </div>
        <div className="lp-features">
          {['Project tracking across every team','Real-time activity and reporting','Seamless reimbursement workflows','Role-based access and permissions'].map(f => (
            <div key={f} className="lp-feat"><div className="lp-feat-dot" /><span className="lp-feat-text">{f}</span></div>
          ))}
        </div>
      </div>

      <div className="lp-right">
        <p className="lp-eyebrow">TechMatters Project Management</p>
        <h2 className="lp-heading">Welcome back</h2>
        <p className="lp-subhead">Sign in with your credentials to continue.</p>

        <form onSubmit={handleSubmit}>
          <div className="lp-field">
            <label className="lp-label">Email address</label>
            <div className="lp-input-wrap">
              <span className="lp-input-icon"><Mail size={15} /></span>
              <input type="email" placeholder="you@techmatters.io" value={email}
                onChange={e => setEmail(e.target.value)} className="lp-input" required autoComplete="email" />
            </div>
          </div>
          <div className="lp-field">
            <label className="lp-label">Password</label>
            <div className="lp-input-wrap">
              <span className="lp-input-icon"><Lock size={15} /></span>
              <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} className="lp-input" required
                style={{ paddingRight: 40 }} autoComplete="current-password" />
              <button type="button" className="lp-eye" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="lp-error">
              <div className="lp-error-dot" />
              <span className="lp-error-text">{error}</span>
            </motion.div>
          )}

          <button type="submit" disabled={loading} className="lp-submit">
            {loading
              ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <>Sign in <ArrowRight size={15} /></>}
          </button>
        </form>

        <p className="lp-hint">Access is managed by your administrator.<br />Contact your admin if you need help signing in.</p>
      </div>
    </div>
  );
};