import { createUserEntity } from "../../domain/entities/User";

// On boot, a stored token is a claim, not a session. This trades it for the
// live user — which also re-reads the permission list, so a role an admin
// changed while this tab was closed is picked up on the next load rather than
// leaving stale buttons on screen.
export const restoreSession =
  (authRepository, sessionRepository) => async () => {
    if (!sessionRepository.read() || sessionRepository.isExpired()) {
      sessionRepository.clear();
      return null;
    }

    try {
      return createUserEntity(await authRepository.me());
    } catch (error) {
      // A 401 already cleared the token. Anything else (the backend being
      // down) should not strand the user on a dead screen either.
      sessionRepository.clear();

      if (error?.status === 0) throw error;

      return null;
    }
  };
