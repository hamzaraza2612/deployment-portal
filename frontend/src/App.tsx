import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Servers } from "./pages/Servers";
import { Environments } from "./pages/Environments";
import { Repositories } from "./pages/Repositories";
import { Users } from "./pages/Users";
import { Deploy } from "./pages/Deploy";
import { History } from "./pages/History";
import { DeploymentDetail } from "./pages/DeploymentDetail";
import { ContainerLogs } from "./pages/ContainerLogs";
import { Links } from "./pages/Links";
import { Monitoring } from "./pages/Monitoring";
import { Promotions } from "./pages/Promotions";
import { ConfigFiles } from "./pages/ConfigFiles";
import { GitCredentials } from "./pages/GitCredentials";
import { AuditLogs } from "./pages/AuditLogs";
import type { Role } from "./lib/types";

function FullScreenLoader() {
  return (
    <div className="login-screen">
      <span className="spinner" />
    </div>
  );
}

function RequireAuth({ children, roles }: { children: JSX.Element; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/environments/:serverId/containers/:containerId/logs"
        element={
          <RequireAuth>
            <ContainerLogs />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/deploy"
          element={
            <RequireAuth roles={["ADMIN", "OPERATOR"]}>
              <Deploy />
            </RequireAuth>
          }
        />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<DeploymentDetail />} />
        <Route path="/promotions" element={<Promotions />} />
        <Route
          path="/config-files"
          element={
            <RequireAuth roles={["ADMIN", "OPERATOR"]}>
              <ConfigFiles />
            </RequireAuth>
          }
        />
        <Route path="/environments" element={<Environments />} />
        <Route
          path="/monitoring"
          element={
            <RequireAuth roles={["ADMIN"]}>
              <Monitoring />
            </RequireAuth>
          }
        />
        <Route path="/links" element={<Links />} />
        <Route path="/servers" element={<Servers />} />
        <Route path="/repositories" element={<Repositories />} />
        <Route
          path="/git-credentials"
          element={
            <RequireAuth roles={["ADMIN"]}>
              <GitCredentials />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth roles={["ADMIN"]}>
              <Users />
            </RequireAuth>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <RequireAuth roles={["ADMIN"]}>
              <AuditLogs />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
