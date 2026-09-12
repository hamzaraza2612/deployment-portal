import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Server {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string | null;
  sshPort: number;
  sshUser: string;
  credential: { id: string; name: string } | null;
}

export default function Servers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ servers: Server[] }>('/servers')
      .then((res) => setServers(res.servers))
      .catch(() => setError('Unable to load servers'));
  }, []);

  return (
    <div>
      <h2>Servers</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '0.5rem' }}>Name</th>
            <th style={{ padding: '0.5rem' }}>Hostname</th>
            <th style={{ padding: '0.5rem' }}>SSH User</th>
            <th style={{ padding: '0.5rem' }}>Credential</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((server) => (
            <tr key={server.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.5rem' }}>{server.name}</td>
              <td style={{ padding: '0.5rem' }}>
                {server.hostname}:{server.sshPort}
              </td>
              <td style={{ padding: '0.5rem' }}>{server.sshUser}</td>
              <td style={{ padding: '0.5rem' }}>{server.credential?.name || '—'}</td>
            </tr>
          ))}
          {servers.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No servers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
