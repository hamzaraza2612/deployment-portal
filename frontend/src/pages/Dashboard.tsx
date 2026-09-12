import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Summary {
  users: number;
  servers: number;
  applications: number;
  environments: number;
  credentials: number;
}

const CARDS: { key: keyof Summary; label: string }[] = [
  { key: 'applications', label: 'Applications' },
  { key: 'environments', label: 'Environments' },
  { key: 'servers', label: 'Servers' },
  { key: 'users', label: 'Users' },
  { key: 'credentials', label: 'Credentials' },
];

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Summary>('/dashboard/summary')
      .then(setSummary)
      .catch(() => setError('Unable to load dashboard summary'));
  }, []);

  return (
    <div>
      <h2>Dashboard</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        {CARDS.map((card) => (
          <div
            key={card.key}
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{card.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 600 }}>
              {summary ? summary[card.key] : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
