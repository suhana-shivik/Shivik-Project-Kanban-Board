import { Injectable } from '@nestjs/common';
import { Status } from '../common/types';
import { CacheKey, CacheTtl } from '../redis/cache.keys';
import { RedisService } from '../redis/redis.service';
import { Role } from './roles';
import { UsersRepository } from './users.repository';

export interface AuthContext {
  role: Role;
  status: Status;
  email: string;
  name: string;
}

/**
 * The guard reads the signed-in account's *current* role and status on every
 * request — that is what makes a role change or a deactivation bite
 * immediately rather than at the next login. Doing that against PostgreSQL
 * cost one indexed lookup per request; this moves it to Redis.
 *
 * The TTL is deliberately short (30s). Every write that could change the
 * answer invalidates the key explicitly, so the TTL is only a safety net for
 * a missed invalidation — not the mechanism.
 *
 * Redis down means every request goes to PostgreSQL exactly as it did before.
 */
@Injectable()
export class AuthContextCache {
  constructor(
    private readonly users: UsersRepository,
    private readonly redis: RedisService,
  ) {}

  async get(userId: number): Promise<AuthContext | null> {
    const key = CacheKey.authContext(userId);

    const cached = await this.redis.get<AuthContext>(key);
    if (cached) return cached;

    const fresh = await this.users.findAuthContext(userId);
    // a deleted account is not cached: the miss is cheap and caching a null
    // would keep answering for a user that no longer exists
    if (!fresh) return null;

    await this.redis.set(key, fresh, CacheTtl.authContext);
    return fresh;
  }

  /**
   * Call after the write commits. Anything that changes a user's role, status
   * or identity has to land here, or that user keeps their old access for up
   * to one TTL.
   */
  async invalidate(userId: number): Promise<void> {
    await this.redis.invalidate(CacheKey.authContext(userId));
  }
}
