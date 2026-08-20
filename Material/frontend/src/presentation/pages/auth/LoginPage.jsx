import { useEffect, useState } from "react";
import { Boxes, Lock, Mail, ShieldCheck } from "lucide-react";

export function LoginPage({ onSignIn, notice, loadRoles }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState([]);

  // `GET /auth/roles` is public precisely so this screen can explain the roles
  // before anyone has a token. If it fails the form still works.
  useEffect(() => {
    if (!loadRoles) return;

    let cancelled = false;

    loadRoles()
      .then((catalogue) => {
        if (!cancelled) setRoles(catalogue);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [loadRoles]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const clientErrors = {};
    if (!email.trim()) clientErrors.email = "Email is required";
    if (!password) clientErrors.password = "Password is required";

    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);

    try {
      await onSignIn({ email, password });
    } catch (err) {
      setErrors(err?.errors || {});

      // 401 comes back as { message: "Invalid email or password" }, and an
      // inactive account as { message: "This account is inactive" }.
      if (!err?.errors) {
        setFormError(err?.message || "Could not sign in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">
            <Boxes size={21} />
          </div>
          <div>
            <strong>Material ERP</strong>
            <span>Construction management</span>
          </div>
        </div>

        <h1>Sign in</h1>
        <p className="login-lead">
          Enter your credentials to open the material master.
        </p>

        {notice && <div className="session-notice">{notice}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Email</label>
            <div className="input-with-icon">
              <Mail size={15} />
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors({});
                }}
                placeholder="you@company.com"
              />
            </div>
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-field">
            <label>Password</label>
            <div className="input-with-icon">
              <Lock size={15} />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors({});
                }}
                placeholder="••••••"
              />
            </div>
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <button className="button primary login-submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {roles.length > 0 && (
          <div className="role-catalogue">
            <div className="role-catalogue-head">
              <ShieldCheck size={14} />
              <span>What each role can do</span>
            </div>

            <ul>
              {roles.map((entry) => (
                <li key={entry.role}>
                  <span className={`role-badge ${entry.role}`}>
                    {entry.label}
                  </span>
                  <span className="role-description">
                    {entry.description ||
                      `${entry.permissions.length} permissions`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="login-note">
          Your role decides what you can change. Buttons you are not permitted
          to use are disabled or hidden, and the API enforces the same rules.
        </p>
      </div>
    </div>
  );
}
