/**
 * What the business layer throws. Deliberately free of `@nestjs/common`: a
 * service should not know it is being reached over HTTP, so it says
 * "this is a conflict", not "this is a 409".
 *
 * DomainExceptionFilter turns these into responses at the edge — the one place
 * that is allowed to care about status codes.
 */

export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    // without this, `instanceof` fails on a subclass when targeting ES5
    this.name = new.target.name;
  }
}

/** The record does not exist. Becomes 404. */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message);
  }

  static of(entity: string, id: number | string): NotFoundError {
    return new NotFoundError(`${entity} ${id} not found`);
  }
}

/**
 * The request is well-formed but the current state forbids it — deleting a
 * category that still has materials, demoting the last admin. Becomes 409 with
 * `{ reason }`, the shape the frontend already renders.
 */
export class ConflictError extends DomainError {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export type FieldErrors = Record<string, string>;

/**
 * One or more named fields are wrong. Becomes 400 with
 * `{ errors: { field: message } }`.
 */
export class ValidationError extends DomainError {
  constructor(readonly errors: FieldErrors) {
    super(Object.values(errors)[0] ?? 'Validation failed');
  }

  static field(name: string, message: string): ValidationError {
    return new ValidationError({ [name]: message });
  }
}

/** The caller is not who they claim to be. Becomes 401. */
export class UnauthenticatedError extends DomainError {}

/** The caller is known but not allowed. Becomes 403. */
export class ForbiddenError extends DomainError {
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * Too many attempts in too short a window. Becomes 429 with a Retry-After
 * hint, so a client knows when it is worth trying again.
 */
export class RateLimitError extends DomainError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}
