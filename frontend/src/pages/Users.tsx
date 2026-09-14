import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Role, UserRecord } from "../lib/types";
import { formatDateTime } from "../components/Badge";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../hooks/useConfirm";

interface FormState {
  email: string;
  name: string;
  password: string;
  role: Role;
}

const EMPTY_FORM: FormState = { email: "", name: "", password: "", role: "VIEWER" };

export function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { confirm, modal } = useConfirm();

  function load() {
    api
      .get<UserRecord[]>("/users")
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users"));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/users", form);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(id: string, role: Role) {
    try {
      await api.patch(`/users/${id}`, { role });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
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
          <div className="page-subtitle">Manage who can access the deployment portal.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Cancel" : "Add user"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {formOpen && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add user</h3>
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
                  required
                />
              </div>
              <div className="form-field">
                <label>Password</label>
                <input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
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
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create user"}
            </button>
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
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                    disabled={u.id === currentUser?.userId}
                    style={{ padding: "4px 8px", fontSize: 13 }}
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                </td>
                <td className="muted">{formatDateTime(u.createdAt)}</td>
                <td className="text-right">
                  {u.id !== currentUser?.userId && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
