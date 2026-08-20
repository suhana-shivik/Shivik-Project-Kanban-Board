export const getCategories = (repository) => (filters = {}) =>
  repository.getAll(filters);
