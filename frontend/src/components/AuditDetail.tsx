import type { AuditLogEntry } from "../lib/types";

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const UNAVAILABLE = <div className="muted">Detail for this entry isn't available.</div>;

function FieldChangeTable({ changes }: { changes: unknown }) {
  if (!changes || typeof changes !== "object") return UNAVAILABLE;
  const entries = Object.entries(changes as Record<string, { from?: unknown; to?: unknown }>);
  if (entries.length === 0) return UNAVAILABLE;
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
        {entries.map(([field, change]) => (
          <tr key={field}>
            <td>
              <code>{field}</code>
            </td>
            <td>{formatValue(change?.from)}</td>
            <td>{formatValue(change?.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const MAX_DIFF_RENDER_LINES = 500;

function DiffView({ entries }: { entries: unknown }) {
  if (!Array.isArray(entries)) return UNAVAILABLE;
  if (entries.length === 0) {
    return <div className="muted">File was re-saved with no content changes.</div>;
  }
  const shown = entries.slice(0, MAX_DIFF_RENDER_LINES);
  return (
    <div className="diff-viewer" style={{ maxHeight: 360 }}>
      {shown.map((entry, i) => {
        const e = entry as { type?: unknown; line?: unknown } | null;
        const type = e?.type === "add" || e?.type === "remove" ? e.type : "context";
        const line = typeof e?.line === "string" ? e.line : "";
        return (
          <span
            key={i}
            className={"diff-line " + (type === "add" ? "diff-add" : type === "remove" ? "diff-remove" : "diff-context")}
          >
            {type === "add" ? "+ " : type === "remove" ? "- " : "  "}
            {line}
          </span>
        );
      })}
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
  const details = log.details as { kind?: string } & Record<string, unknown>;
  if (!details || typeof details !== "object") return null;
  if (details.kind === "fields") return <FieldChangeTable changes={details.changes} />;
  if (details.kind === "diff") return <DiffView entries={details.entries} />;
  if (details.kind === "diff-summary") {
    const sizeBefore = typeof details.sizeBefore === "number" ? details.sizeBefore : "?";
    const sizeAfter = typeof details.sizeAfter === "number" ? details.sizeAfter : "?";
    return (
      <div className="muted">
        File too large to show a line-by-line diff — size changed from {sizeBefore} to {sizeAfter} bytes.
      </div>
    );
  }
  return UNAVAILABLE;
}
