import { toUserPayload } from "../../domain/entities/User";

export const updateUser = (repository) => async (id, form) => {
  return repository.update(id, toUserPayload(form));
};
