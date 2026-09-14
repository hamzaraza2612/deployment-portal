import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { DeploymentDetail as DeploymentDetailType } from "../lib/types";
import { Badge, formatDateTime, formatDuration } from "../components/Badge";

export function DeploymentDetail() {
  const { id } = useParams<{ id: string }>();
  const [deployment, setDeployment] = useState<DeploymentDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: number;

    async function tick() {
      try {
        const data = await api.get<DeploymentDetailType>(`/deployments/${id}`);
        if (cancelled) return;
        setDeployment(data);
        if (data.status === "SUCCESS" || data.status === "FAILED") return;
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load deployment");
        return;
      }
      timer = window.setTimeout(tick, 2000);
    }
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!deployment) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            {deployment.appName} <Badge value={deployment.status} />
          </h1>
          <div className="page-subtitle">
            <Link to="/history">← Back to history</Link>
          </div>
        </div>
      </div>

      <div className="card">
        <dl className="summary-list">
          <dt>Server</dt>
          <dd>
            {deployment.server.name} ({deployment.server.host})
          </dd>
          <dt>Repository</dt>
          <dd>
            {deployment.repository.name} — {deployment.repository.url}
          </dd>
          <dt>Branch</dt>
          <dd>{deployment.branch}</dd>
          <dt>Source path</dt>
          <dd>{deployment.sourcePath}</dd>
          <dt>App path</dt>
          <dd>{deployment.appPath}</dd>
          <dt>Publish dir</dt>
          <dd>{deployment.publishDir}</dd>
          <dt>Backup</dt>
          <dd>{deployment.backupPath || "—"}</dd>
          <dt>Triggered by</dt>
          <dd>
            {deployment.triggeredBy.name} ({deployment.triggeredBy.email})
          </dd>
          <dt>Started</dt>
          <dd>{formatDateTime(deployment.startedAt)}</dd>
          <dt>Duration</dt>
          <dd>{formatDuration(deployment.startedAt, deployment.finishedAt)}</dd>
        </dl>
        {deployment.errorMessage && (
          <div className="alert alert-error" style={{ marginTop: 14 }}>
            {deployment.errorMessage}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Output log</h3>
        <div className="log-viewer">{deployment.log || "No output yet."}</div>
      </div>
    </div>
  );
}
