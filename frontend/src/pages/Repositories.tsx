import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { GitCredentialRecord, RepositoryRecord } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

interface FormState {
  id: string | null;
  name: string;
  url: string;
  username: string;
  secret: string;
}

const EMPTY_FORM: FormState = { id: null, name: "", url: "", username: "", secret: "" };

interface CredFormState {
  id: string | null;
  host: string;
  username: string;
  secret: string;
}

const EMPTY_CRED_FORM: CredFormState = { id: null, host: "", username: "", secret: "" };

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export function Repositories() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";

  const [repos, setRepos] = useState<RepositoryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveAsCredential, setSaveAsCredential] = useState(true);
  const { confirm, modal } = useConfirm();

  const [credentials, setCredentials] = useState<GitCredentialRecord[]>([]);
  const [credPanelOpen, setCredPanelOpen] = useState(false);
  const [credFormOpen, setCredFormOpen] = useState(false);
  const [credForm, setCredForm] = useState<CredFormState>(EMPTY_CRED_FORM);
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);

  function load() {
    api
      .get<RepositoryRecord[]>("/repositories")
      .then(setRepos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load repositories"));
  }

  function loadCredentials() {
    if (!canManage) return;
    api
      .get<GitCredentialRecord[]>("/git-credentials")
      .then(setCredentials)
      .catch(() => undefined);
  }

  useEffect(load, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadCredentials, [canManage]);

  const repoHost = hostFromUrl(form.url);
  const matchedCredential = !form.id && repoHost ? credentials.find((c) => c.host === repoHost) : undefined;
  const showCredentialFields = !!form.id || !matchedCredential;

  function openCreate() {
    setForm(EMPTY_FORM);
    setSaveAsCredential(true);
    setFormOpen(true);
  }

  function openEdit(repo: RepositoryRecord) {
    setForm({ id: repo.id, name: repo.name, url: repo.url, username: repo.username, secret: "" });
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, string> = { name: form.name, url: form.url };
      if (form.username) payload.username = form.username;
      if (form.secret) payload.secret = form.secret;

      if (form.id) {
        await api.patch(`/repositories/${form.id}`, payload);
      } else {
        await api.post("/repositories", payload);
        if (saveAsCredential && repoHost && !matchedCredential && form.username && form.secret) {
          api
            .post("/git-credentials", { host: repoHost, username: form.username, secret: form.secret })
            .then(loadCredentials)
            .catch(() => undefined);
        }
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save repository");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm("Delete this repository? Existing deployment history will be kept.", {
      title: "Delete repository",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/repositories/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete repository");
    }
  }

  function openCredCreate() {
    setCredForm(EMPTY_CRED_FORM);
    setCredFormOpen(true);
  }

  function openCredEdit(credential: GitCredentialRecord) {
    setCredForm({ id: credential.id, host: credential.host, username: credential.username, secret: "" });
    setCredFormOpen(true);
  }

  async function handleCredSubmit(e: FormEvent) {
    e.preventDefault();
    setCredError(null);
    setCredSaving(true);
    try {
      if (credForm.id) {
        const payload: Record<string, string> = { username: credForm.username };
        if (credForm.secret) payload.secret = credForm.secret;
        await api.patch(`/git-credentials/${credForm.id}`, payload);
      } else {
        await api.post("/git-credentials", { host: credForm.host, username: credForm.username, secret: credForm.secret });
      }
      setCredFormOpen(false);
      loadCredentials();
    } catch (err) {
      setCredError(err instanceof ApiError ? err.message : "Failed to save git credential");
    } finally {
      setCredSaving(false);
    }
  }

  async function handleCredDelete(id: string) {
    const ok = await confirm(
      "Delete this git credential? Repositories already created with it keep working — only future " +
        "repos on this host will need a username/token entered manually.",
      { title: "Delete git credential", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await api.delete(`/git-credentials/${id}`);
      loadCredentials();
    } catch (err) {
      setCredError(err instanceof ApiError ? err.message : "Failed to delete git credential");
    }
  }

  return (
    <div>
      {modal}
      <div className="page-header">
        <div>
          <h1>Repositories</h1>
          <div className="page-subtitle">Git repositories available to deploy from.</div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            Add repository
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {canManage && (
        <div className="card">
          <button
            type="button"
            onClick={() => setCredPanelOpen((open) => !open)}
            style={{
              all: "unset",
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            <div>
              <strong>Git Credentials</strong>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {credentials.length > 0
                  ? `${credentials.length} saved host credential${credentials.length === 1 ? "" : "s"} — reused ` +
                    `automatically when adding a repository on that host.`
                  : "Save a username/token once per git host so adding a repository on it won't ask again."}
              </div>
            </div>
            <span className="muted" style={{ fontSize: 22, lineHeight: 1, fontWeight: 300 }}>
              {credPanelOpen ? "−" : "+"}
            </span>
          </button>

          {credPanelOpen && (
            <div style={{ marginTop: 14 }}>
              {credError && <div className="alert alert-error">{credError}</div>}

              {!credFormOpen && (
                <button className="btn btn-sm" style={{ marginBottom: 10 }} onClick={openCredCreate}>
                  Add credential
                </button>
              )}

              {credFormOpen && (
                <form onSubmit={handleCredSubmit} style={{ marginBottom: 12 }}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Host</label>
                      <input
                        value={credForm.host}
                        onChange={(e) => setCredForm({ ...credForm, host: e.target.value })}
                        placeholder="gitlab.techbey.pk"
                        disabled={!!credForm.id}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Git username</label>
                      <input
                        value={credForm.username}
                        onChange={(e) => setCredForm({ ...credForm, username: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Git password / token {credForm.id && "(leave blank to keep current)"}</label>
                      <input
                        type="password"
                        value={credForm.secret}
                        onChange={(e) => setCredForm({ ...credForm, secret: e.target.value })}
                        required={!credForm.id}
                      />
                    </div>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn" onClick={() => setCredFormOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={credSaving}>
                      {credSaving ? "Saving…" : "Save credential"}
                    </button>
                  </div>
                </form>
              )}

              {credentials.length === 0 ? (
                <div className="empty-state">No saved git credentials yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Host</th>
                      <th>Username</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((c) => (
                      <tr key={c.id}>
                        <td>{c.host}</td>
                        <td>{c.username}</td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-sm" onClick={() => openCredEdit(c)}>
                              Edit
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleCredDelete(c.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{form.id ? "Edit repository" : "Add repository"}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>Repository URL</label>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://github.com/org/repo.git"
                  required
                />
              </div>
              {showCredentialFields && (
                <>
                  <div className="form-field">
                    <label>Git username</label>
                    <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </div>
                  <div className="form-field">
                    <label>Git password / token {form.id && "(leave blank to keep current)"}</label>
                    <input
                      type="password"
                      value={form.secret}
                      onChange={(e) => setForm({ ...form, secret: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
            {!form.id && matchedCredential && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>
                Using the saved credential for <strong>{repoHost}</strong> (username: {matchedCredential.username})
                — nothing to enter here.
              </p>
            )}
            {!form.id && !matchedCredential && (
              <label
                className="muted"
                style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center", marginTop: -6 }}
              >
                <input
                  type="checkbox"
                  checked={saveAsCredential}
                  onChange={(e) => setSaveAsCredential(e.target.checked)}
                />
                Save this as the credential for {repoHost ?? "this host"} — future repos on it won't ask again.
              </label>
            )}
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save repository"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {repos.length === 0 ? (
          <div className="empty-state">No repositories configured yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Username</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {repos.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="muted">{r.url}</td>
                  <td>{r.username}</td>
                  <td>
                    {canManage && (
                      <div className="row-actions">
                        <button className="btn btn-sm" onClick={() => openEdit(r)}>
                          Edit
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>
                          Delete
                        </button>
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
