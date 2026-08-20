import { useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { Modal } from "../../components/common/Modal";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Toast } from "../../components/common/Toast";
import { UserForm } from "../../components/users/UserForm";
import { UserTable } from "../../components/users/UserTable";
import { SearchBox, StatusSelect } from "../../components/common/SearchBox";
import { useResource } from "../../hooks/useResource";
import { useUserFormOptions } from "../../hooks/useUserFormOptions";
import { ASSIGNABLE_ROLES } from "../../../domain/auth/permissions";
import { errorMessage, toastFor } from "../../utils/apiError";

export function UsersPage({ deps, user, onSignOut, page, onNavigate }) {
  const {
    data: users,
    loading,
    error,
    reload: load
  } = useResource(deps.users.getAll);

  const { options } = useUserFormOptions(deps.users.formOptions);

  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const dirty = Boolean(query || role || status);

  async function refresh(overrides = {}) {
    await load({ query, role, status, ...overrides });
  }

  async function clearFilters() {
    setQuery("");
    setRole("");
    setStatus("");
    await load({});
  }

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setFormOpen(true);
  }

  async function handleSubmit(form) {
    setSubmitting(true);

    try {
      if (editing) {
        await deps.users.update(editing.id, form);
        setToast({ type: "success", message: "User updated successfully." });
      } else {
        await deps.users.create(form);
        setToast({ type: "success", message: "User created successfully." });
      }

      setFormOpen(false);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  // The quickest path for the common ask: move somebody to another role
  // without reopening the whole form. It lands on their next request.
  async function handleChangeRole(row, nextRole) {
    if (nextRole === row.role) return;

    try {
      await deps.users.changeRole(row.id, nextRole);

      const label =
        ASSIGNABLE_ROLES.find((entry) => entry.role === nextRole)?.label ??
        nextRole;

      setToast({
        type: "success",
        message: `${row.name} is now ${label}. It applies on their next request.`
      });

      await refresh();
    } catch (err) {
      setToast(toastFor(err, "Could not change that role."));
      // The select is uncontrolled by the failure, so put the row back.
      await refresh();
    }
  }

  async function handleToggleStatus(row) {
    try {
      await deps.users.toggleStatus(row.id);
      await refresh();
    } catch (err) {
      setToast(toastFor(err, "Could not change that status."));
    }
  }

  async function handleDelete() {
    try {
      await deps.users.delete(deleteTarget.id);
      setDeleteTarget(null);
      setToast({ type: "success", message: "User deleted successfully." });
      await refresh();
    } catch (err) {
      setDeleteTarget(null);
      setToast(toastFor(err, "This user cannot be deleted."));
    }
  }

  return (
    <AppShell
      user={user}
      onSignOut={onSignOut}
      page={page}
      onNavigate={onNavigate}
      offline={Boolean(error)}
    >
      <header className="topbar">
        <div>
          <div className="breadcrumb">Administration / Users</div>
          <h1>Users</h1>
        </div>

        <div className="top-actions">
          <button className="button primary" onClick={openAdd}>
            <UserPlus size={17} />
            Add user
          </button>
        </div>
      </header>

      <section className="single-panel">
        <section className="materials-panel">
          <div className="panel-toolbar">
            <div className="filters">
              <SearchBox
                value={query}
                onChange={setQuery}
                onSubmit={() => refresh()}
                placeholder="Search by name or email..."
              />

              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Filter by role"
              >
                <option value="">All roles</option>
                {ASSIGNABLE_ROLES.map((entry) => (
                  <option key={entry.role} value={entry.role}>
                    {entry.label}
                  </option>
                ))}
              </select>

              <StatusSelect value={status} onChange={setStatus} />

              {dirty && (
                <button className="button ghost" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            <div className="toolbar-right">
              <button
                className="icon-button"
                onClick={() => refresh()}
                title="Refresh"
              >
                <RefreshCw size={17} />
              </button>
              <button className="button filter-button" onClick={() => refresh()}>
                Apply
              </button>
            </div>
          </div>

          {error && (
            <div className="api-error">
              <strong>Unable to load users.</strong>
              {/* Most often a 403: this page needs `user:read`, which only an
                  admin holds. The message says so rather than blaming the
                  connection. */}
              <span>
                {errorMessage(
                  error,
                  "Make sure your backend is running and reachable."
                )}
              </span>
            </div>
          )}

          <UserTable
            users={users}
            loading={loading}
            currentUserId={user?.id}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onChangeRole={handleChangeRole}
            onToggleStatus={handleToggleStatus}
          />
        </section>
      </section>

      <Modal
        open={formOpen}
        title={editing ? `Edit ${editing.name}` : "Add new user"}
        onClose={() => setFormOpen(false)}
        width={760}
      >
        <UserForm
          // Remounts between add and edit so the form never opens holding the
          // previous user's values.
          key={editing?.id ?? "new"}
          user={editing}
          options={options}
          isSelf={Boolean(editing) && editing.id === user?.id}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
          submitting={submitting}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete user"
        message={`Delete "${deleteTarget?.name ?? ""}"? They lose access immediately. Deactivating instead keeps their record and can be undone.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </AppShell>
  );
}
