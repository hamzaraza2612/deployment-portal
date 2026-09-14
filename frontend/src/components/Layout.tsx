import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { to: "/deploy", label: "Deploy", roles: ["ADMIN", "OPERATOR"] },
  { to: "/history", label: "History", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
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
        <div className="sidebar-footer">
          <div>{user?.name}</div>
          <div className="muted">{user?.role}</div>
          <button className="btn btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={() => logout()}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
