import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { RepositoryRecord } from "../lib/types";
import { useAuth } from "../context/AuthContext";

interface FormState {
  id: string | null;
  name: string;
  url: string;
  username: string;
  secret: string;
}

const EMPTY_FORM: FormState = { id: null, name: "", url: "", username: "", secret: "" };

export function Repositories() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";

  const [repos, setRepos] = useState<RepositoryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .get<RepositoryRecord[]>("/repositories")
      .then(setRepos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load repositories"));
  }

  useEffect(load, []);

  function openCreate() {
    setForm(EMPTY_FORM);
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
      const payload: Record<string, string> = { name: form.name, url: form.url, username: form.username };
      if (form.secret) payload.secret = form.secret;

      if (form.id) {
        await api.patch(`/repositories/${form.id}`, payload);
      } else {
        await api.post("/repositories", payload);
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
    if (!confirm("Delete this repository? Existing deployment history will be kept.")) return;
    try {
      await api.delete(`/repositories/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete repository");
    }
  }

  return (
    <div>
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
                />
              </div>
            </div>
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
