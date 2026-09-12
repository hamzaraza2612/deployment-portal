import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/deployments', label: 'Deployments' },
  { to: '/applications', label: 'Applications' },
  { to: '/environments', label: 'Environments' },
  { to: '/servers', label: 'Servers' },
  { to: '/containers', label: 'Containers' },
  { to: '/backups', label: 'Backups' },
  { to: '/logs', label: 'Logs' },
  { to: '/users', label: 'Users' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <aside
        style={{
          width: 220,
          background: '#111827',
          color: '#e5e7eb',
          padding: '1.5rem 1rem',
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>DevOps Portal</h1>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: '0.5rem 0.75rem',
                borderRadius: 6,
                color: isActive ? '#111827' : '#e5e7eb',
                background: isActive ? '#e5e7eb' : 'transparent',
                textDecoration: 'none',
                fontSize: '0.9rem',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            padding: '0.75rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: '#374151' }}>
            {user?.name} &middot; {user?.role}
          </span>
          <button onClick={() => logout()} style={{ cursor: 'pointer' }}>
            Log out
          </button>
        </header>
        <main style={{ padding: '1.5rem', flex: 1, background: '#f9fafb' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
