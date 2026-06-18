import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import { Login } from './components/auth/Login';
import { Navbar } from './components/Layout/Navbar';

// ── Global design system — import once here ───────────────────────────────────
// Adjust path if you placed theme.css elsewhere.
import '../src/styles/theme.css';

// ── Lazy pages (existing — unchanged) ────────────────────────────────────────
const EmployeeDashboard     = lazy(() => import('./components/Dashboard/EmployeeDashboard').then(m => ({ default: m.EmployeeDashboard })));
const EmployeeMonthlyReport = lazy(() => import('./components/Dashboard/Employeemonthlyreport').then(m => ({ default: m.EmployeeMonthlyReport })));
const MonthlyReport         = lazy(() => import('./components/Reports/MonthlyReport').then(m => ({ default: m.MonthlyReport })));
const AdminDashboard        = lazy(() => import('./components/Admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminReportReview     = lazy(() => import('./components/Admin/Adminreportreview').then(m => ({ default: m.AdminReportReview })));
const PerformanceDashboard  = lazy(() => import('./components/Admin/PerformanceDashboard').then(m => ({ default: m.PerformanceDashboard })));
const UserForm              = lazy(() => import('./components/Admin/UserForm').then(m => ({ default: m.UserForm })));
const UserList              = lazy(() => import('./components/Admin/UserList').then(m => ({ default: m.UserList })));
const HRDashboard           = lazy(() => import('./components/Hr/HRDashboard').then(m => ({ default: m.HRDashboard })));
const ProjectForm           = lazy(() => import('./components/Projects/ProjectForm').then(m => ({ default: m.ProjectForm })));
const ProjectList           = lazy(() => import('./components/Projects/ProjectList').then(m => ({ default: m.ProjectList })));
const TaskList              = lazy(() => import('./components/Tasks/TaskList').then(m => ({ default: m.TaskList })));
const TaskForm              = lazy(() => import('./components/Tasks/TaskForm').then(m => ({ default: m.TaskForm })));
const ActivityList          = lazy(() => import('./components/Activities/ActivityList').then(m => ({ default: m.ActivityList })));
const ActivityForm          = lazy(() => import('./components/Activities/ActivityForm').then(m => ({ default: m.ActivityForm })));
const ReimbursementList     = lazy(() => import('./components/Reimbursements/ReimbursementList').then(m => ({ default: m.ReimbursementList })));
const ReimbursementForm     = lazy(() => import('./components/Reimbursements/ReimbursementForm').then(m => ({ default: m.ReimbursementForm })));
const ReimbursementDetail   = lazy(() => import('./components/Reimbursements/ReimbursementDetail').then(m => ({ default: m.ReimbursementDetail })));

// ── Lazy pages (new features) ─────────────────────────────────────────────────
// Adjust paths if you placed these files under components/ instead of pages/.
const AssignedTasks     = lazy(() => import('../src/components/AssignedTasks/index'));
const TaskApprovalQueue = lazy(() => import('../src/components/TaskApproval/index'));

// ── Full-screen loader (theme-aware) ──────────────────────────────────────────
const FullScreenLoader: React.FC<{ label?: string }> = ({ label = 'Loading workspace…' }) => (
  <div
    style={{
      minHeight: '100vh',
      // Uses CSS variables — automatically correct for both light and dark.
      background: 'var(--bg-app)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
      transition: 'background 0.35s ease',
    }}
  >
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        border: '2px solid var(--border-default)',
        borderTopColor: 'var(--color-primary)',
        animation: 'app-spin 0.85s linear infinite',
      }}
    />
    <style>{`@keyframes app-spin { to { transform: rotate(360deg); } }`}</style>
    <span
      style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: 'var(--text-tertiary)',
        letterSpacing: '0.08em',
      }}
    >
      {label}
    </span>
  </div>
);

// ── Role mapping ──────────────────────────────────────────────────────────────
// The new feature pages accept a `role` prop ('admin' | 'hr' | 'employee').
// We derive it from your existing `accessLevel` field here.
//
// ⚠️  Backend note: your taskApproval.js routes check `req.user.role`.
//     If your JWT payload uses `accessLevel` instead of `role`, update the
//     backend checks to: req.user.accessLevel === 'admin' || 'super-admin'.
const deriveRole = (accessLevel?: string): 'admin' | 'hr' | 'employee' => {
  if (accessLevel === 'admin' || accessLevel === 'super-admin') return 'admin';
  if (accessLevel === 'hr') return 'hr';
  return 'employee';
};

