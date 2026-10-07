import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ServerRecord, SystemStats, VmServiceStatus } from "../lib/types";
import { useConfirm } from "../hooks/useConfirm";

// Only these are backed by a known systemd unit we can safely start/stop/tail — Docker (the
// daemon, not individual containers) is deliberately left out since stopping it would take
// down every container on the box, not just a database.
const CONTROLLABLE_SERVICES = new Set(["Redis", "PostgreSQL", "MSSQL", "MongoDB"]);

const REFRESH_MS = 10000;
const SERVICES_REFRESH_MS = 15000;

function formatMb(mb: number | null): string {
  if (mb == null) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function formatKb(kb: number | null): string {
  if (kb == null) return "—";
  return `${(kb / 1024 / 1024).toFixed(1)} GB`;
}

function percentClass(pct: number | null): string {
  if (pct == null) return "";
  if (pct >= 90) return "badge-FAILED";
  if (pct >= 75) return "badge-PENDING";
  return "badge-SUCCESS";
}

function formatServiceMem(kb: number | null): string {
  if (kb == null) return "—";
  return kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : `${(kb / 1024).toFixed(0)} MB`;
}

function VmServicesTable({ serverId }: { serverId: string }) {
  const [services, setServices] = useState<VmServiceStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyService, setBusyService] = useState<string | null>(null);
  const { confirm, modal } = useConfirm();

  function load() {
    api
      .get<VmServiceStatus[]>(`/servers/${serverId}/vm-services`)
      .then((data) => {
        setServices(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to check services"));
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, SERVICES_REFRESH_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  function openLogs(name: string) {
    const url = `/servers/${serverId}/vm-services/${encodeURIComponent(name)}/logs`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function runAction(name: string, action: "start" | "stop") {
    if (action === "stop") {
      const ok = await confirm(`Stop ${name}? Anything depending on it will lose its connection.`, {
        title: "Stop service",
        confirmLabel: "Stop",
        danger: true,
      });
      if (!ok) return;
    }
    setBusyService(name);
    setActionError(null);
    try {
      await api.post(`/servers/${serverId}/vm-services/${encodeURIComponent(name)}/action`, { action });
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Failed to ${action} ${name}`);
    } finally {
      setBusyService(null);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        Common services (auto-detected — systemd, then well-known port, then process name). Start/stop and
        logs are only available for the systemd-managed database services.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {actionError && <div className="alert alert-error">{actionError}</div>}
      {!error && services === null && <div className="empty-state">Checking services…</div>}
      {services && (
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Detected via</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => {
              const controllable = CONTROLLABLE_SERVICES.has(s.name) && s.method === "systemd";
              const busy = busyService === s.name;
              return (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>
                    <span className={`badge ${s.running ? "badge-SUCCESS" : "badge-FAILED"}`}>
                      {s.running ? "Running" : "Not found"}
                    </span>
                  </td>
                  <td className="muted">{s.running ? s.method : "—"}</td>
                  <td className="muted">{s.cpuPercent != null ? `${s.cpuPercent}%` : "—"}</td>
                  <td className="muted">{formatServiceMem(s.memKb)}</td>
                  <td>
                    {controllable ? (
                      <div className="row-actions">
                        <button
                          className="btn btn-sm"
                          disabled={busy || s.running}
                          onClick={() => runAction(s.name, "start")}
                        >
                          Start
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={busy || !s.running}
                          onClick={() => runAction(s.name, "stop")}
                        >
                          Stop
                        </button>
                        <button className="btn btn-sm" onClick={() => openLogs(s.name)}>
                          Logs
                        </button>
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        Not controllable
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {modal}
    </div>
  );
}

function ServerStatCard({ server }: { server: ServerRecord }) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<SystemStats>(`/servers/${server.id}/system-stats`)
      .then((s) => {
        setStats(s);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load host stats"));
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

  const diskPercent =
    stats?.diskUsedKb != null && stats?.diskTotalKb ? Math.round((stats.diskUsedKb / stats.diskTotalKb) * 100) : null;
  const memPercent =
    stats?.memUsedMb != null && stats?.memTotalMb ? Math.round((stats.memUsedMb / stats.memTotalMb) * 100) : null;

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

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">
            {stats?.cpuPercent == null ? "—" : `${stats.cpuPercent}%`}{" "}
            {stats?.cpuPercent != null && <span className={`badge ${percentClass(stats.cpuPercent)}`}>CPU</span>}
          </div>
          <div className="stat-label">CPU usage</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {formatMb(stats?.memUsedMb ?? null)}{" "}
            {memPercent != null && <span className={`badge ${percentClass(memPercent)}`}>{memPercent}%</span>}
          </div>
          <div className="stat-label">RAM used of {formatMb(stats?.memTotalMb ?? null)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {formatKb(stats?.diskUsedKb ?? null)}{" "}
            {diskPercent != null && <span className={`badge ${percentClass(diskPercent)}`}>{diskPercent}%</span>}
          </div>
          <div className="stat-label">Disk used of {formatKb(stats?.diskTotalKb ?? null)}</div>
        </div>
      </div>

      <VmServicesTable serverId={server.id} />
    </div>
  );
}

export function ServerMonitoring() {
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
          <h1>Server Monitoring</h1>
          <div className="page-subtitle">
            Host-level CPU, RAM, and disk usage per server — admin only. Alerting on these thresholds is
            planned for later.
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {environments.length === 0 ? (
        <div className="card">
          <div className="empty-state">No servers yet — add one under Servers.</div>
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
            serversInSelected.map((server) => <ServerStatCard key={server.id} server={server} />)
          )}
        </>
      )}
    </div>
  );
}
