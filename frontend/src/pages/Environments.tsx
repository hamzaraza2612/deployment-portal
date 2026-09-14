import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ContainerInfo, ContainerStats, ServerRecord } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";
import { LogsModal } from "../components/LogsModal";

const STATS_REFRESH_MS = 3000;

function containerStateClass(state: string): string {
  if (state === "running") return "badge-SUCCESS";
  if (state === "restarting" || state === "created") return "badge-PENDING";
  if (state === "paused") return "badge-RUNNING";
  return "badge-FAILED"; // exited, dead, etc.
}

function ServerContainers({ server }: { server: ServerRecord }) {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "OPERATOR";

  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [stats, setStats] = useState<Record<string, ContainerStats>>({});
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

  function loadStats() {
    api
      .get<ContainerStats[]>(`/servers/${server.id}/containers/stats`)
      .then((rows) => setStats(Object.fromEntries(rows.map((r) => [r.id, r]))))
      .catch(() => undefined); // best-effort; the table still works without live stats
  }

  useEffect(load, [server.id]);

  useEffect(() => {
    loadStats();
    const interval = window.setInterval(loadStats, STATS_REFRESH_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

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
          </div>
        </div>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && containers === null && loading && <div className="empty-state">Connecting over SSH…</div>}
      {containers && containers.length === 0 && <div className="empty-state">No containers found on this server.</div>}

      {containers && containers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Image</th>
              <th>State</th>
              <th>Status</th>
              <th>Ports</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Net I/O</th>
              <th></th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {containers.map((c) => {
              const s = stats[c.id];
              return (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {c.composeService && <div className="muted" style={{ fontSize: 12 }}>{c.composeService}</div>}
                </td>
                <td className="muted">{c.image}</td>
                <td>
                  <span className={`badge ${containerStateClass(c.state)}`}>{c.state}</span>
                </td>
                <td className="muted">{c.status}</td>
                <td className="muted">{c.ports || "—"}</td>
                <td className="muted">{s?.cpuPercent ?? "—"}</td>
                <td className="muted">{s ? `${s.memUsage} (${s.memPercent})` : "—"}</td>
                <td className="muted">{s?.netIO ?? "—"}</td>
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
                      <button className="btn btn-sm" disabled={busyId === c.id} onClick={() => runAction(c, "restart")}>
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
              );
            })}
          </tbody>
        </table>
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
