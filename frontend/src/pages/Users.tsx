import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Role, ServerRecord, UserRecord } from "../lib/types";
import { formatDateTime } from "../components/Badge";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

interface FormState {
  id: string | null;
  email: string;
  name: string;
  password: string;
  role: Role;
  environments: string[];
}

const EMPTY_FORM: FormState = {
  id: null,
  email: "",
  name: "",
  password: "",
  role: "VIEWER",
  environments: [],
};

export function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { confirm, modal } = useConfirm();

  const knownEnvironments = Array.from(new Set(servers.map((s) => s.environment))).sort();

  function load() {
    api
      .get<UserRecord[]>("/users")
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users"));
    api.get<ServerRecord[]>("/servers").then(setServers).catch(() => undefined);
  }

  useEffect(load, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(user: UserRecord) {
    setForm({
      id: user.id,
      email: user.email,
      name: user.name,
      password: "",
      role: user.role,
      environments: user.allowedEnvironments,
    });
    setFormOpen(true);
  }

  function toggleEnvironment(env: string) {
    setForm((prev) => ({
      ...prev,
      environments: prev.environments.includes(env)
        ? prev.environments.filter((e) => e !== env)
        : [...prev.environments, env],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (form.id) {
        const payload: Record<string, unknown> = {
          name: form.name,
          role: form.role,
          allowedEnvironments: form.environments,
        };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${form.id}`, payload);
      } else {
        await api.post("/users", {
          email: form.email,
          name: form.name,
          password: form.password,
          role: form.role,
          allowedEnvironments: form.environments,
        });
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm("Delete this user?", { title: "Delete user", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete user");
    }
  }

  return (
    <div>
      {modal}
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <div className="page-subtitle">
            Manage who can access the portal, and which environments they can see.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          Add user
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {formOpen && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{form.id ? "Edit user" : "Add user"}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!!form.id}
                  required
                />
              </div>
              <div className="form-field">
                <label>Password {form.id && "(leave blank to keep current)"}</label>
                <input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!form.id}
                />
              </div>
              <div className="form-field">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  <option value="ADMIN">Admin — full access</option>
                  <option value="OPERATOR">Operator — can deploy</option>
                  <option value="VIEWER">Viewer — read only</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Environments</label>
              {form.role === "ADMIN" ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  Admins automatically have access to every environment.
                </div>
              ) : knownEnvironments.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  No environments exist yet — add a server under Servers first.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {knownEnvironments.map((env) => (
                    <label
                      key={env}
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: "normal" }}
                    >
                      <input
                        type="checkbox"
                        checked={form.environments.includes(env)}
                        onChange={() => toggleEnvironment(env)}
                      />
                      {env}
                    </label>
                  ))}
                </div>
              )}
              {form.role !== "ADMIN" && form.environments.length === 0 && (
                <div className="alert alert-info" style={{ marginTop: 10 }}>
                  With no environment selected, this user won't see any servers, deployments, or history
                  until you assign at least one.
                </div>
              )}
            </div>

            <div className="row-actions">
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save user" : "Create user"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Environments</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td>
                  <span className={`badge badge-${u.role}`}>{u.role}</span>
                </td>
                <td className="muted">
                  {u.role === "ADMIN" ? "All" : u.allowedEnvironments.join(", ") || "None assigned"}
                </td>
                <td className="muted">{formatDateTime(u.createdAt)}</td>
                <td className="text-right">
                  <div className="row-actions">
                    <button className="btn btn-sm" onClick={() => openEdit(u)}>
                      Edit
                    </button>
                    {u.id !== currentUser?.userId && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
