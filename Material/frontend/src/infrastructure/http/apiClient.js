import { tokenStorage } from "../auth/tokenStorage";

const BASE_URL = "/api";

const SESSION_ENDED = "material-erp:session-ended";

// A 401 on any call means the token this tab holds is gone or expired. The
// client cannot re-render the app itself, so it clears the token and announces
// it; useAuth listens and drops back to the sign-in screen with a reason.
export function onSessionEnded(handler) {
  const listener = (event) => handler(event.detail);
  window.addEventListener(SESSION_ENDED, listener);
  return () => window.removeEventListener(SESSION_ENDED, listener);
}

function endSession(reason) {
  tokenStorage.clear();
  window.dispatchEvent(new CustomEvent(SESSION_ENDED, { detail: { reason } }));
}

export async function apiClient(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  // `auth: false` marks the handful of routes that are public — login and the
  // role catalogue the sign-in screen reads before anyone has a token.
  const { auth = true, headers = {}, ...rest } = options;

  const token = auth ? tokenStorage.read() : null;
  const isFormData = rest.body instanceof FormData;

  let response;

  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        // Multipart needs the browser to set its own boundary.
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    });
  } catch {
    throw {
      status: 0,
      message: `Cannot reach the API at ${url}. Is the backend running?`
    };
  }

  const text = await response.text();

  let body = null;
  let isJson = true;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      isJson = false;
    }
  }

  if (!response.ok) {
    const error = {
      status: response.status,
      ...(isJson && body ? body : {}),
      ...(isJson
        ? {}
        : { message: `The API returned ${response.status} for ${url}.` })
    };

    // Only a token we actually sent can have expired. A 401 from the login
    // form is a wrong password, and must not look like a dropped session.
    if (response.status === 401 && token) {
      endSession(
        error.message || "Your session has expired. Please sign in again."
      );
      error.sessionEnded = true;
    }

    // The API names what was missing: { message, requiredPermissions, role }.
    // Flagging it here lets every caller show one consistent denial notice.
    if (response.status === 403) {
      error.forbidden = true;
    }

    throw error;
  }

  // A 200 that isn't JSON means the request never reached the backend — the
  // dev server answered with its SPA fallback page instead.
  if (text && !isJson) {
    throw {
      status: response.status,
      message: `Expected JSON from ${url} but got a non-JSON response. The request hit the dev server instead of your backend — set VITE_API_TARGET so /api is proxied.`
    };
  }

  if (response.status === 204) return null;

  return body;
}
