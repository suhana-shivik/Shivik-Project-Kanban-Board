const TOKEN_KEY = "material-erp.token";
const EXPIRY_KEY = "material-erp.token.expiresAt";

// The bearer token lives here and nowhere else. Everything that needs it —
// the API client, the session restore on boot — reads it through this module,
// so signing out has exactly one place to clear.
export const tokenStorage = {
  read() {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  },

  expiresAt() {
    try {
      const raw = window.localStorage.getItem(EXPIRY_KEY);
      if (!raw) return null;

      const time = Date.parse(raw);
      return Number.isNaN(time) ? null : time;
    } catch {
      return null;
    }
  },

  // A token past its expiry is worth discarding before it is sent — it saves a
  // round trip that could only ever come back 401.
  isExpired() {
    const expiry = tokenStorage.expiresAt();
    return expiry != null && expiry <= Date.now();
  },

  save(token, expiresAt) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);

      if (expiresAt) window.localStorage.setItem(EXPIRY_KEY, expiresAt);
      else window.localStorage.removeItem(EXPIRY_KEY);
    } catch {
      // A blocked localStorage only costs the session its survival across a
      // refresh; the in-memory session still works for this tab.
    }
  },

  clear() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(EXPIRY_KEY);
    } catch {
      // Nothing to recover from.
    }
  }
};