// ── Role-based landing redirect (unchanged logic) ─────────────────────────────
const HomeRedirect: React.FC = () => {
  const { user } = useAuth();
  const level = user?.accessLevel;
  if (level === 'hr')                               return <Navigate to="/hr"    replace />;
  if (level === 'admin' || level === 'super-admin') return <Navigate to="/admin" replace />;
  return <EmployeeDashboard />;
};

// ── All app routes ─────────────────────────────────────────────────────────────
const AppRoutes: React.FC = () => {
  const { user, authReady } = useAuth();

  // Block ALL routes until the auth token check completes so every dashboard
  // mounts with `user` already populated — no refresh-after-login needed.
  if (!authReady) return <FullScreenLoader />;

  // Adapter for new feature pages that expect { _id, name, role }.
  const currentUser = {
    _id:  (user as any)?._id  ?? (user as any)?.id ?? '',
    name: (user as any)?.name ?? user?.email?.split('@')[0] ?? '',
    role: deriveRole(user?.accessLevel),
  };

  return (
    <>
      <Navbar />
      <Suspense fallback={<FullScreenLoader />}>
        <AnimatePresence mode="wait">
          <Routes>

            {/* ── Public ───────────────────────────────────────────────── */}
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <Login />}
            />

            {/* ── Protected (existing — unchanged) ─────────────────────── */}
            <Route path="/"                   element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
            <Route path="/monthly-report"     element={<ProtectedRoute><MonthlyReport /></ProtectedRoute>} />
            <Route path="/admin"              element={<ProtectedRoute><EmployeeDashboard /></ProtectedRoute>} />
            <Route path="/hr"                 element={<ProtectedRoute><HRDashboard /></ProtectedRoute>} />
            <Route path="/users"              element={<ProtectedRoute><UserList /></ProtectedRoute>} />
            <Route path="/users/new"          element={<ProtectedRoute><UserForm /></ProtectedRoute>} />
            <Route path="/users/:id"          element={<ProtectedRoute><UserForm /></ProtectedRoute>} />
            <Route path="/projects"           element={<ProtectedRoute><ProjectList /></ProtectedRoute>} />
            <Route path="/projects/new"       element={<ProtectedRoute><ProjectForm /></ProtectedRoute>} />
            <Route path="/projects/:id"       element={<ProtectedRoute><ProjectForm /></ProtectedRoute>} />
            <Route path="/tasks"              element={<ProtectedRoute><TaskList /></ProtectedRoute>} />
            <Route path="/tasks/new"          element={<ProtectedRoute><TaskForm /></ProtectedRoute>} />
            <Route path="/tasks/:id"          element={<ProtectedRoute><TaskForm /></ProtectedRoute>} />
            <Route path="/activities"         element={<ProtectedRoute><ActivityList /></ProtectedRoute>} />
            <Route path="/activities/new"     element={<ProtectedRoute><ActivityForm /></ProtectedRoute>} />
            <Route path="/activities/:id"     element={<ProtectedRoute><ActivityForm /></ProtectedRoute>} />
            <Route path="/reimbursements"     element={<ProtectedRoute><ReimbursementList /></ProtectedRoute>} />
            <Route path="/reimbursements/new" element={<ProtectedRoute><ReimbursementForm /></ProtectedRoute>} />
            <Route path="/reimbursements/:id" element={<ProtectedRoute><ReimbursementDetail /></ProtectedRoute>} />
            <Route path="/performance"        element={<ProtectedRoute><PerformanceDashboard /></ProtectedRoute>} />
            <Route path="/my-performance"     element={<ProtectedRoute><EmployeeMonthlyReport /></ProtectedRoute>} />
            <Route path="/admin-reports"      element={<ProtectedRoute><AdminReportReview /></ProtectedRoute>} />

            {/* ── Protected (new feature routes) ───────────────────────── */}
            <Route
              path="/my-tasks"
              element={
                <ProtectedRoute>
                  <AssignedTasks currentUser={currentUser} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/task-approvals"
              element={
                <ProtectedRoute>
                  <TaskApprovalQueue currentUser={currentUser} />
                </ProtectedRoute>
              }
            />

            {/* ── Fallback ──────────────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </AnimatePresence>
      </Suspense>
    </>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>      {/* ← reads localStorage on init, no flash */}
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;