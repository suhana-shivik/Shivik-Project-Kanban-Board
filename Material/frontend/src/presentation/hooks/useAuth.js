import { useCallback, useEffect, useState } from "react";

// The session is the token plus the user the API resolves from it. Nothing
// about the user is trusted from localStorage: a stored token is exchanged for
// a fresh `/auth/me` on boot, so the permission list on screen is always the
// one the server would enforce on the next request.
export function useAuth(deps) {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const restored = await deps.restore();
        if (!cancelled) setUser(restored);
      } catch {
        // An unreachable API on boot lands on the sign-in screen, where the
        // failure is reported again the moment they try to sign in.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deps]);

  // A 401 anywhere in the app means the token died mid-session.
  useEffect(
    () =>
      deps.onSessionEnded(({ reason }) => {
        setUser(null);
        setNotice(reason || "Your session has ended. Please sign in again.");
      }),
    [deps]
  );

  const signIn = useCallback(
    async (credentials) => {
      const signedIn = await deps.login(credentials);
      setNotice(null);
      setUser(signedIn);
      return signedIn;
    },
    [deps]
  );

  const signOut = useCallback(async () => {
    await deps.logout();
    setNotice(null);
    setUser(null);
  }, [deps]);

  return { user, restoring, notice, signIn, signOut };
}
