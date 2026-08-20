export const deleteUser = (repository) => async (id) => {
  return repository.remove(id);
};
