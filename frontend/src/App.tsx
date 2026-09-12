import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ComingSoon from './components/ComingSoon';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import Environments from './pages/Environments';
import Servers from './pages/Servers';
import Users from './pages/Users';

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="deployments" element={<ComingSoon title="Deployments" />} />
        <Route path="applications" element={<Applications />} />
        <Route path="environments" element={<Environments />} />
        <Route path="servers" element={<Servers />} />
        <Route path="containers" element={<ComingSoon title="Containers" />} />
        <Route path="backups" element={<ComingSoon title="Backups" />} />
        <Route path="logs" element={<ComingSoon title="Logs" />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<ComingSoon title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
