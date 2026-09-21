import type { AuditFieldChange, AuditLogEntry } from "../lib/types";

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
        <span className="diff-line diff-context">
          … {entries.length - MAX_DIFF_RENDER_LINES} more line(s) not shown
        </span>
      )}
    </div>
  );
}

/** Renders an audit log entry's structured before/after detail (field changes or a content diff). */
export function AuditDetail({ log }: { log: AuditLogEntry }) {
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
