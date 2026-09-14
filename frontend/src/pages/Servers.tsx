import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AuthType, ServerRecord } from "../lib/types";
import { useAuth } from "../context/AuthContext";

interface FormState {
  id: string | null;
  name: string;
  environment: string;
  host: string;
  port: string;
  sshUser: string;
  gitBaseDir: string;
  auditLogPath: string;
  basePaths: string;
  authType: AuthType;
  password: string;
  privateKey: string;
  passphrase: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  environment: "Production",
  host: "",
  port: "22",
  sshUser: "root",
  gitBaseDir: "/mnt/data/git-directory",
  auditLogPath: "/mnt/data/deployment_audit.log",
  basePaths: "/mnt/data/techbey-apps, /mnt/data/techbey-apps8",
  authType: "PASSWORD",
  password: "",
  privateKey: "",
  passphrase: "",
};

export function Servers() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";
  const canTest = user?.role === "ADMIN" || user?.role === "OPERATOR";

  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  function load() {
    api
      .get<ServerRecord[]>("/servers")
      .then(setServers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load servers"));
  }

  const environments = Array.from(new Set(servers.map((s) => s.environment))).sort();

  useEffect(load, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(server: ServerRecord) {
    setForm({
      id: server.id,
      name: server.name,
      environment: server.environment,
      host: server.host,
      port: String(server.port),
      sshUser: server.sshUser,
      gitBaseDir: server.gitBaseDir,
      auditLogPath: server.auditLogPath,
      basePaths: server.basePaths.join(", "),
      authType: server.authType,
      password: "",
      privateKey: "",
      passphrase: "",
    });
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const auth =
        form.authType === "PASSWORD"
          ? { authType: "PASSWORD" as const, password: form.password }
          : { authType: "PRIVATE_KEY" as const, privateKey: form.privateKey, passphrase: form.passphrase || undefined };

      const payload = {
        name: form.name,
        environment: form.environment,
        host: form.host,
        port: Number(form.port),
        sshUser: form.sshUser,
        gitBaseDir: form.gitBaseDir,
        auditLogPath: form.auditLogPath,
        basePaths: form.basePaths
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        ...((form.authType === "PASSWORD" && !form.password) ||
        (form.authType === "PRIVATE_KEY" && !form.privateKey)
          ? {}
          : { auth }),
      };

      if (form.id) {
        await api.patch(`/servers/${form.id}`, payload);
      } else {
        await api.post("/servers", { ...payload, auth });
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save server");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this server? This cannot be undone.")) return;
    try {
      await api.delete(`/servers/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete server");
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResult((prev) => ({ ...prev, [id]: "" }));
    try {
      await api.post(`/servers/${id}/test-connection`);
      setTestResult((prev) => ({ ...prev, [id]: "ok" }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: err instanceof ApiError ? err.message : "Connection failed",
      }));
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Servers</h1>
          <div className="page-subtitle">Remote environments the portal deploys to over SSH.</div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            Add server
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {formOpen && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{form.id ? "Edit server" : "Add server"}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>Environment</label>
                <input
                  list="environment-suggestions"
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value })}
                  placeholder="Dev, Staging, Production…"
                  required
                />
                <datalist id="environment-suggestions">
                  {environments.map((env) => (
                    <option key={env} value={env} />
                  ))}
                </datalist>
              </div>
              <div className="form-field">
                <label>Host</label>
                <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>SSH port</label>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>SSH user</label>
                <input
                  value={form.sshUser}
                  onChange={(e) => setForm({ ...form, sshUser: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Git base directory</label>
                <input
                  value={form.gitBaseDir}
                  onChange={(e) => setForm({ ...form, gitBaseDir: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Audit log path</label>
                <input
                  value={form.auditLogPath}
                  onChange={(e) => setForm({ ...form, auditLogPath: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-field">
              <label>Deployment base paths (comma separated)</label>
              <input
                value={form.basePaths}
                onChange={(e) => setForm({ ...form, basePaths: e.target.value })}
                placeholder="/mnt/data/techbey-apps, /mnt/data/techbey-apps8"
                required
              />
            </div>
            <div className="form-field">
              <label>Authentication method</label>
              <select
                value={form.authType}
                onChange={(e) => setForm({ ...form, authType: e.target.value as AuthType })}
              >
                <option value="PASSWORD">Password</option>
                <option value="PRIVATE_KEY">Private key</option>
              </select>
            </div>
            {form.authType === "PASSWORD" ? (
              <div className="form-field">
                <label>SSH password {form.id && "(leave blank to keep current)"}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            ) : (
              <>
                <div className="form-field">
                  <label>Private key {form.id && "(leave blank to keep current)"}</label>
                  <textarea
                    rows={5}
                    value={form.privateKey}
                    onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  />
                </div>
                <div className="form-field">
                  <label>Passphrase (optional)</label>
                  <input
                    type="password"
                    value={form.passphrase}
                    onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save server"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {servers.length === 0 ? (
          <div className="empty-state">No servers configured yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Environment</th>
                <th>Host</th>
                <th>SSH user</th>
                <th>Base paths</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <span className="badge badge-ADMIN">{s.environment}</span>
                  </td>
                  <td>
                    {s.host}:{s.port}
                  </td>
                  <td>{s.sshUser}</td>
                  <td className="muted">{s.basePaths.join(", ") || "—"}</td>
                  <td>
                    <div className="row-actions">
                      {canTest && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleTest(s.id)}
                          disabled={testingId === s.id}
                        >
                          {testingId === s.id
                            ? "Testing…"
                            : testResult[s.id] === "ok"
                            ? "Connected ✓"
                            : testResult[s.id]
                            ? "Failed ✗"
                            : "Test connection"}
                        </button>
                      )}
                      {canManage && (
                        <>
                          <button className="btn btn-sm" onClick={() => openEdit(s)}>
                            Edit
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                    {testResult[s.id] && testResult[s.id] !== "ok" && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {testResult[s.id]}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
