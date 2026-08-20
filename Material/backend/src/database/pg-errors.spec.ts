import { ConflictError, ValidationError } from '../common/errors';
import { asDomainError } from './pg-errors';

/**
 * Every service checks for a duplicate before inserting — and that check is
 * check-then-act, so under concurrency another request slips in between. The
 * database catches it; this maps what the database says back onto the field
 * the caller sent, so losing the race reads the same as failing the pre-check.
 *
 * Measured before this existed: 16 simultaneous inserts of the same code
 * produced 165 raw 500s across 12 rounds. After: 0.
 */
describe('translating PostgreSQL errors', () => {
  const pgError = (code: string, constraint?: string) => ({ code, constraint });

  it('turns a duplicate material code into the same field error as the pre-check', () => {
    const error = asDomainError(pgError('23505', 'materials_code_key'));

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors).toEqual({
      code: 'This item code already exists',
    });
  });

  it('names the right field for each unique index', () => {
    const cases: [string, string][] = [
      ['categories_name_key', 'name'],
      ['categories_code_key', 'code'],
      ['subcategories_code_key', 'code'],
      ['subcategories_root_name_key', 'name'],
      ['subcategories_child_name_key', 'name'],
      ['materials_code_key', 'code'],
      ['users_email_key', 'email'],
      ['roles_name_key', 'name'],
      ['departments_name_key', 'name'],
      ['projects_name_key', 'name'],
    ];

    for (const [constraint, field] of cases) {
      const error = asDomainError(pgError('23505', constraint));

      expect(error).toBeInstanceOf(ValidationError);
      expect(Object.keys((error as ValidationError).errors)).toEqual([field]);
    }
  });

  it('falls back to a conflict for a unique index nobody mapped', () => {
    const error = asDomainError(pgError('23505', 'some_future_index'));

    expect(error).toBeInstanceOf(ConflictError);
  });

  it('reports a foreign key violation as a conflict, not a 500', () => {
    expect(asDomainError(pgError('23503'))).toBeInstanceOf(ConflictError);
  });

  it('reports a check constraint as a conflict', () => {
    expect(asDomainError(pgError('23514'))).toBeInstanceOf(ConflictError);
  });

  it('leaves anything else alone, so real bugs stay 500s', () => {
    // a syntax error is our fault, not the caller's — it must not be dressed
    // up as a 400 the client could act on
    expect(asDomainError(pgError('42601'))).toBeNull();
    expect(asDomainError(new Error('connection reset'))).toBeNull();
    expect(asDomainError('a string')).toBeNull();
    expect(asDomainError(null)).toBeNull();
    expect(asDomainError(undefined)).toBeNull();
  });
});
