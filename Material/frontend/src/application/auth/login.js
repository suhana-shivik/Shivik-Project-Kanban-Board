import { createUserEntity } from "../../domain/entities/User";

export const login =
  (authRepository, sessionRepository) => async (credentials) => {
    const response = await authRepository.login({
      email: String(credentials.email ?? "").trim(),
      password: credentials.password ?? ""
    });

    // Persist before returning: the very next render can fire data calls, and
    // they all need the bearer token to already be in place.
    if (response?.accessToken) {
      sessionRepository.save(response.accessToken, response.expiresAt);
    }

    return createUserEntity(response?.user ?? {});
  };
