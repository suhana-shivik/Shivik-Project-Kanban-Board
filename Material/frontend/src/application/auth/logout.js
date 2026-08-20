// The API issues stateless JWTs, so there is nothing to revoke server-side —
// signing out is dropping the token this browser holds.
export const logout = (sessionRepository) => async () => {
  sessionRepository.clear();
};
