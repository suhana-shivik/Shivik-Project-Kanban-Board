import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../common/errors';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedRequest,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from './auth.decorators';
import { Permission, Role } from './roles';

/**
 * Runs after AuthGuard, so request.user is already populated. A route with no
 * @RequirePermissions is treated as "any signed-in user".
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const allowedRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length && !allowedRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // AuthGuard already rejected anonymous requests; this only fires if the
    // guards are ever registered out of order
    if (!user) throw new ForbiddenError('Not authenticated');

    if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
      throw this.deny(user.role, `role ${allowedRoles.join(' or ')}`);
    }

    const missing = (required ?? []).filter(
      (permission) => !user.permissions.includes(permission),
    );

    if (missing.length) {
      throw this.deny(user.role, missing.join(', '));
    }

    return true;
  }

  /** Names what was missing — otherwise a 403 is a guessing game. */
  private deny(role: Role, needed: string): ForbiddenError {
    return new ForbiddenError(
      `Your role '${role}' is not allowed to perform this action`,
      { requiredPermissions: needed, role },
    );
  }
}
