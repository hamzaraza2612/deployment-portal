import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { DashboardSummary } from "../lib/types";
import { Badge, formatDateTime } from "../components/Badge";

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardSummary>("/dashboard/summary")
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="page-subtitle">Centralized deployment overview across all environments.</div>
        </div>
        <Link to="/deploy" className="btn btn-primary">
          New deployment
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {summary && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{summary.serverCount}</div>
              <div className="stat-label">Servers</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.repositoryCount}</div>
              <div className="stat-label">Repositories</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.totalDeployments}</div>
              <div className="stat-label">Total deployments</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.deploymentCounts.SUCCESS}</div>
              <div className="stat-label">Successful</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.deploymentCounts.FAILED}</div>
              <div className="stat-label">Failed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.deploymentCounts.RUNNING}</div>
              <div className="stat-label">Running now</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Recent deployments</h3>
            {summary.recentDeployments.length === 0 ? (
              <div className="empty-state">No deployments yet. Start one from the Deploy page.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Server</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th>Triggered by</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentDeployments.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link to={`/history/${d.id}`}>{d.appName}</Link>
                      </td>
                      <td>{d.server.name}</td>
                      <td>{d.branch}</td>
                      <td>
                        <Badge value={d.status} />
                      </td>
                      <td>{d.triggeredBy.name}</td>
                      <td className="muted">{formatDateTime(d.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
