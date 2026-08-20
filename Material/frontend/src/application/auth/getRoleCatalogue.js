import { roleLabelOf } from "../../domain/auth/permissions";

// Public route — the sign-in screen uses it to explain what each role gets
// before anyone has signed in.
export const getRoleCatalogue = (repository) => async () => {
  const response = await repository.roles();

  const rows = Array.isArray(response) ? response : response?.roles ?? [];

  return rows.map((entry) => ({
    role: entry.role ?? entry.name,
    label: roleLabelOf(entry.role ?? entry.name),
    description: entry.description ?? "",
    permissions: Array.isArray(entry.permissions) ? entry.permissions : []
  }));
};
