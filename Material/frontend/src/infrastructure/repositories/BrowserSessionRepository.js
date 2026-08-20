import { tokenStorage } from "../auth/tokenStorage";
import { onSessionEnded } from "../http/apiClient";

// The browser's answer to the session port: the token lives in localStorage,
// and a session ends when the API rejects that token with a 401.
export class BrowserSessionRepository {
  read() {
    return tokenStorage.read();
  }

  isExpired() {
    return tokenStorage.isExpired();
  }

  save(token, expiresAt) {
    tokenStorage.save(token, expiresAt);
  }

  clear() {
    tokenStorage.clear();
  }

  // Returns the unsubscribe function.
  onEnded(handler) {
    return onSessionEnded(handler);
  }
}
