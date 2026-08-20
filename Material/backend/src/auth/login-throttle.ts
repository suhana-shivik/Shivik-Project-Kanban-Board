import { Injectable, Logger } from '@nestjs/common';
import { RateLimitError } from '../common/errors';
import { CacheKey } from '../redis/cache.keys';
import { RedisService } from '../redis/redis.service';

/**
 * Brute-force protection on login, counted per email in Redis.
 *
 * The counter is incremented and expired **inside one Lua script**, not as an
 * INCR followed by an EXPIRE. Two commands leave a window where the process
 * dies in between, the key never gets a TTL, and that email is locked out
 * forever — a self-inflicted denial of service.
 *
 * Redis down means no limiting rather than no logins: the API stays usable,
 * and the limiter is a mitigation, not the only thing standing between an
 * attacker and an account.
 */
@Injectable()
export class LoginThrottle {
  private readonly logger = new Logger('LoginThrottle');

  constructor(private readonly redis: RedisService) {}

  private get maxAttempts(): number {
    const configured = Number(process.env.LOGIN_MAX_ATTEMPTS);
    return Number.isFinite(configured) && configured > 0 ? configured : 10;
  }

  private get windowSeconds(): number {
    const configured = Number(process.env.LOGIN_WINDOW_SECONDS);
    return Number.isFinite(configured) && configured > 0 ? configured : 900;
  }

  /** Throws once the window's budget is spent. Call before checking a password. */
  async assertAllowed(email: string): Promise<void> {
    const attempts = await this.redis.get<number>(
      CacheKey.loginAttempts(email),
    );

    if (attempts !== null && attempts >= this.maxAttempts) {
      throw new RateLimitError(
        'Too many failed sign-in attempts. Try again later.',
        this.windowSeconds,
      );
    }
  }

  /** One failure. The window starts at the first one and does not slide. */
  async recordFailure(email: string): Promise<void> {
    const result = await this.redis.incrementWithTtl(
      CacheKey.loginAttempts(email),
      this.windowSeconds,
    );

    if (result && result.count === this.maxAttempts) {
      this.logger.warn(
        `${email} hit ${result.count} failed sign-ins; locked for ${result.ttl}s`,
      );
    }
  }

  /** A correct password wipes the slate, so a typo streak is not punished. */
  async recordSuccess(email: string): Promise<void> {
    await this.redis.delete(CacheKey.loginAttempts(email));
  }
}
