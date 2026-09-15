import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/deploy", label: "Deploy", roles: ["ADMIN", "OPERATOR"] },
  { to: "/history", label: "History", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/environments", label: "Environments", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/docker-stats", label: "Docker Stats", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/server-monitoring", label: "Server Monitoring", roles: ["ADMIN"] },
  { to: "/links", label: "Links", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/servers", label: "Servers", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/repositories", label: "Repositories", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/users", label: "Users", roles: ["ADMIN"] },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Deployment Portal</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter((item) => !user || item.roles.includes(user.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="content-area">
        <header className="topbar">
          <div className="topbar-user">
            <span>{user?.name}</span>
            <span className={`badge badge-${user?.role}`}>{user?.role}</span>
          </div>
          <button className="btn btn-sm" onClick={() => logout()}>
            Log out
          </button>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
