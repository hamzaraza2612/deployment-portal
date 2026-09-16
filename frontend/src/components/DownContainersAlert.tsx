import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { DownContainerServer } from "../lib/types";

const REFRESH_MS = 20000;

export function DownContainersAlert() {
  const [servers, setServers] = useState<DownContainerServer[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      api
        .get<DownContainerServer[]>("/alerts/down-containers")
        .then((data) => {
          if (!cancelled) setServers(data);
        })
        .catch(() => undefined);
    }

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalCount = servers.reduce((sum, s) => sum + s.containers.length, 0);

  return (
    <div className="alert-bell" ref={containerRef}>
      <button className="alert-bell-button" onClick={() => setOpen((o) => !o)} title="Container alerts">
        🔔
        {totalCount > 0 && <span className="nav-badge alert-bell-badge">{totalCount}</span>}
      </button>
      {open && (
        <div className="alert-bell-panel">
          <div className="alert-bell-panel-title">Stopped containers</div>
          {servers.length === 0 ? (
            <div className="muted" style={{ padding: "10px 14px", fontSize: 13 }}>
              All containers are running.
            </div>
          ) : (
            servers.map((s) => (
              <div key={s.serverId} className="alert-bell-server">
                <Link to="/environments" onClick={() => setOpen(false)}>
                  {s.serverName} <span className="muted">({s.environment})</span>
                </Link>
                {s.containers.map((c) => (
                  <div key={c.name} className="alert-bell-container">
                    <span>{c.name}</span>
                    <span className="muted">{c.status}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
