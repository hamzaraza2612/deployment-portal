import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { RepositoryRecord, ServerRecord } from "../lib/types";
import { FileBrowser } from "../components/FileBrowser";
import { SearchSelect } from "../components/SearchSelect";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS: Record<Step, string> = {
  1: "Server & repository",
  2: "Branch",
  3: "Source directory",
  4: "Target application",
  5: "Confirm",
  6: "Deploying",
};

export function Deploy() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [repositories, setRepositories] = useState<RepositoryRecord[]>([]);
  const [serverId, setServerId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");

  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [gitDir, setGitDir] = useState("");

  const [sourcePath, setSourcePath] = useState("");

  const [basePath, setBasePath] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [appName, setAppName] = useState("");

  const [backupName, setBackupName] = useState("");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<ServerRecord[]>("/servers"), api.get<RepositoryRecord[]>("/repositories")])
      .then(([s, r]) => {
        setServers(s);
        setRepositories(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load servers/repositories"));
  }, []);

  const selectedServer = servers.find((s) => s.id === serverId);

  async function handleFetchBranches() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ branches: string[]; gitDir: string }>("/deployments/branches", {
        serverId,
        repositoryId,
      });
      setBranches(res.branches);
      setGitDir(res.gitDir);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to fetch branches");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckout() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; gitDir: string }>("/deployments/checkout", {
        serverId,
        repositoryId,
        branch,
      });
      setGitDir(res.gitDir);
      setSourcePath(res.gitDir);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to checkout branch");
    } finally {
      setBusy(false);
    }
  }

  function handleSourceSelected(path: string) {
    setSourcePath(path);
    setStep(4);
  }

  async function loadApps(chosenBasePath: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await api.get<{ entries: { name: string }[] }>(
        `/deployments/browse?serverId=${encodeURIComponent(serverId)}&path=${encodeURIComponent(chosenBasePath)}`
      );
      setApps(res.entries.map((e) => e.name).filter((name) => name !== "Backups"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to list applications");
    } finally {
      setBusy(false);
    }
  }

  function handleBasePathChange(path: string) {
    setBasePath(path);
    setAppName("");
    if (path) loadApps(path);
  }

  function resetWizard() {
    setStep(1);
    setServerId("");
    setRepositoryId("");
    setBranches([]);
    setBranch("");
    setGitDir("");
    setSourcePath("");
    setBasePath("");
    setApps([]);
    setAppName("");
    setBackupName("");
    setDeploymentId(null);
    setError(null);
  }

  async function handleDeploy() {
    setError(null);
    setBusy(true);
    try {
      const deployment = await api.post<{ id: string }>("/deployments", {
        serverId,
        repositoryId,
        branch,
        sourcePath,
        basePath,
        appName,
        backupName: backupName || undefined,
      });
      setDeploymentId(deployment.id);
      setStep(6);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start deployment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>New deployment</h1>
          <div className="page-subtitle">
            Walks through the same steps as the deployment script, run remotely over SSH.
          </div>
        </div>
      </div>

      <div className="wizard-steps">
        {(Object.keys(STEP_LABELS) as unknown as Step[]).map((s) => (
          <span
            key={s}
            className={"wizard-step" + (s === step ? " current" : s < step ? " done" : "")}
          >
            {s}. {STEP_LABELS[s]}
          </span>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {step === 1 && (
        <div className="card">
          <div className="form-grid">
            <div className="form-field">
              <label>Server</label>
              <select value={serverId} onChange={(e) => setServerId(e.target.value)}>
                <option value="">Select a server…</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.host})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Repository</label>
              <select value={repositoryId} onChange={(e) => setRepositoryId(e.target.value)}>
                <option value="">Select a repository…</option>
                {repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={!serverId || !repositoryId || busy}
            onClick={handleFetchBranches}
          >
            {busy ? "Cloning / pulling…" : "Clone or pull, then continue"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <div className="form-field">
            <label>Branch ({branches.length} available — type to search)</label>
            <SearchSelect
              options={branches}
              value={branch}
              onChange={setBranch}
              placeholder="Search or select a branch…"
            />
            {branch && !branches.includes(branch) && (
              <div className="muted" style={{ fontSize: 12 }}>
                No branch matches "{branch}" exactly.
              </div>
            )}
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={!branches.includes(branch) || busy}
              onClick={handleCheckout}
            >
              {busy ? "Checking out…" : "Checkout branch"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <p className="page-subtitle" style={{ marginTop: 0 }}>
            Browse to the folder that should be published (the project's build/publish output).
          </p>
          <FileBrowser serverId={serverId} rootPath={gitDir} onSelect={handleSourceSelected} />
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => setStep(2)}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <div className="form-field">
            <label>Deployment base path</label>
            <select value={basePath} onChange={(e) => handleBasePathChange(e.target.value)}>
              <option value="">Select a deployment path…</option>
              {selectedServer?.basePaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {basePath && (
            <div className="form-field">
              <label>Application ({apps.length} available — type to search)</label>
              {busy ? (
                <div className="empty-state">Loading applications…</div>
              ) : (
                <>
                  <SearchSelect
                    options={apps}
                    value={appName}
                    onChange={setAppName}
                    placeholder="Search or select an application…"
                  />
                  {appName && !apps.includes(appName) && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      No application matches "{appName}" exactly.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div className="row-actions">
            <button className="btn" onClick={() => setStep(3)}>
              Back
            </button>
            <button className="btn btn-primary" disabled={!apps.includes(appName)} onClick={() => setStep(5)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Review and confirm</h3>
          <dl className="summary-list">
            <dt>Server</dt>
            <dd>{selectedServer?.name}</dd>
            <dt>Repository</dt>
            <dd>{repositories.find((r) => r.id === repositoryId)?.name}</dd>
            <dt>Branch</dt>
            <dd>{branch}</dd>
            <dt>Source path</dt>
            <dd>{sourcePath}</dd>
            <dt>Target app path</dt>
            <dd>
              {basePath}/{appName}
            </dd>
            <dt>Publish dir</dt>
            <dd>
              {basePath}/{appName}/publish
            </dd>
          </dl>
          <div className="form-field" style={{ marginTop: 16 }}>
            <label>Backup name (optional — defaults to a timestamp)</label>
            <input
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              placeholder={`Backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_...`}
            />
          </div>
          <div className="alert alert-info">
            This will back up the current publish folder, rsync the new build in (excluding
            appsettings*.json / *securesettings*.json / config.json), and restart the container with
            docker compose. Confirm to proceed.
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => setStep(4)}>
              Back
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={handleDeploy}>
              {busy ? "Starting…" : "Confirm & deploy"}
            </button>
          </div>
        </div>
      )}

      {step === 6 && deploymentId && (
        <DeployProgress
          deploymentId={deploymentId}
          onDone={() => navigate(`/history/${deploymentId}`)}
          onStartNew={resetWizard}
        />
      )}
    </div>
  );
}

interface DeploymentPoll {
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  log: string;
}

function DeployProgress({
  deploymentId,
  onDone,
  onStartNew,
}: {
  deploymentId: string;
  onDone: () => void;
  onStartNew: () => void;
}) {
  const [poll, setPoll] = useState<DeploymentPoll | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number;

    async function tick() {
      try {
        const data = await api.get<DeploymentPoll>(`/deployments/${deploymentId}`);
        if (cancelled) return;
        setPoll(data);
        if (data.status === "SUCCESS" || data.status === "FAILED") return;
      } catch {
        // keep retrying
      }
      timer = window.setTimeout(tick, 1500);
    }
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deploymentId]);

  const finished = poll?.status === "SUCCESS" || poll?.status === "FAILED";

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {!finished && <span className="spinner" />}
        <strong>
          {poll?.status === "SUCCESS"
            ? "Deployment succeeded ✅"
            : poll?.status === "FAILED"
            ? "Deployment failed ❌"
            : "Deployment in progress…"}
        </strong>
      </div>
      <div className="log-viewer">{poll?.log || "Waiting for output…"}</div>
      {finished && (
        <div className="row-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onStartNew}>
            Start a new deployment
          </button>
          <button className="btn btn-primary" onClick={onDone}>
            View deployment details
          </button>
        </div>
      )}
    </div>
  );
}
