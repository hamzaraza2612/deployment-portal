import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface BrowseResponse {
  path: string;
  entries: { name: string }[];
}

interface FileBrowserProps {
  serverId: string;
  rootPath: string;
  onSelect: (path: string) => void;
}

function parentOf(p: string, root: string): string {
  if (p === root) return p;
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  const parent = idx > 0 ? trimmed.slice(0, idx) : "/";
  return parent.length < root.length ? root : parent;
}

export function FileBrowser({ serverId, rootPath, onSelect }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPath(rootPath);
  }, [rootPath]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get<BrowseResponse>(`/deployments/browse?serverId=${encodeURIComponent(serverId)}&path=${encodeURIComponent(currentPath)}`)
      .then((res) => setEntries(res.entries.map((e) => e.name)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to list directory"))
      .finally(() => setLoading(false));
  }, [serverId, currentPath]);

  return (
    <div>
      <div className="file-browser">
        <div className="file-browser-path">{currentPath}</div>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : error ? (
          <div className="alert alert-error" style={{ margin: 14 }}>
            {error}
          </div>
        ) : (
          <>
            {currentPath !== rootPath && (
              <div className="file-browser-row" onClick={() => setCurrentPath(parentOf(currentPath, rootPath))}>
                ⬆️ .. (up)
              </div>
            )}
            {entries.length === 0 && currentPath === rootPath && (
              <div className="empty-state">No subfolders here.</div>
            )}
            {entries.map((name) => (
              <div
                key={name}
                className="file-browser-row"
                onClick={() => setCurrentPath(`${currentPath.replace(/\/+$/, "")}/${name}`)}
              >
                📁 {name}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="row-actions" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-primary" onClick={() => onSelect(currentPath)}>
          Select this directory
        </button>
      </div>
    </div>
  );
}
