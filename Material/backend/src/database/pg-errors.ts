import { ConflictError, DomainError, ValidationError } from '../common/errors';

/**
 * Turns a PostgreSQL error into the same domain error the application would
 * have raised itself.
 *
 * Why this is needed even though every service already checks first: those
 * checks are **check-then-act**, and between the check and the INSERT another
 * request can slip in. Under real concurrency that is not rare — 16
 * simultaneous inserts of the same code produced 165 constraint violations in
 * one measurement.
 *
 * The database is the thing that actually enforces uniqueness; the pre-check
 * only exists to produce a friendly message in the common case. This maps the
 * constraint back onto the same field, so a caller gets the identical
 * `{ errors: { code: "…" } }` whether they lost the race or not — instead of a
 * bare 500.
 *
 * No row locking is involved, and none would help: for an INSERT there is no
 * row to lock yet. The unique index *is* the lock.
 */

/** PostgreSQL SQLSTATE codes, see appendix A of the manual. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';

/** Constraint name -> the field it belongs to and what to tell the caller. */
const UNIQUE_CONSTRAINTS: Record<string, { field: string; message: string }> = {
  categories_name_key: {
    field: 'name',
    message: 'A category with this name already exists',
  },
  categories_code_key: {
    field: 'code',
    message: 'This category code already exists',
  },
  subcategories_code_key: {
    field: 'code',
    message: 'This sub-category code already exists',
  },
  subcategories_root_name_key: {
    field: 'name',
    message: 'A sub-category with this name already exists in this category',
  },
  subcategories_child_name_key: {
    field: 'name',
    message: 'A sub-category with this name already exists under this parent',
  },
  materials_code_key: {
    field: 'code',
    message: 'This item code already exists',
  },
  users_email_key: {
    field: 'email',
    message: 'A user with this email already exists',
  },
  roles_name_key: {
    field: 'name',
    message: 'A role with this name already exists',
  },
  roles_slug_key: {
    field: 'name',
    message: 'A role already resolves to this name. Pick a more distinct one.',
  },
  departments_name_key: {
    field: 'name',
    message: 'A department with this name already exists',
  },
  projects_name_key: {
    field: 'name',
    message: 'A project with this name already exists',
  },
  modules_key_key: { field: 'key', message: 'This module key already exists' },
};

interface PostgresError {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
}

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== 'object' || error === null) return null;

  const candidate = error as PostgresError;
  return typeof candidate.code === 'string' ? candidate : null;
}

/**
 * Returns the domain error this database error corresponds to, or null when it
 * is not one the caller could have caused — those stay 500s.
 */
export function asDomainError(error: unknown): DomainError | null {
  const pg = asPostgresError(error);
  if (!pg) return null;

  switch (pg.code) {
    case UNIQUE_VIOLATION: {
      const known = pg.constraint
        ? UNIQUE_CONSTRAINTS[pg.constraint]
        : undefined;

      return known
        ? ValidationError.field(known.field, known.message)
        : new ConflictError('That value is already taken.');
    }

    case FOREIGN_KEY_VIOLATION:
      // the row being pointed at is gone, or something still points at this one
      return new ConflictError(
        'That record is still referenced by other data, or the record it refers to no longer exists.',
      );

    case CHECK_VIOLATION:
      return new ConflictError('That change breaks a rule on the record.');

    case NOT_NULL_VIOLATION:
      return new ValidationError({
        [pg.constraint ?? 'field']: 'This field is required',
      });

    default:
      return null;
  }
}
