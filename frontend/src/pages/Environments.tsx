import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ContainerInfo, ServerRecord, SystemStats } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";
import { LogsModal } from "../components/LogsModal";

const SYSTEM_STATS_REFRESH_MS = 10000;

function containerStateClass(state: string): string {
  if (state === "running") return "badge-SUCCESS";
  if (state === "restarting" || state === "created") return "badge-PENDING";
  if (state === "paused") return "badge-RUNNING";
  return "badge-FAILED"; // exited, dead, etc.
}

function formatMb(mb: number | null): string {
  if (mb == null) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function formatKb(kb: number | null): string {
  if (kb == null) return "—";
  return `${(kb / 1024 / 1024).toFixed(1)} GB`;
}

function SystemStatBar({ serverId }: { serverId: string }) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState(false);

  function load() {
    api
      .get<SystemStats>(`/servers/${serverId}/system-stats`)
      .then((s) => {
        setStats(s);
        setError(false);
      })
      .catch(() => setError(true));
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, SYSTEM_STATS_REFRESH_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  if (error) {
    return <div className="muted" style={{ fontSize: 13 }}>Host stats unavailable.</div>;
  }
  if (!stats) {
    return <div className="muted" style={{ fontSize: 13 }}>Loading host stats…</div>;
  }

  return (
    <div className="stat-grid" style={{ marginBottom: 14 }}>
      <div className="stat-card">
        <div className="stat-value">{stats.cpuPercent == null ? "—" : `${stats.cpuPercent}%`}</div>
        <div className="stat-label">CPU</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{formatMb(stats.memUsedMb)}</div>
        <div className="stat-label">RAM used of {formatMb(stats.memTotalMb)}</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{formatKb(stats.diskUsedKb)}</div>
        <div className="stat-label">Disk used of {formatKb(stats.diskTotalKb)}</div>
      </div>
    </div>
  );
}

function ServerContainers({ server }: { server: ServerRecord }) {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "OPERATOR";

  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<ContainerInfo | null>(null);
  const { confirm, modal } = useConfirm();

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<ContainerInfo[]>(`/servers/${server.id}/containers`)
      .then(setContainers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load containers"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [server.id]);

  const filtered = (containers ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const runningCount = (containers ?? []).filter((c) => c.state === "running").length;
  const stoppedCount = (containers ?? []).length - runningCount;

  async function runAction(container: ContainerInfo, action: "start" | "stop" | "restart" | "recreate") {
    if (action === "stop") {
      const ok = await confirm(
        `Stop ${container.name}? The app will become unavailable until it's started again.`,
        { title: "Stop container", confirmLabel: "Stop", danger: true }
      );
      if (!ok) return;
    }
    if (action === "recreate") {
      const project = container.composeProject ? ` ("${container.composeProject}")` : "";
      const ok = await confirm(
        `Recreate ${container.name}? This runs "docker compose down -v" then "docker compose up -d" for the ` +
          `WHOLE compose project${project} that owns this container — every service in it is stopped, and ` +
          `their volumes (including any database/persistent data) are permanently deleted before being ` +
          `recreated fresh. This cannot be undone.`,
        { title: "Recreate container", confirmLabel: "Recreate (deletes volumes)", danger: true }
      );
      if (!ok) return;
    }
    setBusyId(container.id);
    setError(null);
    try {
      await api.post(`/servers/${server.id}/containers/${container.id}/action`, { action });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} ${container.name}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      {modal}
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <strong>{server.name}</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            {server.host}:{server.port}
            {containers && (
              <>
                {" · "}
                {runningCount} running, {stoppedCount} stopped
              </>
            )}
          </div>
        </div>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <SystemStatBar serverId={server.id} />

      {error && <div className="alert alert-error">{error}</div>}

      {!error && containers === null && loading && <div className="empty-state">Connecting over SSH…</div>}
      {containers && containers.length === 0 && <div className="empty-state">No containers found on this server.</div>}

      {containers && containers.length > 0 && (
        <>
          <div className="form-field" style={{ maxWidth: 280 }}>
            <input
              placeholder="Search containers by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">No containers match "{search}".</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Image</th>
                  <th>State</th>
                  <th>Status</th>
                  <th>Ports</th>
                  <th></th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      {c.composeService && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.composeService}
                        </div>
                      )}
                    </td>
                    <td className="muted">{c.image}</td>
                    <td>
                      <span className={`badge ${containerStateClass(c.state)}`}>{c.state}</span>
                    </td>
                    <td className="muted">{c.status}</td>
                    <td className="muted">{c.ports || "—"}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setLogsFor(c)}>
                        Logs
                      </button>
                    </td>
                    {canManage && (
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-sm"
                            disabled={busyId === c.id || c.state === "running"}
                            onClick={() => runAction(c, "start")}
                          >
                            Start
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={busyId === c.id || c.state !== "running"}
                            onClick={() => runAction(c, "stop")}
                          >
                            Stop
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={busyId === c.id}
                            onClick={() => runAction(c, "restart")}
                          >
                            Restart
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={busyId === c.id}
                            onClick={() => runAction(c, "recreate")}
                          >
                            Recreate
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {logsFor && (
        <LogsModal
          title={`Logs — ${logsFor.name}`}
          serverId={server.id}
          containerId={logsFor.id}
          onClose={() => setLogsFor(null)}
        />
      )}
    </div>
  );
}

export function Environments() {
  const { user } = useAuth();
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ServerRecord[]>("/servers")
      .then((data) => {
        setServers(data);
        setSelected((current) => current ?? data[0]?.environment ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load servers"));
  }, []);

  const environments = useMemo(() => Array.from(new Set(servers.map((s) => s.environment))).sort(), [servers]);
  const serversInSelected = servers.filter((s) => s.environment === selected);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Environments</h1>
          <div className="page-subtitle">
            Pick an environment to see every server in it and manage its docker containers directly.
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {environments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            {user?.role === "ADMIN"
              ? "No servers yet — add one under Servers and give it an environment name (Dev, Staging, Production…)."
              : "No environments assigned to your account yet — ask an admin to grant you access under Users."}
          </div>
        </div>
      ) : (
        <>
          <div className="wizard-steps">
            {environments.map((env) => (
              <span
                key={env}
                className={"wizard-step" + (env === selected ? " current" : "")}
                style={{ cursor: "pointer" }}
                onClick={() => setSelected(env)}
              >
                {env}
              </span>
            ))}
          </div>

          {serversInSelected.length === 0 ? (
            <div className="card">
              <div className="empty-state">No servers in this environment.</div>
            </div>
          ) : (
            serversInSelected.map((server) => <ServerContainers key={server.id} server={server} />)
          )}
        </>
      )}
    </div>
  );
}
