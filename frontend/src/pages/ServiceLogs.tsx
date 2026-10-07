import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";

const TAIL_OPTIONS = [100, 200, 500, 1000, 2000];
const REFRESH_MS = 5000;

export function ServiceLogs() {
  const { serverId, name } = useParams<{ serverId: string; name: string }>();
  const serviceName = name ? decodeURIComponent(name) : "";

  const [tail, setTail] = useState(200);
  const [log, setLog] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const logViewerRef = useRef<HTMLDivElement>(null);

  function load() {
    if (!serverId || !serviceName) return;
    setLoading(true);
    api
      .get<{ log: string }>(
        `/servers/${serverId}/vm-services/${encodeURIComponent(serviceName)}/logs?lines=${tail}`
      )
      .then((res) => {
        setLog(res.log);
        setError(null);
        setLastRefreshed(new Date());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load logs"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [serverId, serviceName, tail]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, serverId, serviceName, tail]);

  const displayedLines = useMemo(() => {
    const rawLines = log.split("\n");
    return search.trim()
      ? rawLines.filter((line) => line.toLowerCase().includes(search.trim().toLowerCase()))
      : rawLines;
  }, [log, search]);

  useEffect(() => {
    const el = logViewerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayedLines]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", padding: "20px 28px" }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1>Logs — {serviceName}</h1>
          <div className="page-subtitle">
            {log.split("\n").length} lines fetched
            {lastRefreshed && ` · last updated ${lastRefreshed.toLocaleTimeString()}`}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <select value={tail} onChange={(e) => setTail(Number(e.target.value))} style={{ padding: "8px 12px" }}>
          {TAIL_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Last {n} lines
            </option>
          ))}
        </select>
        <input
          placeholder="Search log text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh every 5s
        </label>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ flexShrink: 0 }}>
          {error}
        </div>
      )}

      <div className="log-viewer" ref={logViewerRef} style={{ flex: 1, minHeight: 0, maxHeight: "none" }}>
        {displayedLines.length === 0
          ? search
            ? `No lines match "${search}".`
            : "No log output."
          : displayedLines.map((line, i) => <div key={i}>{line || " "}</div>)}
      </div>
    </div>
  );
}
