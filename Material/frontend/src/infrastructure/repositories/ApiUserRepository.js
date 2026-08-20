import { apiClient } from "../http/apiClient";
import { buildQuery } from "../http/buildQuery";

// The user routes take `multipart/form-data`, because the same form carries a
// profile image and a digital signature. This is where a plain payload object
// becomes that — the layers above never see a FormData.
function toFormData(payload) {
  const form = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value == null) return;

    // Files ride as-is; anything else is a field.
    if (value instanceof File || value instanceof Blob) {
      form.append(key, value);
      return;
    }

    // The API reads "1,2,3" for the multi-selects, and an empty string is a
    // meaningful value there — it clears every selection.
    if (Array.isArray(value)) {
      form.append(key, value.join(","));
      return;
    }

    form.append(key, String(value));
  });

  return form;
}

export class ApiUserRepository {
  async getAll(filters = {}) {
    const query = buildQuery({
      query: filters.query?.trim(),
      role: filters.role,
      status: filters.status
    });

    return apiClient(`/users${query}`);
  }

  async getById(id) {
    return apiClient(`/users/${id}`);
  }

  async add(payload) {
    return apiClient("/users", {
      method: "POST",
      body: toFormData(payload)
    });
  }

  // PUT is a full replace of the form: an omitted password is left alone, and
  // an empty multi-select clears it.
  async update(id, payload) {
    return apiClient(`/users/${id}`, {
      method: "PUT",
      body: toFormData(payload)
    });
  }

  // Takes effect on the user's next request — permissions are resolved per
  // request rather than baked into their token.
  async changeRole(id, role) {
    return apiClient(`/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role })
    });
  }

  // No body — the server flips Active <-> Inactive itself.
  async toggleStatus(id) {
    return apiClient(`/users/${id}/status`, { method: "PATCH" });
  }

  async remove(id) {
    return apiClient(`/users/${id}`, { method: "DELETE" });
  }

  // Public — the sign-up form renders these dropdowns before anyone has a token.
  async lookups() {
    return apiClient("/users/lookups", { auth: false });
  }

  // The "Reporting to" picker. Needs `user:read`.
  async managers() {
    return apiClient("/users/managers");
  }
}
