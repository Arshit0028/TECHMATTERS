import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/Layout/ProtectedRoute';

import { Login } from './components/auth/Login';
import { Navbar } from './components/Layout/Navbar';


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

const FullScreenLoader: React.FC<{ label?: string }> = ({ label = 'Loading workspace…' }) => (
  <div style={{
    minHeight: '100vh',
    background: '#080810',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 16,
  }}>
    <div style={{
      width: 38,
      height: 38,
      borderRadius: '50%',
      border: '2px solid rgba(167,139,250,0.18)',
      borderTopColor: '#a78bfa',
      animation: 'auth-spin 0.85s linear infinite',
    }} />
    <style>{`@keyframes auth-spin { to { transform: rotate(360deg); } }`}</style>
    <span style={{
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12,
      color: 'rgba(255,255,255,0.22)',
      letterSpacing: '0.08em',
    }}>
      {label}
    </span>
  </div>
);

// ─── Role-based landing redirect (unchanged logic) ────────────────────────────
const HomeRedirect: React.FC = () => {
  const { user } = useAuth();
  const level = user?.accessLevel;

  if (level === 'hr') return <Navigate to="/hr" replace />;
  if (level === 'admin' || level === 'super-admin') return <Navigate to="/admin" replace />;
  return <EmployeeDashboard />;
};

// ─── All app routes ───────────────────────────────────────────────────────────
const AppRoutes: React.FC = () => {
  const { user, authReady } = useAuth();

  // Block ALL routes until auth token check completes.
  // This guarantees every dashboard mounts with user already populated —
  // eliminating the need to refresh after login. (Unchanged.)
  if (!authReady) return <FullScreenLoader />;

  return (
    <>
      <Navbar />
      <Suspense fallback={<FullScreenLoader />}>
        <AnimatePresence mode="wait">
          <Routes>
            {/* Public */}
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <Login />}
            />

            {/* Protected */}
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

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;