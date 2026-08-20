// The shortcut for "move this person to another role", without reopening the
// whole form. The API refuses 409 if it would demote the last active admin, or
// if an admin aims it at themselves.
export const changeUserRole = (repository) => async (id, role) => {
  return repository.changeRole(id, role);
};
