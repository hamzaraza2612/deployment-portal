import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { DeploymentDetail as DeploymentDetailType, ServerRecord } from "../lib/types";
import { Badge, formatDateTime, formatDuration } from "../components/Badge";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

export function DeploymentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canDeploy = user?.role === "ADMIN" || user?.role === "OPERATOR";
  const navigate = useNavigate();
  const { confirm, modal } = useConfirm();

  const [deployment, setDeployment] = useState<DeploymentDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [targetEnv, setTargetEnv] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

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

  useEffect(() => {
    api.get<ServerRecord[]>("/servers").then(setServers).catch(() => undefined);
  }, []);

  async function handleRevert() {
    if (!deployment) return;
    const backupLabel = deployment.backupName ?? "this deployment's backup";
    const ok = await confirm(
      `Revert ${deployment.appName} to backup "${backupLabel}"? Publish folder will be replaced entirely ` +
        `and the container restarted.`,
      { title: "Revert deployment", confirmLabel: "Revert", danger: true }
    );
    if (!ok) return;
    setReverting(true);
    setError(null);
    try {
      const revert = await api.post<{ id: string }>(`/deployments/${deployment.id}/revert`);
      navigate(`/history/${revert.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start revert");
      setReverting(false);
    }
  }

  async function handleSend() {
    if (!deployment || !targetEnv) return;
    setSending(true);
    setSendMessage(null);
    setError(null);
    try {
      await api.post(`/deployments/${deployment.id}/promote`, { targetEnvironment: targetEnv });
      setSendMessage(
        `Sent to ${targetEnv} — visible on the Promotions page for anyone with access to that environment.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send to that environment");
    } finally {
      setSending(false);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!deployment) return <div className="empty-state">Loading…</div>;

  const sourceEnvironment = servers.find((s) => s.id === deployment.server.id)?.environment;
  const sendableEnvironments = Array.from(new Set(servers.map((s) => s.environment))).filter(
    (env) => env !== sourceEnvironment
  );

  return (
    <div>
      {modal}
      <div className="page-header">
        <div>
          <h1>
            {deployment.appName} <Badge value={deployment.status} />
          </h1>
          <div className="page-subtitle">
            <Link to="/history">← Back to history</Link>
          </div>
          {deployment.isRevert && deployment.revertedFrom && (
            <div className="alert alert-info" style={{ marginTop: 10 }}>
              ↩ This is a revert of{" "}
              <Link to={`/history/${deployment.revertedFrom.id}`}>
                {deployment.revertedFrom.appName} ({deployment.revertedFrom.branch}) started{" "}
                {formatDateTime(deployment.revertedFrom.startedAt)}
              </Link>
            </div>
          )}
          {deployment.promotionRequestAsResult && (
            <div className="alert alert-info" style={{ marginTop: 10 }}>
              → Promoted from{" "}
              <Link to={`/history/${deployment.promotionRequestAsResult.sourceDeployment.id}`}>
                {deployment.promotionRequestAsResult.sourceDeployment.appName} (
                {deployment.promotionRequestAsResult.sourceDeployment.server.environment})
              </Link>
            </div>
          )}
        </div>
        {canDeploy && deployment.status === "SUCCESS" && (
          <div className="row-actions" style={{ alignItems: "flex-start" }}>
            {sendableEnvironments.length > 0 && (
              <>
                <select value={targetEnv} onChange={(e) => setTargetEnv(e.target.value)} style={{ padding: "8px 10px" }}>
                  <option value="">Send to environment…</option>
                  {sendableEnvironments.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
                <button className="btn" disabled={!targetEnv || sending} onClick={handleSend}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </>
            )}
            <button className="btn" disabled={reverting} onClick={handleRevert}>
              {reverting ? "Starting…" : "Revert to this"}
            </button>
          </div>
        )}
      </div>

      {sendMessage && <div className="alert alert-info">{sendMessage}</div>}

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
