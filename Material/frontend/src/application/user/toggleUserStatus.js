// An inactive user keeps their record, but login answers 401 "This account is
// inactive" — deactivating is the reversible alternative to deleting.
export const toggleUserStatus = (repository) => async (id) => {
  return repository.toggleStatus(id);
};
