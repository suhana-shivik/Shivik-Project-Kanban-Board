import { useMemo, useState } from "react";
import { ShieldAlert, Upload, X } from "lucide-react";
import { ASSIGNABLE_ROLES, ROLES } from "../../../domain/auth/permissions";
import { toUserForm } from "../../../domain/entities/User";
import { STATUS, STATUS_OPTIONS } from "../../../domain/valueObjects/Status";
import { MultiSelect } from "../common/MultiSelect";
import { errorMessage } from "../../utils/apiError";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const blankForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  role: ROLES.VIEWER,
  status: STATUS.ACTIVE,
  departmentIds: [],
  projectIds: [],
  managerIds: [],
  profileImage: null,
  signature: null
};

export function UserForm({
  user,
  options,
  onSubmit,
  onCancel,
  submitting,
  isSelf
}) {
  const editing = Boolean(user);

  const [form, setForm] = useState(() =>
    editing ? toUserForm(user) : blankForm
  );

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const chosenRole = useMemo(
    () => ASSIGNABLE_ROLES.find((entry) => entry.role === form.role),
    [form.role]
  );

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
  }

  function pickFile(field, file) {
    if (!file) return update(field, null);

    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({
        ...prev,
        [field]: "Only image files are allowed."
      }));
      return;
    }

    // The API caps uploads at 2 MB (UPLOAD_MAX_BYTES) — catching it here saves
    // uploading a file that is only going to be rejected.
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors((prev) => ({
        ...prev,
        [field]: "That image is over 2 MB."
      }));
      return;
    }

    update(field, file);
  }

  function validate() {
    const found = {};

    if (!form.firstName.trim()) found.firstName = "First name is required";
    if (!form.lastName.trim()) found.lastName = "Last name is required";

    if (!form.email.trim()) found.email = "Email is required";
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      found.email = "Enter a valid email address";
    }

    // On edit the password field means "reset it to this" — blank leaves the
    // existing one alone, so it is only required when creating.
    const password = form.password.trim();
    if (!editing && !password) found.password = "Password is required";
    else if (password && password.length < 6) {
      found.password = "Password must be at least 6 characters";
    }

    const phone = form.phone.trim();
    if (phone && !/^\d{10}$/.test(phone)) {
      found.phone = "Phone number must be exactly 10 digits";
    }

    return found;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const found = validate();

    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }

    try {
      await onSubmit(form);
    } catch (err) {
      const fieldErrors = err?.errors || {};
      setErrors(fieldErrors);

      if (!Object.keys(fieldErrors).length) {
        setFormError(errorMessage(err, "Could not save. Please try again."));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="user-form">
      <div className="form-grid">
        <div className="form-field">
          <label>First name *</label>
          <input
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            placeholder="e.g. Neha"
          />
          {errors.firstName && (
            <span className="field-error">{errors.firstName}</span>
          )}
        </div>

        <div className="form-field">
          <label>Last name *</label>
          <input
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            placeholder="e.g. Kulkarni"
          />
          {errors.lastName && (
            <span className="field-error">{errors.lastName}</span>
          )}
        </div>

        <div className="form-field">
          <label>Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="name@company.com"
          />
          {errors.email ? (
            <span className="field-error">{errors.email}</span>
          ) : (
            <span className="field-hint">Used to sign in. Must be unique.</span>
          )}
        </div>

        <div className="form-field">
          <label>Phone</label>
          <input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="10 digits"
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </div>

        <div className="form-field">
          <label>{editing ? "New password" : "Password *"}</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            placeholder={editing ? "Leave blank to keep current" : "Min 6 characters"}
          />
          {errors.password ? (
            <span className="field-error">{errors.password}</span>
          ) : (
            editing && (
              <span className="field-hint">
                Blank leaves their password unchanged.
              </span>
            )
          )}
        </div>

        <div className="form-field">
          <label>Status</label>
          <select
            value={form.status}
            disabled={isSelf}
            onChange={(e) => update("status", e.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            {isSelf
              ? "You cannot deactivate your own account."
              : "Inactive users keep their record but cannot sign in."}
          </span>
        </div>
      </div>

      {/* The role is the point of this form — it decides what the person can
          do everywhere else in the app, so it gets space rather than a
          one-line dropdown. */}
      <div className="form-section">
        <div className="section-title">Role *</div>

        <div className="role-picker">
          {ASSIGNABLE_ROLES.map((entry) => (
            <button
              key={entry.role}
              type="button"
              className={`role-option ${
                form.role === entry.role ? "active" : ""
              } ${isSelf ? "locked" : ""}`}
              disabled={isSelf}
              onClick={() => update("role", entry.role)}
              aria-pressed={form.role === entry.role}
            >
              <span className={`role-badge ${entry.role}`}>{entry.label}</span>
              <span className="role-option-summary">{entry.summary}</span>
            </button>
          ))}
        </div>

        {isSelf && (
          <div className="inline-warning">
            <ShieldAlert size={14} />
            You cannot change your own role — that guard is what stops an admin
            locking everyone out of this page.
          </div>
        )}

        {!isSelf && chosenRole?.role === ROLES.ADMIN && (
          <div className="inline-warning">
            <ShieldAlert size={14} />
            Administrators can manage users and roles, including yours.
          </div>
        )}

        {errors.role && <span className="field-error">{errors.role}</span>}
      </div>

      <div className="form-section">
        <div className="section-title">Assignment</div>

        <MultiSelect
          label="Departments"
          options={options.departments}
          selected={form.departmentIds}
          onChange={(ids) => update("departmentIds", ids)}
          emptyText="No departments found."
        />
        {errors.departmentIds && (
          <span className="field-error">{errors.departmentIds}</span>
        )}

        <MultiSelect
          label="Projects"
          options={options.projects}
          selected={form.projectIds}
          onChange={(ids) => update("projectIds", ids)}
          emptyText="No projects found."
        />
        {errors.projectIds && (
          <span className="field-error">{errors.projectIds}</span>
        )}

        <MultiSelect
          label="Reporting to"
          options={options.managers}
          selected={form.managerIds}
          onChange={(ids) => update("managerIds", ids)}
          emptyText="No active users to report to yet."
        />
        {errors.managerIds && (
          <span className="field-error">{errors.managerIds}</span>
        )}
      </div>

      <div className="form-section">
        <div className="section-title">Images</div>

        <div className="form-row">
          <FilePicker
            label="Profile image"
            file={form.profileImage}
            existingUrl={user?.profileImageUrl}
            error={errors.profileImage}
            onPick={(file) => pickFile("profileImage", file)}
            onClear={() => update("profileImage", null)}
          />

          <FilePicker
            label="Digital signature"
            file={form.signature}
            existingUrl={user?.signatureUrl}
            error={errors.signature}
            onPick={(file) => pickFile("signature", file)}
            onClear={() => update("signature", null)}
          />
        </div>

        {editing && (
          <span className="field-hint">
            No new file keeps the stored image.
          </span>
        )}
      </div>

      {formError && <div className="form-error">{formError}</div>}

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={submitting}>
          {submitting
            ? "Saving..."
            : editing
            ? "Save changes"
            : "Create user"}
        </button>
      </div>
    </form>
  );
}

function FilePicker({ label, file, existingUrl, error, onPick, onClear }) {
  return (
    <div className="form-field grow">
      <label>{label}</label>

      <div className="file-picker">
        <label className="file-drop">
          <Upload size={15} />
          <span>{file ? file.name : "Choose an image"}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              onPick(e.target.files?.[0] ?? null);
              // Let the same file be picked again after an error.
              e.target.value = "";
            }}
          />
        </label>

        {file && (
          <button
            type="button"
            className="tiny-icon"
            title="Remove"
            onClick={onClear}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error ? (
        <span className="field-error">{error}</span>
      ) : (
        existingUrl &&
        !file && <span className="field-hint">An image is already stored.</span>
      )}
    </div>
  );
}
