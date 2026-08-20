import { createContext, useContext, useMemo } from "react";
import {
  can as canDo,
  canAny as canAnyOf,
  deniedReason,
  isReadOnly as isReadOnlyRole,
  roleLabelOf
} from "../../domain/auth/permissions";

const AuthContext = createContext(null);

// One place the whole tree asks "may this user do X?". Components take a
// permission name, never a role, which keeps the UI in step with the API —
// re-cutting a role server-side changes what renders here with no edit.
export function AuthProvider({ user, children }) {
  const value = useMemo(
    () => ({
      user,
      role: user?.role ?? null,
      roleLabel: roleLabelOf(user?.role),
      can: (...required) => canDo(user, ...required),
      canAny: (...required) => canAnyOf(user, ...required),
      isReadOnly: isReadOnlyRole(user),
      reasonFor: (required) => deniedReason(user, required)
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useSession must be used inside an <AuthProvider>.");
  }

  return context;
}

// Shorthand for the common case: a single boolean for a single permission.
export function usePermission(...required) {
  return useSession().can(...required);
}
