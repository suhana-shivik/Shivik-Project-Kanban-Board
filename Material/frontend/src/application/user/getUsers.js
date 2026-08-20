export const getUsers = (repository) => async (filters = {}) => {
  const rows = await repository.getAll(filters);

  return Array.isArray(rows) ? rows : [];
};
