import { Edit2, Trash2 } from "lucide-react";
import { ASSIGNABLE_ROLES } from "../../../domain/auth/permissions";
import { initialsOf } from "../../../domain/entities/User";
import { TableState } from "../common/TableState";

export function UserTable({
  users,
  loading,
  currentUserId,
  onEdit,
  onDelete,
  onChangeRole,
  onToggleStatus
}) {
  if (loading || !users.length) {
    return (
      <TableState
        loading={loading}
        loadingText="Loading users..."
        title="No users found"
        hint="Try changing your search, or add a new user."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>USER</th>
            <th>PHONE</th>
            <th>ROLE</th>
            <th>DEPARTMENTS</th>
            <th>PROJECTS</th>
            <th>STATUS</th>
            <th className="action-head"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((row) => {
            // The API refuses these with a 409 rather than letting an admin
            // strand themselves. Blocking them here means the guard is
            // explained before it is hit, not after.
            const isSelf = row.id === currentUserId;

            return (
              <tr key={row.id}>
                <td>
                  <div className="user-cell">
                    <div className="avatar small">{initialsOf(row)}</div>
                    <div className="user-cell-text">
                      <strong>
                        {row.name}
                        {isSelf && <span className="you-tag">you</span>}
                      </strong>
                      <span>{row.email}</span>
                    </div>
                  </div>
                </td>

                <td>{row.phone || "—"}</td>

                <td>
                  <select
                    className="role-select"
                    value={row.role}
                    disabled={isSelf}
                    title={
                      isSelf
                        ? "You cannot change your own role."
                        : "Change this user's role"
                    }
                    onChange={(e) => onChangeRole(row, e.target.value)}
                  >
                    {ASSIGNABLE_ROLES.map((entry) => (
                      <option key={entry.role} value={entry.role}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <NameList items={row.departments} />
                </td>
                <td>
                  <NameList items={row.projects} />
                </td>

                <td>
                  {/* Self-guards stay: the API answers 409 for these, so they
                      are not about roles. */}
                  {isSelf ? (
                    <span
                      className={`status-pill static ${row.status.toLowerCase()}`}
                      title="You cannot deactivate your own account."
                    >
                      <span className="status-dot" />
                      {row.status}
                    </span>
                  ) : (
                    <button
                      className={`status-pill ${row.status.toLowerCase()}`}
                      onClick={() => onToggleStatus(row)}
                      title="Toggle status"
                    >
                      <span className="status-dot" />
                      {row.status}
                    </button>
                  )}
                </td>

                <td>
                  <div className="row-actions">
                    <button
                      className="tiny-icon"
                      onClick={() => onEdit(row)}
                      title="Edit user"
                    >
                      <Edit2 size={15} />
                    </button>
                    {!isSelf && (
                      <button
                        className="tiny-icon danger-icon"
                        onClick={() => onDelete(row)}
                        title="Delete user"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NameList({ items }) {
  if (!items?.length) return "—";

  return (
    <div className="name-list">
      {items.map((item) => (
        <span key={item.id} className="name-chip" title={item.name}>
          {item.name}
        </span>
      ))}
    </div>
  );
}
