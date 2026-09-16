import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ConfigFileBackupEntry, ConfigFileEntry, ServerRecord } from "../lib/types";
import { formatDateTime } from "../components/Badge";
import { useConfirm } from "../hooks/useConfirm";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ConfigFiles() {
  const { confirm, modal } = useConfirm();

  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [environment, setEnvironment] = useState("");
  const [serverId, setServerId] = useState("");
  const [basePath, setBasePath] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [appName, setAppName] = useState("");
  const [loadingApps, setLoadingApps] = useState(false);

  const [files, setFiles] = useState<ConfigFileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [backups, setBackups] = useState<ConfigFileBackupEntry[]>([]);
  const [restoringName, setRestoringName] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ServerRecord[]>("/servers").then(setServers).catch(() => undefined);
  }, []);

  const environments = Array.from(new Set(servers.map((s) => s.environment)));
  const environmentServers = servers.filter((s) => s.environment === environment);
  const selectedServer = servers.find((s) => s.id === serverId);

  const isJson = selectedFile?.toLowerCase().endsWith(".json") ?? false;
  let jsonError: string | null = null;
  if (isJson && content) {
    try {
      JSON.parse(content);
    } catch (err) {
      jsonError = (err as Error).message;
    }
  }
  const dirty = content !== originalContent;

  function handleEnvironmentChange(env: string) {
    setEnvironment(env);
    setServerId("");
    setBasePath("");
    resetApp();
  }

  function handleServerChange(id: string) {
    setServerId(id);
    setBasePath("");
    resetApp();
  }

  function resetApp() {
    setApps([]);
    setAppName("");
    setFiles([]);
    setFilesLoaded(false);
    closeFile();
  }

  function closeFile() {
    setSelectedFile(null);
    setContent("");
    setOriginalContent("");
    setBackups([]);
    setMessage(null);
  }

  async function handleBasePathChange(path: string) {
    setBasePath(path);
    setAppName("");
    setFiles([]);
    setFilesLoaded(false);
    closeFile();
    if (!path) return;
    setLoadingApps(true);
    setError(null);
    try {
      const res = await api.get<{ entries: { name: string }[] }>(
        `/deployments/browse?serverId=${encodeURIComponent(serverId)}&path=${encodeURIComponent(path)}`
      );
      setApps(res.entries.map((e) => e.name).filter((n) => n !== "Backups"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to list applications");
    } finally {
      setLoadingApps(false);
    }
  }

  async function loadFiles() {
    if (!serverId || !basePath || !appName) return;
    setLoadingFiles(true);
    setError(null);
    closeFile();
    try {
      const params = new URLSearchParams({ serverId, basePath, appName });
      const res = await api.get<ConfigFileEntry[]>(`/config-files?${params.toString()}`);
      setFiles(res);
      setFilesLoaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to list config files");
    } finally {
      setLoadingFiles(false);
    }
  }

  async function openFile(relativePath: string) {
    setSelectedFile(relativePath);
    setLoadingContent(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({ serverId, basePath, appName, relativePath });
      const [contentRes, backupsRes] = await Promise.all([
        api.get<{ content: string }>(`/config-files/content?${params.toString()}`),
        api.get<ConfigFileBackupEntry[]>(`/config-files/backups?${params.toString()}`),
      ]);
      setContent(contentRes.content);
      setOriginalContent(contentRes.content);
      setBackups(backupsRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open file");
      setSelectedFile(null);
    } finally {
      setLoadingContent(false);
    }
  }

  async function handleSave() {
    if (!selectedFile) return;
    const ok = await confirm(
      `Save changes to ${selectedFile} on ${selectedServer?.name}? The current version will be backed up ` +
        `first, so this can be undone from Version history.`,
      { title: "Save config file", confirmLabel: "Save", danger: true }
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.put(`/config-files/content`, { serverId, basePath, appName, relativePath: selectedFile, content });
      setOriginalContent(content);
      const params = new URLSearchParams({ serverId, basePath, appName, relativePath: selectedFile });
      api
        .get<ConfigFileBackupEntry[]>(`/config-files/backups?${params.toString()}`)
        .then(setBackups)
        .catch(() => undefined);
      setMessage("Saved.");
      const restart = await confirm(
        `Restart the container on ${selectedServer?.name} now so this change takes effect?`,
        { title: "Restart container", confirmLabel: "Restart" }
      );
      if (restart) {
        await api.post(`/config-files/restart`, { serverId, basePath, appName });
        setMessage("Saved and container restarted.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(backupName: string) {
    if (!selectedFile) return;
    const ok = await confirm(
      `Restore ${selectedFile} from backup "${backupName}"? The current version will be backed up first.`,
      { title: "Restore version", confirmLabel: "Restore", danger: true }
    );
    if (!ok) return;
    setRestoringName(backupName);
    setError(null);
    try {
      await api.post(`/config-files/restore`, { serverId, basePath, appName, relativePath: selectedFile, backupName });
      await openFile(selectedFile);
      setMessage(`Restored from ${backupName}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore file");
    } finally {
      setRestoringName(null);
    }
  }

  return (
    <div>
      {modal}
      <div className="page-header">
        <div>
          <h1>Config files</h1>
          <div className="page-subtitle">
            Edit appsettings*.json / *securesettings*.json / config.json directly on the server — the same
            files a deploy always leaves untouched — without SSHing in.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="form-field">
            <label>Environment</label>
            <select value={environment} onChange={(e) => handleEnvironmentChange(e.target.value)}>
              <option value="">Select an environment…</option>
              {environments.map((env) => (
                <option key={env} value={env}>
                  {env}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Server</label>
            <select value={serverId} onChange={(e) => handleServerChange(e.target.value)} disabled={!environment}>
              <option value="">Select a server…</option>
              {environmentServers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Deployment base path</label>
            <select value={basePath} onChange={(e) => handleBasePathChange(e.target.value)} disabled={!serverId}>
              <option value="">Select a path…</option>
              {selectedServer?.basePaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {basePath && (
            <div className="form-field">
              <label>Application {loadingApps && "(loading…)"}</label>
              <input
                list="config-app-options"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Search or select an application…"
              />
              <datalist id="config-app-options">
                {apps.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          )}
        </div>
        <button className="btn btn-primary" disabled={!apps.includes(appName) || loadingFiles} onClick={loadFiles}>
          {loadingFiles ? "Loading…" : "Load config files"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {filesLoaded && (
        <div className="card" style={{ marginBottom: 16 }}>
          {files.length === 0 ? (
            <div className="empty-state">
              No appsettings*.json / *securesettings*.json / config.json files found under this app's publish
              folder.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Last modified</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.relativePath}>
                    <td>{f.relativePath}</td>
                    <td className="muted">{formatSize(f.size)}</td>
                    <td className="muted">{formatDateTime(f.modifiedAt)}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => openFile(f.relativePath)}>
                        {selectedFile === f.relativePath ? "Reload" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedFile && (
        <div className="card">
          <div className="page-header" style={{ marginBottom: 10 }}>
            <div>
              <strong>{selectedFile}</strong>
              {dirty && (
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  (unsaved changes)
                </span>
              )}
            </div>
            <button
              className="btn btn-primary"
              disabled={loadingContent || saving || !dirty || !!jsonError}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {message && <div className="alert alert-info">{message}</div>}
          {jsonError && <div className="alert alert-error">Invalid JSON: {jsonError}</div>}

          {loadingContent ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 360,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12.5,
                lineHeight: 1.55,
                resize: "vertical",
              }}
            />
          )}

          <h3 style={{ marginTop: 20 }}>Version history</h3>
          {backups.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No previous versions yet — a backup is made automatically the first time this file is saved or
              restored.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Backed up</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.backupName}>
                    <td className="muted">{formatDateTime(b.modifiedAt)}</td>
                    <td>
                      <button
                        className="btn btn-sm"
                        disabled={restoringName !== null}
                        onClick={() => handleRestore(b.backupName)}
                      >
                        {restoringName === b.backupName ? "Restoring…" : "Restore this version"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
