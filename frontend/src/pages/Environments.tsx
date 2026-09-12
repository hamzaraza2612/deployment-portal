import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Environment {
  id: string;
  name: string;
  branch: string | null;
  application: { id: string; name: string };
  server: { id: string; name: string; hostname: string } | null;
}

export default function Environments() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ environments: Environment[] }>('/environments')
      .then((res) => setEnvironments(res.environments))
      .catch(() => setError('Unable to load environments'));
  }, []);

  return (
    <div>
      <h2>Environments</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '0.5rem' }}>Application</th>
            <th style={{ padding: '0.5rem' }}>Environment</th>
            <th style={{ padding: '0.5rem' }}>Branch</th>
            <th style={{ padding: '0.5rem' }}>Server</th>
          </tr>
        </thead>
        <tbody>
          {environments.map((env) => (
            <tr key={env.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.5rem' }}>{env.application.name}</td>
              <td style={{ padding: '0.5rem' }}>{env.name}</td>
              <td style={{ padding: '0.5rem' }}>{env.branch || '—'}</td>
              <td style={{ padding: '0.5rem' }}>{env.server ? env.server.hostname : '—'}</td>
            </tr>
          ))}
          {environments.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No environments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
