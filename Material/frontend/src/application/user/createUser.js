import { toUserPayload } from "../../domain/entities/User";

// The admin-facing twin of sign-up: same form, but this one may hand out any
// role, `admin` included. Public registration refuses that.
export const createUser = (repository) => async (form) => {
  return repository.add(toUserPayload(form));
};
