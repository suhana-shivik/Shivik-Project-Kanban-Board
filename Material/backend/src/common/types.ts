/**
 * Types shared by more than one feature. They live here rather than inside a
 * feature so `auth` does not have to import from `material` just to say
 * "Active" — a dependency that had no business existing.
 */

export type Status = 'Active' | 'Inactive';

/** A row of `departments` / `projects` — the two multi-select lookups. */
export interface Lookup {
  id: number;
  name: string;
  code: string | null;
  status: Status;
}

/** Just enough of a user to name them in someone else's "reporting to" list. */
export interface UserSummary {
  id: number;
  name: string;
  email: string;
  role: string;
}

/** Case-insensitive "contains", used by every ?query= filter. */
export function matches(value: string | null, search: string): boolean {
  return (value ?? '').toLowerCase().includes(search.toLowerCase());
}

export function sameText(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
