import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ContainerInfo, ServerRecord } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

function containerStateClass(state: string): string {
  if (state === "running") return "badge-SUCCESS";
  if (state === "restarting" || state === "created") return "badge-PENDING";
  if (state === "paused") return "badge-RUNNING";
  return "badge-FAILED"; // exited, dead, etc.
}

/** Docker's Ports string is verbose (host+container port, protocol, dual-stack) — show just the external port(s). */
function externalPorts(portsStr: string): string {
  const matches = Array.from(portsStr.matchAll(/:(\d+)->/g)).map((m) => m[1]);
  const unique = Array.from(new Set(matches));
  return unique.length > 0 ? unique.join(", ") : "—";
}

function ServerContainers({ server }: { server: ServerRecord }) {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "OPERATOR";

  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Containers acted on this session, most-recent-first — sorted to the top of the table so
  // the one you just touched doesn't get lost among 40+ rows; not persisted across reloads.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const { confirm, modal } = useConfirm();

  function openLogs(container: ContainerInfo) {
    const url = `/environments/${server.id}/containers/${container.id}/logs?name=${encodeURIComponent(
      container.name
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

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

  const sorted = useMemo(() => {
    const rank = new Map(recentIds.map((id, i) => [id, i]));
    return [...(containers ?? [])].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Infinity;
      return ra - rb;
    });
  }, [containers, recentIds]);
  const filtered = sorted.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));
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
    if (action === "restart") {
      const ok = await confirm(`Restart ${container.name}? The app will briefly become unavailable.`, {
        title: "Restart container",
        confirmLabel: "Restart",
        danger: true,
      });
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
    setRecentIds((prev) => [container.id, ...prev.filter((id) => id !== container.id)]);
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
                  <tr key={c.id} style={recentIds.includes(c.id) ? { background: "rgba(194, 30, 47, 0.04)" } : undefined}>
                    <td>
                      {c.name}
                      {recentIds[0] === c.id && (
                        <span className="badge badge-ADMIN" style={{ marginLeft: 8, fontSize: 10.5 }}>
                          just updated
                        </span>
                      )}
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
                    <td className="muted">{c.ports ? externalPorts(c.ports) : "—"}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => openLogs(c)}>
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
