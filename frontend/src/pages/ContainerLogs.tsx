import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";

const TAIL_OPTIONS = [100, 200, 500, 1000, 2000, 5000];
const REFRESH_MS = 3000;

// docker logs --timestamps prefixes every line with an RFC3339 timestamp like
// "2026-09-14T12:30:40.876778737Z ". We use that (not string position) to place
// the "new since you hit Enter" marker, so it stays correct even though each
// poll re-fetches the whole tail window rather than appending.
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s/;

function parseLineTimestamp(line: string): Date | null {
  const m = line.match(TIMESTAMP_RE);
  return m ? new Date(m[1]) : null;
}

const MARKER_PREFIX = "────────── mark";

function isMarkerLine(line: string): boolean {
  return line.startsWith(MARKER_PREFIX);
}

interface LogMark {
  id: number;
  at: Date;
}

/**
 * Inserts one divider per mark, each at the point in `lines` matching its own timestamp —
 * every "Mark now" click stays visible as its own divider (never replaced by the next one),
 * so repeated testing shows each hit's own before/after. A mark with nothing newer yet sorts
 * to the very end; several such marks keep the order they were clicked in.
 */
function withMarkers(lines: string[], marks: LogMark[]): string[] {
  if (marks.length === 0) return lines;
  const placed = marks
    .map((m) => {
      const idx = lines.findIndex((line) => {
        const t = parseLineTimestamp(line);
        return t !== null && t.getTime() > m.at.getTime();
      });
      const text = `${MARKER_PREFIX} #${m.id} at ${m.at.toLocaleTimeString()} — new lines below ──────────`;
      return { idx: idx === -1 ? lines.length : idx, at: m.at.getTime(), text };
    })
    .sort((a, b) => a.idx - b.idx || a.at - b.at);

  const result: string[] = [];
  let cursor = 0;
  for (const p of placed) {
    result.push(...lines.slice(cursor, p.idx));
    result.push(p.text);
    cursor = p.idx;
  }
  result.push(...lines.slice(cursor));
  return result;
}

export function ContainerLogs() {
  const { serverId, containerId } = useParams<{ serverId: string; containerId: string }>();
  const [searchParams] = useSearchParams();
  const containerName = searchParams.get("name") || containerId;

  const [tail, setTail] = useState(500);
  const [log, setLog] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [marks, setMarks] = useState<LogMark[]>([]);
  const nextMarkId = useRef(1);
  const logViewerRef = useRef<HTMLDivElement>(null);

  function load() {
    if (!serverId || !containerId) return;
    setLoading(true);
    api
      .get<{ log: string }>(`/servers/${serverId}/containers/${containerId}/logs?tail=${tail}`)
      .then((res) => {
        setLog(res.log);
        setError(null);
        setLastRefreshed(new Date());
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

  const displayedLines = useMemo(() => {
    const rawLines = log.split("\n");
    const filtered = search.trim()
      ? rawLines.filter((line) => line.toLowerCase().includes(search.trim().toLowerCase()))
      : rawLines;
    return withMarkers(filtered, marks);
  }, [log, search, marks]);

  useEffect(() => {
    const el = logViewerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayedLines]);

  // Anchored to the last line's own --timestamps value, not the browser's clock — the
  // container's clock (on whatever server it runs on) is what every log line is actually
  // stamped with, and it won't line up with the browser's clock if the two drift at all.
  // Every call adds a new mark rather than replacing the last one, so each "Mark now" click
  // keeps its own divider — handy for testing several hits in a row without losing earlier ones.
  function mark() {
    const rawLines = log.split("\n");
    let at: Date | null = null;
    for (let i = rawLines.length - 1; i >= 0; i--) {
      at = parseLineTimestamp(rawLines[i]);
      if (at) break;
    }
    setMarks((prev) => [...prev, { id: nextMarkId.current++, at: at ?? new Date() }]);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      mark();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", padding: "20px 28px" }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1>Logs — {containerName}</h1>
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
          placeholder="Search log text… (press Enter to mark this point)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={{ flex: 1, minWidth: 260 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh every 3s
        </label>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh now"}
        </button>
        <button className="btn btn-sm" onClick={mark}>
          Mark now
        </button>
        {marks.length > 0 && (
          <button className="btn btn-sm" onClick={() => setMarks([])}>
            Clear marks ({marks.length})
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ flexShrink: 0 }}>
          {error}
        </div>
      )}

      <div
        className="log-viewer"
        ref={logViewerRef}
        style={{ flex: 1, minHeight: 0, maxHeight: "none" }}
      >
        {displayedLines.length === 0
          ? search
            ? `No lines match "${search}".`
            : "No log output."
          : displayedLines.map((line, i) =>
              isMarkerLine(line) ? (
                <div key={i} className="log-marker">
                  {line}
                </div>
              ) : (
                <div key={i}>{line || " "}</div>
              )
            )}
      </div>
    </div>
  );
}
