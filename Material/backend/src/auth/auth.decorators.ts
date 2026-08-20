import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Permission, Role } from './roles';

/** What the guard hangs off the request once the token checks out. */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  permissions: readonly Permission[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const IS_PUBLIC_KEY = 'auth:public';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ROLES_KEY = 'auth:roles';

/** Opts a route out of authentication entirely (login, health, dashboard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * The normal way to protect a route. Every listed permission must be held —
 * routes that touch two resources (e.g. category + sub-category) say so.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Escape hatch for the rare check that is about identity rather than
 * capability. Prefer RequirePermissions.
 */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** `@CurrentUser() user: AuthUser` — or `@CurrentUser('id') id: number`. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return field ? request.user?.[field] : request.user;
  },
);
