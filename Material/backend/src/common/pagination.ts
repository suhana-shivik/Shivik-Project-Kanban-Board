import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ToInt } from './transforms';

/**
 * Opt-in paging, so it could be added without breaking anything already
 * calling these endpoints: send neither `page` nor `limit` and a list comes
 * back as a plain array exactly as before. Send either and it comes back
 * wrapped with the totals a "Show 10 ▾" footer needs.
 */
export class PaginationDto {
  @IsOptional()
  @ToInt()
  @IsInt({ message: 'page must be a whole number' })
  @Min(1, { message: 'page starts at 1' })
  page?: number;

  @IsOptional()
  @ToInt()
  @IsInt({ message: 'limit must be a whole number' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(200, { message: 'limit cannot be more than 200' })
  limit?: number;
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  /** Total pages, so a footer does not have to divide. */
  pages: number;
}

export function isPaginated(query: PaginationDto): boolean {
  return query.page !== undefined || query.limit !== undefined;
}

/**
 * Slices an already-fetched list. Every table here is small enough that the
 * database work is the same either way, and doing it in one place keeps the
 * filters and ordering in the SQL where they belong.
 */
export function paginate<T>(rows: T[], query: PaginationDto): Page<T> | T[] {
  if (!isPaginated(query)) return rows;

  const limit = query.limit ?? 10;
  const page = query.page ?? 1;
  const start = (page - 1) * limit;

  return {
    data: rows.slice(start, start + limit),
    total: rows.length,
    page,
    limit,
    pages: Math.max(1, Math.ceil(rows.length / limit)),
  };
}
