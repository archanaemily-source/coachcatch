import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import CoachDashboard from './pages/CoachDashboard';
import StudentHome from './pages/StudentHome';
import LiveSession from './pages/LiveSession';

function RequireRole({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'coach' ? '/coach' : '/student'} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Navigate to={user.role === 'coach' ? '/coach' : '/student'} replace /> : <LoginPage />}
      />
      <Route
        path="/coach"
        element={
          <RequireRole role="coach">
            <CoachDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/student"
        element={
          <RequireRole role="student">
            <StudentHome />
          </RequireRole>
        }
      />
      <Route
        path="/session/:id"
        element={
          <RequireRole role="student">
            <LiveSession />
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
