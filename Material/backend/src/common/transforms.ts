import { Transform, TransformFnParams } from 'class-transformer';

/** Strips surrounding whitespace so " Cement " and "Cement" are the same value. */
export const Trim = () =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Query strings arrive as "true"/"false"; without this @IsBoolean rejects them. */
export const ToBoolean = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  });

/** Query strings arrive as text; leaves junk untouched so @IsInt reports it. */
export const ToInt = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (value === '' || value === null || value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : value;
  });

/**
 * The multi-selects (projects, departments, managers) have to survive both a
 * JSON body and a multipart form, where every value is a string. Accepts a
 * real array, a repeated field, `1,2,3`, and `[1,2,3]`; leaves anything it
 * cannot read as-is so @IsInt({ each: true }) reports it.
 */
export const ToIntArray = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (value === '' || value === null || value === undefined) return undefined;

    let items: unknown[];

    if (Array.isArray(value)) {
      items = value;
    } else if (typeof value === 'string') {
      const text = value.trim();

      if (text.startsWith('[')) {
        try {
          const parsed: unknown = JSON.parse(text);
          items = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value;
        }
      } else {
        items = text.split(',');
      }
    } else {
      items = [value];
    }

    const numbers = items
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter((item) => item !== '')
      .map((item) => Number(item));

    // one bad entry keeps the original so the validator can name the field
    return numbers.every(Number.isInteger) ? [...new Set(numbers)] : value;
  });
