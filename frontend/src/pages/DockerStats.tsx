import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ContainerInfo, ContainerStats, ServerRecord } from "../lib/types";
import { useAuth } from "../context/AuthContext";

const STATS_REFRESH_MS = 3000;

function containerStateClass(state: string): string {
  if (state === "running") return "badge-SUCCESS";
  if (state === "restarting" || state === "created") return "badge-PENDING";
  if (state === "paused") return "badge-RUNNING";
  return "badge-FAILED";
}

function ServerStatsTable({ server }: { server: ServerRecord }) {
  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [stats, setStats] = useState<Record<string, ContainerStats>>({});
  const [error, setError] = useState<string | null>(null);

  function loadContainers() {
    api
      .get<ContainerInfo[]>(`/servers/${server.id}/containers`)
      .then((data) => {
        setContainers(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load containers"));
  }

  function loadStats() {
    api
      .get<ContainerStats[]>(`/servers/${server.id}/containers/stats`)
      .then((rows) => setStats(Object.fromEntries(rows.map((r) => [r.id, r]))))
      .catch(() => undefined);
  }

  useEffect(() => {
    loadContainers();
    loadStats();
    const interval = window.setInterval(() => {
      loadContainers();
      loadStats();
    }, STATS_REFRESH_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <strong>{server.name}</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            {server.host}:{server.port}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && containers === null && <div className="empty-state">Connecting over SSH…</div>}
      {containers && containers.length === 0 && <div className="empty-state">No containers found on this server.</div>}

      {containers && containers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Image</th>
              <th>State</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Net I/O</th>
              <th>Block I/O</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((c) => {
              const s = stats[c.id];
              return (
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
                  <td className="muted">{s?.cpuPercent ?? "—"}</td>
                  <td className="muted">{s ? `${s.memUsage} (${s.memPercent})` : "—"}</td>
                  <td className="muted">{s?.netIO ?? "—"}</td>
                  <td className="muted">{s?.blockIO ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DockerStats() {
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
          <h1>Docker Stats</h1>
          <div className="page-subtitle">
            Live CPU, memory, and network usage for every container — databases, caches, and apps alike —
            refreshed every few seconds.
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {environments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            {user?.role === "ADMIN"
              ? "No servers yet — add one under Servers and give it an environment name."
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
            serversInSelected.map((server) => <ServerStatsTable key={server.id} server={server} />)
          )}
        </>
      )}
    </div>
  );
}
