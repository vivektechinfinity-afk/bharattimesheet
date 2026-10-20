import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TimesheetForm from './pages/TimesheetForm';
import MyTimesheets from './pages/MyTimesheets';
import Reports from './pages/Reports';
import Approvals from './pages/Approvals';
import AdminPanel from './pages/AdminPanel';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent-teal border-t-accent-gold rounded-full animate-spin mx-auto" />
          <p className="text-accent-teal mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  const isPrivileged = ['admin', 'manager'].includes(user?.role);

  return (
    <BrowserRouter>
      <Routes>
        {!user ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/timesheet/new" element={<TimesheetForm />} />
              <Route path="/timesheets" element={<MyTimesheets />} />
              <Route path="/reports" element={<Reports />} />
              {isPrivileged && <Route path="/approvals" element={<Approvals />} />}
              {user.role === 'admin' && <Route path="/admin" element={<AdminPanel />} />}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
