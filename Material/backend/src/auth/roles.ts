/**
 * The permission *vocabulary*. Which role holds which of these no longer lives
 * here — that moved into the `roles` / `role_permissions` tables so the
 * "Roles & Permissions" screen can edit it. This file only fixes the names, so
 * a controller can keep saying @RequirePermissions('material:create') and a
 * typo is still a compile error.
 */

/** A role is now whatever slug the database holds. */
export type Role = string;

/**
 * The four toggle columns in the grid. `write` is the create column — the UI
 * calls it WRITE, the permission string calls it `create`.
 */
export const ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Maps a `role_permissions` column to the action half of a permission. The
 * keys are camelCase because that is how Kysely's CamelCasePlugin hands the
 * row back — `can_write` in PostgreSQL, `canWrite` in TypeScript.
 */
export const COLUMN_ACTIONS = {
  canRead: 'read',
  canWrite: 'create',
  canUpdate: 'update',
  canDelete: 'delete',
} as const satisfies Record<string, Action>;

export type PermissionColumn = keyof typeof COLUMN_ACTIONS;

/**
 * Every module the grid can switch on. Kept in step with the `modules` table
 * seeded in schema.sql — this list is what makes the permission strings
 * type-safe, the table is what the UI renders.
 */
export const MODULE_KEYS = [
  'category',
  'subcategory',
  'material',
  'user',
  'role',
  'department',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type Permission = `${ModuleKey}:${Action}`;

export const PERMISSIONS: readonly Permission[] = MODULE_KEYS.flatMap(
  (module) => ACTIONS.map((action): Permission => `${module}:${action}`),
);

/** `['can_read', true]` on the `material` module becomes `material:read`. */
export function permissionOf(module: string, action: Action): Permission {
  return `${module}:${action}` as Permission;
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Turns a display name into the slug the JWT carries:
 * "Site Engineer" -> "site_engineer".
 */
export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The role that cannot be deleted, or nobody could grant permissions again. */
export const SYSTEM_ROLE_SLUG = 'admin';

/** The swatches on "IDENTIFY WITH COLOR". Any valid hex is accepted too. */
export const ROLE_COLORS = [
  '#00C875',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F59E0B',
  '#F97316',
  '#06B6D4',
  '#84CC16',
  '#6B7280',
] as const;

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
