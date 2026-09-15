import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { PromotionRequestListItem, PromotionStatus, ServerRecord } from "../lib/types";
import { Badge, formatDateTime } from "../components/Badge";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

function PromotionRow({
  request,
  servers,
  canManage,
  onChanged,
}: {
  request: PromotionRequestListItem;
  servers: ServerRecord[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const { confirm, modal } = useConfirm();

  const [targetServerId, setTargetServerId] = useState(request.targetServerId ?? "");
  const [basePath, setBasePath] = useState(request.targetBasePath ?? "");
  const [appName, setAppName] = useState(request.targetAppName ?? "");
  const [apps, setApps] = useState<string[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidateServers = servers.filter((s) => s.environment === request.targetEnvironment);
  const selectedServer = candidateServers.find((s) => s.id === targetServerId);

  useEffect(() => {
    if (!targetServerId || !basePath) {
      setApps([]);
      return;
    }
    setLoadingApps(true);
    api
      .get<{ entries: { name: string }[] }>(
        `/deployments/browse?serverId=${encodeURIComponent(targetServerId)}&path=${encodeURIComponent(basePath)}`
      )
      .then((res) => {
        const names = res.entries.map((e) => e.name).filter((n) => n !== "Backups");
        setApps(names);
        if (!appName && names.includes(request.sourceDeployment.appName)) {
          setAppName(request.sourceDeployment.appName);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to list applications"))
      .finally(() => setLoadingApps(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetServerId, basePath]);

  async function handleDeploy() {
    if (!targetServerId || !basePath || !appName) return;
    const ok = await confirm(
      `Deploy ${request.sourceDeployment.appName} (${request.sourceDeployment.branch}) from ` +
        `${request.sourceDeployment.server.environment} to ${appName} on ${selectedServer?.name} ` +
        `(${request.targetEnvironment})?`,
      { title: "Deploy promotion", confirmLabel: "Deploy", danger: true }
    );
    if (!ok) return;
    setDeploying(true);
    setError(null);
    try {
      const deployment = await api.post<{ id: string }>(`/promotions/${request.id}/deploy`, {
        targetServerId,
        basePath,
        appName,
      });
      navigate(`/history/${deployment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start deployment");
      setDeploying(false);
    }
  }

  async function handleCancel() {
    const ok = await confirm(`Cancel this promotion request?`, {
      title: "Cancel request",
      confirmLabel: "Cancel request",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/promotions/${request.id}/cancel`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel request");
    }
  }

  return (
    <div className="card">
      {modal}
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <strong>
            {request.sourceDeployment.appName} → {request.targetEnvironment}
          </strong>
          <div className="muted" style={{ fontSize: 13 }}>
            From{" "}
            <Link to={`/history/${request.sourceDeployment.id}`}>
              {request.sourceDeployment.server.name} ({request.sourceDeployment.branch})
            </Link>
            , requested by {request.requestedBy.name} · {formatDateTime(request.createdAt)}
          </div>
        </div>
        <Badge value={request.status} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {request.status === "PENDING" && canManage && (
        <>
          <div className="form-grid">
            <div className="form-field">
              <label>Target server</label>
              <select
                value={targetServerId}
                onChange={(e) => {
                  setTargetServerId(e.target.value);
                  setBasePath("");
                  setAppName("");
                }}
              >
                <option value="">Select a server…</option>
                {candidateServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.host})
                  </option>
                ))}
              </select>
            </div>
            {selectedServer && (
              <div className="form-field">
                <label>Deployment base path</label>
                <select
                  value={basePath}
                  onChange={(e) => {
                    setBasePath(e.target.value);
                    setAppName("");
                  }}
                >
                  <option value="">Select a path…</option>
                  {selectedServer.basePaths.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {basePath && (
            <div className="form-field">
              <label>Application {loadingApps && "(loading…)"}</label>
              <input
                list={`apps-${request.id}`}
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Search or select an application…"
              />
              <datalist id={`apps-${request.id}`}>
                {apps.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              {appName && !apps.includes(appName) && (
                <div className="muted" style={{ fontSize: 12 }}>
                  No application matches "{appName}" exactly.
                </div>
              )}
            </div>
          )}
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className="btn btn-danger" onClick={handleCancel}>
              Cancel request
            </button>
            <button
              className="btn btn-primary"
              disabled={!targetServerId || !basePath || !apps.includes(appName) || deploying}
              onClick={handleDeploy}
            >
              {deploying ? "Starting…" : "Deploy"}
            </button>
          </div>
        </>
      )}

      {request.status === "DEPLOYED" && request.resultDeployment && (
        <div className="muted" style={{ fontSize: 13 }}>
          Deployed as <Link to={`/history/${request.resultDeployment.id}`}>this deployment</Link> (
          {request.resultDeployment.status})
        </div>
      )}
    </div>
  );
}

export function Promotions() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "OPERATOR";

  const [requests, setRequests] = useState<PromotionRequestListItem[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [status, setStatus] = useState<PromotionStatus | "">("PENDING");
  const [error, setError] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    api
      .get<PromotionRequestListItem[]>(`/promotions?${params.toString()}`)
      .then(setRequests)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load promotion requests"));
  }

  useEffect(() => {
    api.get<ServerRecord[]>("/servers").then(setServers).catch(() => undefined);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [status]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Promotions</h1>
          <div className="page-subtitle">
            Builds sent from one environment to another — pick a target app and deploy, or cancel.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-field" style={{ maxWidth: 220, marginBottom: 0 }}>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as PromotionStatus | "")}>
            <option value="PENDING">Pending</option>
            <option value="DEPLOYED">Deployed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="">All</option>
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {requests.length === 0 ? (
        <div className="card">
          <div className="empty-state">No promotion requests here.</div>
        </div>
      ) : (
        requests.map((r) => (
          <PromotionRow key={r.id} request={r} servers={servers} canManage={canManage} onChanged={load} />
        ))
      )}
    </div>
  );
}
