import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";

interface LogsModalProps {
  title: string;
  serverId: string;
  containerId: string;
  onClose: () => void;
}

const TAIL_OPTIONS = [100, 200, 500, 1000, 2000];
const REFRESH_MS = 3000;

export function LogsModal({ title, serverId, containerId, onClose }: LogsModalProps) {
  const [tail, setTail] = useState(200);
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const logViewerRef = useRef<HTMLDivElement>(null);

  function load() {
    setLoading(true);
    api
      .get<{ log: string }>(
        `/servers/${serverId}/containers/${containerId}/logs?tail=${tail}`
      )
      .then((res) => {
        setLog(res.log);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load logs"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [serverId, containerId, tail]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, serverId, containerId, tail]);

  useEffect(() => {
    const el = logViewerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
          <div className="form-field" style={{ margin: 0 }}>
            <select value={tail} onChange={(e) => setTail(Number(e.target.value))} style={{ padding: "6px 10px" }}>
              {TAIL_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Last {n} lines
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh every 3s
          </label>
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh now"}
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="log-viewer" ref={logViewerRef} style={{ maxHeight: 420 }}>
          {log || "No log output."}
        </div>

        <div className="row-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
