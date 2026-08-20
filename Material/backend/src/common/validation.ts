import { ValidationError as ClassValidatorError } from 'class-validator';
import { FieldErrors } from './errors';

/**
 * A missing field trips every decorator at once ("is required" AND "is too
 * long"). class-validator does not order them, so pick the presence failure
 * first — that is the one worth showing.
 */
const CONSTRAINT_PRIORITY = [
  'isDefined',
  'isNotEmpty',
  'arrayNotEmpty',
  'isString',
  'isInt',
  'isArray',
  'min',
  'isIn',
  'matches',
];

/** Flattens class-validator output to one message per field. */
export function toFieldErrors(
  validationErrors: ClassValidatorError[],
  parent = '',
): FieldErrors {
  const errors: FieldErrors = {};

  for (const error of validationErrors) {
    const path = parent ? `${parent}.${error.property}` : error.property;

    if (error.constraints) {
      const constraints = error.constraints;
      const key =
        CONSTRAINT_PRIORITY.find((name) => name in constraints) ??
        Object.keys(constraints)[0];
      errors[path] = constraints[key];
    }
    if (error.children?.length) {
      Object.assign(errors, toFieldErrors(error.children, path));
    }
  }

  return errors;
}
