import { Injectable, OnModuleInit } from '@nestjs/common';
import { CacheKey, CacheTtl } from '../redis/cache.keys';
import { RedisService } from '../redis/redis.service';
import { Permission } from './roles';
import { RolesRepository } from './roles.repository';

type PermissionMap = Record<string, Permission[]>;

/**
 * The role→permission map, cached in two layers:
 *
 * 1. **In-process** — the guard reads this on every request, so it must not
 *    cost a network hop.
 * 2. **Redis** — so a fresh instance does not have to rebuild from PostgreSQL,
 *    and so the invalidation can reach instances that are not the one handling
 *    the write.
 *
 * `invalidate()` clears both and publishes to every other instance. That
 * pub/sub message is what makes the "flip a toggle, it applies on the next
 * request" behaviour hold when the app runs on more than one process — with
 * a purely local cache the other instances would serve stale permissions.
 */
@Injectable()
export class RolePermissionsCache implements OnModuleInit {
  private local?: PermissionMap;
  /** Concurrent misses share one rebuild instead of stampeding the database. */
  private loading?: Promise<PermissionMap>;

  constructor(
    private readonly roles: RolesRepository,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    // another instance changed a role: drop the local copy so the next read
    // rebuilds. The Redis copy was already deleted by whoever published.
    this.redis.onInvalidate((keys) => {
      if (keys.includes(CacheKey.rolePermissions)) this.dropLocal();
    });
  }

  async permissionsFor(slug: string): Promise<readonly Permission[]> {
    return (await this.map())[slug] ?? [];
  }

  /** True when the slug is not a role at all, as opposed to one with none. */
  async isUnknownRole(slug: string): Promise<boolean> {
    return !(slug in (await this.map()));
  }

  /** Called by every write on the Roles screen. */
  async invalidate(): Promise<void> {
    this.dropLocal();
    await this.redis.invalidate(CacheKey.rolePermissions);
  }

  private dropLocal(): void {
    this.local = undefined;
    this.loading = undefined;
  }

  private async map(): Promise<PermissionMap> {
    if (this.local) return this.local;

    this.loading ??= this.load().then((map) => {
      this.local = map;
      this.loading = undefined;
      return map;
    });

    return this.loading;
  }

  private async load(): Promise<PermissionMap> {
    // a Map does not survive JSON, so the cached shape is a plain object
    return this.redis.remember(
      CacheKey.rolePermissions,
      CacheTtl.rolePermissions,
      async () => Object.fromEntries(await this.roles.permissionMap()),
    );
  }
}
