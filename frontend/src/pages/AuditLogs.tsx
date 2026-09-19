import { Fragment, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { AuditFieldChange, AuditLogEntry } from "../lib/types";
import { formatDateTime } from "../components/Badge";

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function FieldChangeTable({ changes }: { changes: Record<string, AuditFieldChange> }) {
  return (
    <table className="field-change-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(changes).map(([field, change]) => (
          <tr key={field}>
            <td>
              <code>{field}</code>
            </td>
            <td>{formatValue(change.from)}</td>
            <td>{formatValue(change.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const MAX_DIFF_RENDER_LINES = 500;

function DiffView({ entries }: { entries: { type: "context" | "add" | "remove"; line: string }[] }) {
  if (entries.length === 0) {
    return <div className="muted">File was re-saved with no content changes.</div>;
  }
  const shown = entries.slice(0, MAX_DIFF_RENDER_LINES);
  return (
    <div className="log-viewer" style={{ maxHeight: 360 }}>
      {shown.map((entry, i) => (
        <span
          key={i}
          className={
            "diff-line " +
            (entry.type === "add" ? "diff-add" : entry.type === "remove" ? "diff-remove" : "diff-context")
          }
        >
          {entry.type === "add" ? "+ " : entry.type === "remove" ? "- " : "  "}
          {entry.line}
        </span>
      ))}
      {entries.length > MAX_DIFF_RENDER_LINES && (
        <span className="diff-line diff-context">… {entries.length - MAX_DIFF_RENDER_LINES} more line(s) not shown</span>
      )}
    </div>
  );
}

function LogDetails({ log }: { log: AuditLogEntry }) {
  if (!log.details) return null;
  if (log.details.kind === "fields") return <FieldChangeTable changes={log.details.changes} />;
  if (log.details.kind === "diff") return <DiffView entries={log.details.entries} />;
  return (
    <div className="muted">
      File too large to show a line-by-line diff — size changed from {log.details.sizeBefore} to{" "}
      {log.details.sizeAfter} bytes.
    </div>
  );
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load(q: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    api
      .get<AuditLogEntry[]>(`/audit-logs?${params.toString()}`)
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit logs"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => load(search), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Audit logs</h1>
          <div className="page-subtitle">
            Every action taken in the portal — who did it, when, and what changed. Most recent 300 entries.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="form-field">
            <label>Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="User, action, or summary…"
            />
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {loading && logs.length === 0 ? (
          <div className="empty-state">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            {search ? `No audit logs match "${search}".` : "No audit logs yet."}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Summary</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const expanded = expandedId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td>
                        {log.userName}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {log.userEmail}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: 12.5 }}>{log.action}</code>
                      </td>
                      <td>{log.summary}</td>
                      <td>
                        {log.details && (
                          <button
                            className="btn btn-sm"
                            onClick={() => setExpandedId(expanded ? null : log.id)}
                          >
                            {expanded ? "Hide detail" : "View detail"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && log.details && (
                      <tr>
                        <td colSpan={5} style={{ background: "var(--bg-elevated)" }}>
                          <LogDetails log={log} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
