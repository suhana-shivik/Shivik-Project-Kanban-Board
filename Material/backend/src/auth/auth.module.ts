import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthContextCache } from './auth-context.cache';
import { AuthService } from './auth.service';
import { LoginThrottle } from './login-throttle';
import { DepartmentsController } from './departments.controller';
import { DepartmentsRepository } from './departments.repository';
import { DepartmentsService } from './departments.service';
import { PermissionsGuard } from './permissions.guard';
import { RolePermissionsCache } from './role-permissions.cache';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [
    AuthController,
    UsersController,
    RolesController,
    DepartmentsController,
  ],
  providers: [
    AuthService,
    UsersService,
    UsersRepository,
    RolesService,
    RolesRepository,
    DepartmentsService,
    DepartmentsRepository,
    // shared by the guard and every write on the Roles screen
    RolePermissionsCache,
    // Redis-backed: the guard's per-request account read, and the login limiter
    AuthContextCache,
    LoginThrottle,
    // registration order is execution order: authenticate, then authorise.
    // Being APP_GUARDs, they cover every controller in the app — a route is
    // protected unless it opts out with @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [
    AuthService,
    UsersService,
    UsersRepository,
    RolesService,
    RolesRepository,
    DepartmentsService,
  ],
})
export class AuthModule {}
