import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { GitCredentialRecord } from "../lib/types";
import { useConfirm } from "../hooks/useConfirm";

interface FormState {
  id: string | null;
  host: string;
  username: string;
  secret: string;
}

const EMPTY_FORM: FormState = { id: null, host: "", username: "", secret: "" };

export function GitCredentials() {
  const [credentials, setCredentials] = useState<GitCredentialRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { confirm, modal } = useConfirm();

  function load() {
    api
      .get<GitCredentialRecord[]>("/git-credentials")
      .then(setCredentials)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load git credentials"));
  }

  useEffect(load, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(credential: GitCredentialRecord) {
    setForm({ id: credential.id, host: credential.host, username: credential.username, secret: "" });
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (form.id) {
        const payload: Record<string, string> = { username: form.username };
        if (form.secret) payload.secret = form.secret;
        await api.patch(`/git-credentials/${form.id}`, payload);
      } else {
        await api.post("/git-credentials", { host: form.host, username: form.username, secret: form.secret });
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save git credential");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm(
      "Delete this git credential? Repositories already created with it keep working — only future " +
        "repos on this host will need a username/token entered manually.",
      { title: "Delete git credential", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await api.delete(`/git-credentials/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete git credential");
    }
  }

  return (
    <div>
      {modal}
      <div className="page-header">
        <div>
          <h1>Git Credentials</h1>
          <div className="page-subtitle">
            Save a username/token once per git host — adding a repository on that host afterwards won't ask
            for it again.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          Add credential
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {formOpen && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{form.id ? "Edit git credential" : "Add git credential"}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Host</label>
                <input
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="gitlab.techbey.pk"
                  disabled={!!form.id}
                  required
                />
              </div>
              <div className="form-field">
                <label>Git username</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Git password / token {form.id && "(leave blank to keep current)"}</label>
                <input
                  type="password"
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  required={!form.id}
                />
              </div>
            </div>
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save credential"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
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
                      <button className="btn btn-sm" onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>
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
    </div>
  );
}
