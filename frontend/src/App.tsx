import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/auth/Login';
import { EmployeeDashboard } from './components/Dashboard/EmployeeDashboard';
import { MonthlyReport } from './components/Reports/MonthlyReport';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { UserForm } from './components/Admin/UserForm';
import { UserList } from './components/Admin/UserList';
import { ProjectForm } from './components/Projects/ProjectForm';
import { ProjectList } from './components/Projects/ProjectList';
import { TaskList } from './components/Tasks/TaskList';
import { TaskForm } from './components/Tasks/TaskForm';
import { ActivityList } from './components/Activities/ActivityList';
import { ActivityForm } from './components/Activities/ActivityForm';
import { ReimbursementList } from './components/Reimbursements/ReimbursementList';
import { ReimbursementForm } from './components/Reimbursements/ReimbursementForm';
import { ReimbursementDetail } from './components/Reimbursements/ReimbursementDetail';
import { Navbar } from './components/Layout/Navbar';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import { PerformanceDashboard } from './components/Admin/PerformanceDashboard';
import { EmployeeMonthlyReport } from './components/Dashboard/Employeemonthlyreport';
import { AdminReportReview } from './components/Admin/Adminreportreview';

// ─── Full-screen auth loader ──────────────────────────────────────────────────
const AuthLoader: React.FC = () => (
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
      Loading workspace…
    </span>
  </div>
);

// ─── All app routes ───────────────────────────────────────────────────────────
const AppRoutes: React.FC = () => {
  const { user, authReady } = useAuth();

  // Block ALL routes until auth token check completes.
  // This guarantees every dashboard mounts with user already populated —
  // eliminating the need to refresh after login.
  if (!authReady) return <AuthLoader />;

  return (
    <>
      <Navbar />
      <AnimatePresence mode="wait">
        <Routes>
          {/* Public */}
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login />}
          />

          {/* Protected */}
          <Route path="/"                   element={<ProtectedRoute><EmployeeDashboard /></ProtectedRoute>} />
          <Route path="/monthly-report"     element={<ProtectedRoute><MonthlyReport /></ProtectedRoute>} />
          <Route path="/admin"              element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
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