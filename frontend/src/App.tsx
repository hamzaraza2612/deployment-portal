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
        <Route path="/environments" element={<Environments />} />
        <Route path="/servers" element={<Servers />} />
        <Route path="/repositories" element={<Repositories />} />
        <Route
          path="/users"
          element={
            <RequireAuth roles={["ADMIN"]}>
              <Users />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
