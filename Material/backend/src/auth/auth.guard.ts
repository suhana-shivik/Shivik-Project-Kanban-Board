import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '../common/errors';
import { Reflector } from '@nestjs/core';
import { authSecret } from './auth.config';
import { AuthenticatedRequest, IS_PUBLIC_KEY } from './auth.decorators';
import { RolePermissionsCache } from './role-permissions.cache';
import { bearerToken, InvalidTokenError, verifyToken } from './token';
import { AuthContextCache } from './auth-context.cache';

/**
 * Registered globally, so a new controller is protected by default and has to
 * opt out with @Public() rather than remember to opt in.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: RolePermissionsCache,
    private readonly accounts: AuthContextCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthenticatedError(
        'Missing bearer token. Call POST /api/auth/login first.',
      );
    }

    let payload: ReturnType<typeof verifyToken>;

    try {
      payload = verifyToken(token, authSecret());
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        throw new UnauthenticatedError(err.message);
      }
      throw err;
    }

    // the role on the token is only a snapshot of sign-in time. Reading it
    // back per request is what makes a role change, a deactivation or a
    // deleted account bite immediately instead of at the next login.
    const account = await this.accounts.get(payload.sub);

    if (!account) {
      throw new UnauthenticatedError('This account no longer exists');
    }
    if (account.status === 'Inactive') {
      throw new UnauthenticatedError('This account has been deactivated');
    }
    if (await this.permissions.isUnknownRole(account.role)) {
      throw new UnauthenticatedError(
        `Your role '${account.role}' no longer exists. Ask an admin to reassign you.`,
      );
    }

    // permissions come from the role's grid, so a toggle flipped on the Roles
    // screen applies to the very next call
    request.user = {
      id: payload.sub,
      email: account.email,
      name: account.name,
      role: account.role,
      permissions: await this.permissions.permissionsFor(account.role),
    };

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}
