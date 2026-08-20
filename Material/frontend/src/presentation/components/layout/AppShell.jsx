import { Boxes, LogOut, Users } from "lucide-react";
import { initialsOf } from "../../../domain/entities/User";
import { useSession } from "../../auth/AuthContext";

// Every role sees both pages. The user directory needs `user:read` to load, so
// a role without it lands on the page's error panel rather than being kept out
// of it — the API is what decides, not this list.
const NAV = [
  { key: "materials", label: "Materials", icon: Boxes },
  { key: "users", label: "Users", icon: Users }
];

export function AppShell({ user, onSignOut, page, onNavigate, offline, children }) {
  // Only for the badge under the user's name — nothing here is gated on it.
  const { roleLabel } = useSession();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Boxes size={21} />
          </div>
          <div>
            <strong>Material ERP</strong>
            <span>Construction management</span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">MASTER DATA</div>

          {NAV.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.key}
                className={`sidebar-item ${page === item.key ? "active" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {user && (
          <div className="sidebar-user">
            <div className="avatar">{initialsOf(user)}</div>
            <div className="sidebar-user-text">
              <strong>{user.name || user.email}</strong>
              {user.name && <span>{user.email}</span>}
              <span className={`role-badge ${user.role}`}>{roleLabel}</span>
            </div>
            <button
              className="tiny-icon sign-out"
              title="Sign out"
              onClick={onSignOut}
            >
              <LogOut size={15} />
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <div className={`connection-dot ${offline ? "offline" : ""}`} />
          <span>{offline ? "API unreachable" : "Connected to API"}</span>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
