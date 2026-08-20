import { apiClient } from "../http/apiClient";

export class ApiAuthRepository {
  // Returns `{ message, accessToken, tokenType, expiresIn, expiresAt, user }`.
  // `user.permissions` is the resolved list for the role — the whole basis for
  // what the UI lets this person do.
  async login(credentials) {
    return apiClient("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify(credentials)
    });
  }

  // The signed-in user plus their permissions. Permissions are resolved per
  // request rather than baked into the token, so a role changed by an admin
  // takes effect here without a new login.
  async me() {
    return apiClient("/auth/me");
  }

  async permissions() {
    return apiClient("/auth/permissions");
  }

  // Public — the sign-in screen explains the roles before anyone has a token.
  async roles() {
    return apiClient("/auth/roles", { auth: false });
  }

  async changePassword(payload) {
    return apiClient("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}
