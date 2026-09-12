import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Application {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  environments: { id: string; name: string }[];
}

export default function Applications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ applications: Application[] }>('/applications')
      .then((res) => setApplications(res.applications))
      .catch(() => setError('Unable to load applications'));
  }, []);

  return (
    <div>
      <h2>Applications</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '0.5rem' }}>Name</th>
            <th style={{ padding: '0.5rem' }}>Repository</th>
            <th style={{ padding: '0.5rem' }}>Environments</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr key={app.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.5rem' }}>{app.name}</td>
              <td style={{ padding: '0.5rem' }}>{app.repoUrl || '—'}</td>
              <td style={{ padding: '0.5rem' }}>
                {app.environments.map((e) => e.name).join(', ') || '—'}
              </td>
            </tr>
          ))}
          {applications.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No applications yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
