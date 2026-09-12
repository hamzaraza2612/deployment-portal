import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface UserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  role: { id: string; name: string };
}

export default function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ users: UserRow[] }>('/users')
      .then((res) => setUsers(res.users))
      .catch(() => setError('Unable to load users'));
  }, []);

  return (
    <div>
      <h2>Users</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '0.5rem' }}>Name</th>
            <th style={{ padding: '0.5rem' }}>Email</th>
            <th style={{ padding: '0.5rem' }}>Role</th>
            <th style={{ padding: '0.5rem' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.5rem' }}>{user.name}</td>
              <td style={{ padding: '0.5rem' }}>{user.email}</td>
              <td style={{ padding: '0.5rem' }}>{user.role.name}</td>
              <td style={{ padding: '0.5rem' }}>{user.isActive ? 'Active' : 'Disabled'}</td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No users yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
