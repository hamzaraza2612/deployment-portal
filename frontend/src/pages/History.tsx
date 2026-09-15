import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { DeploymentListItem, ServerRecord } from "../lib/types";
import { Badge, formatDateTime, formatDuration } from "../components/Badge";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

export function History() {
  const { user } = useAuth();
  const canDeploy = user?.role === "ADMIN" || user?.role === "OPERATOR";
  const navigate = useNavigate();
  const { confirm, modal } = useConfirm();

  const [deployments, setDeployments] = useState<DeploymentListItem[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [status, setStatus] = useState("");
  const [serverId, setServerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (serverId) params.set("serverId", serverId);
    api
      .get<DeploymentListItem[]>(`/deployments?${params.toString()}`)
      .then(setDeployments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load history"));
  }

  useEffect(() => {
    api.get<ServerRecord[]>("/servers").then(setServers).catch(() => undefined);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [status, serverId]);

  async function handleRevert(d: DeploymentListItem) {
    const backupLabel = d.backupName ?? "this deployment's backup";
    const ok = await confirm(
      `Revert ${d.appName} on ${d.server.name} to backup "${backupLabel}"? Publish folder will be replaced ` +
        `entirely and the container restarted.`,
      { title: "Revert deployment", confirmLabel: "Revert", danger: true }
    );
    if (!ok) return;
    setRevertingId(d.id);
    setError(null);
    try {
      const revert = await api.post<{ id: string }>(`/deployments/${d.id}/revert`);
      navigate(`/history/${revert.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start revert");
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <div>
      {modal}
      <div className="page-header">
        <div>
          <h1>Deployment history</h1>
          <div className="page-subtitle">Audit trail of every deployment run through the portal.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="form-field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="RUNNING">Running</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div className="form-field">
            <label>Server</label>
            <select value={serverId} onChange={(e) => setServerId(e.target.value)}>
              <option value="">All</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {deployments.length === 0 ? (
          <div className="empty-state">No deployments match these filters.</div>
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
                <th>Duration</th>
                {canDeploy && <th></th>}
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/history/${d.id}`}>{d.appName}</Link>
                    {d.isRevert && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        ↩ revert
                        {d.revertedFromId && (
                          <>
                            {" of "}
                            <Link to={`/history/${d.revertedFromId}`}>this deployment</Link>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{d.server.name}</td>
                  <td>{d.branch}</td>
                  <td>
                    <Badge value={d.status} />
                  </td>
                  <td>{d.triggeredBy.name}</td>
                  <td className="muted">{formatDateTime(d.startedAt)}</td>
                  <td className="muted">{formatDuration(d.startedAt, d.finishedAt)}</td>
                  {canDeploy && (
                    <td>
                      {d.status === "SUCCESS" && (
                        <button
                          className="btn btn-sm"
                          disabled={revertingId === d.id}
                          onClick={() => handleRevert(d)}
                        >
                          {revertingId === d.id ? "Starting…" : "Revert to this"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
