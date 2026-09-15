import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { AppLinkRecord, ServerRecord } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

interface FormState {
  id: string | null;
  environment: string;
  name: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  environment: "",
  name: "",
  url: "",
  username: "",
  password: "",
  notes: "",
};

function SecretCell({ value }: { value: string | null }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="muted">—</span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable; ignore
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        {visible ? value : "••••••••"}
      </span>
      <button className="btn btn-sm" onClick={() => setVisible((v) => !v)}>
        {visible ? "Hide" : "Show"}
      </button>
      <button className="btn btn-sm" onClick={copy}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export function Links() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";

  const [links, setLinks] = useState<AppLinkRecord[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null);
  const { confirm, modal } = useConfirm();

  function load() {
    api
      .get<AppLinkRecord[]>("/links")
      .then((data) => {
        setLinks(data);
        setSelectedEnv((current) => current ?? data[0]?.environment ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load links"));
    api.get<ServerRecord[]>("/servers").then(setServers).catch(() => undefined);
  }

  useEffect(load, []);

  const knownEnvironments = Array.from(new Set(servers.map((s) => s.environment))).sort();
  const environments = useMemo(() => Array.from(new Set(links.map((l) => l.environment))).sort(), [links]);
  const linksInSelected = links.filter((l) => l.environment === selectedEnv);

  function openCreate() {
    setForm({ ...EMPTY_FORM, environment: selectedEnv ?? "" });
    setFormOpen(true);
  }

  function openEdit(link: AppLinkRecord) {
    setForm({
      id: link.id,
      environment: link.environment,
      name: link.name,
      url: link.url,
      username: link.username ?? "",
      password: "",
      notes: link.notes ?? "",
    });
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        environment: form.environment,
        name: form.name,
        url: form.url,
        username: form.username || undefined,
        notes: form.notes || undefined,
      };
      if (!form.id || form.password) {
        payload.password = form.password || undefined;
      }

      if (form.id) {
        await api.patch(`/links/${form.id}`, payload);
      } else {
        await api.post("/links", payload);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save link");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm("Delete this link?", { title: "Delete link", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api.delete(`/links/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete link");
    }
  }

  return (
    <div>
      {modal}
      <div className="page-header">
        <div>
          <h1>Links</h1>
          <div className="page-subtitle">
            Application URLs and login credentials, grouped by environment — no more asking around for a
            password.
          </div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            Add link
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {formOpen && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{form.id ? "Edit link" : "Add link"}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Environment</label>
                <input
                  list="link-environment-suggestions"
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value })}
                  placeholder="Dev, QA, Staging, Production…"
                  required
                />
                <datalist id="link-environment-suggestions">
                  {knownEnvironments.map((env) => (
                    <option key={env} value={env} />
                  ))}
                </datalist>
              </div>
              <div className="form-field">
                <label>Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Customer Portal"
                  required
                />
              </div>
              <div className="form-field">
                <label>URL</label>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://qa.example.com"
                  required
                />
              </div>
              <div className="form-field">
                <label>Username</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Password {form.id && "(leave blank to keep current)"}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
            <div className="form-field">
              <label>Notes (optional)</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save link" : "Create link"}
              </button>
            </div>
          </form>
        </div>
      )}

      {environments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            {canManage
              ? "No links yet — add one above."
              : "No links for your environment yet — ask an admin to add one under Links."}
          </div>
        </div>
      ) : (
        <>
          <div className="wizard-steps">
            {environments.map((env) => (
              <span
                key={env}
                className={"wizard-step" + (env === selectedEnv ? " current" : "")}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedEnv(env)}
              >
                {env}
              </span>
            ))}
          </div>

          <div className="card">
            {linksInSelected.length === 0 ? (
              <div className="empty-state">No links in this environment.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>URL</th>
                    <th>Username</th>
                    <th>Password</th>
                    <th>Notes</th>
                    {canManage && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {linksInSelected.map((link) => (
                    <tr key={link.id}>
                      <td>{link.name}</td>
                      <td>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.url}
                        </a>
                      </td>
                      <td className="muted">{link.username || "—"}</td>
                      <td>
                        <SecretCell value={link.password} />
                      </td>
                      <td className="muted">{link.notes || "—"}</td>
                      {canManage && (
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-sm" onClick={() => openEdit(link)}>
                              Edit
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(link.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
