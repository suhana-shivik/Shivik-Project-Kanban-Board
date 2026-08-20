import { RateLimitError } from '../common/errors';
import { CacheMetrics } from '../redis/cache.metrics';
import { FakeRedis } from '../redis/fake-redis';
import { RedisService } from '../redis/redis.service';
import { LoginThrottle } from './login-throttle';

describe('LoginThrottle', () => {
  let redis: FakeRedis;
  let throttle: LoginThrottle;

  const email = 'brute@gmail.com';

  beforeEach(() => {
    redis = new FakeRedis();
    throttle = new LoginThrottle(
      new RedisService(redis.asRedis(), redis.asRedis(), new CacheMetrics()),
    );

    process.env.REDIS_ENABLED = 'true';
    process.env.LOGIN_MAX_ATTEMPTS = '10';
    process.env.LOGIN_WINDOW_SECONDS = '900';
  });

  afterEach(() => {
    delete process.env.LOGIN_MAX_ATTEMPTS;
    delete process.env.LOGIN_WINDOW_SECONDS;
  });

  it('allows attempts up to the limit and refuses the one after', async () => {
    for (let i = 0; i < 10; i += 1) {
      await expect(throttle.assertAllowed(email)).resolves.toBeUndefined();
      await throttle.recordFailure(email);
    }

    await expect(throttle.assertAllowed(email)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('tells the caller when to come back', async () => {
    for (let i = 0; i < 10; i += 1) await throttle.recordFailure(email);

    await throttle.assertAllowed(email).catch((err: RateLimitError) => {
      expect(err.retryAfterSeconds).toBe(900);
    });
    expect.assertions(1);
  });

  it('sets the expiry on the first failure, in the same atomic step', async () => {
    await throttle.recordFailure(email);

    // one EVAL, not an INCR followed by a separate EXPIRE — if the process
    // died between two commands the key would never expire and the account
    // would be locked out for good
    expect(redis.calls.eval).toBe(1);
    await expect(
      redis.ttl(`ratelimit:login:${email}`),
    ).resolves.toBeGreaterThan(0);
  });

  it('keeps the original window instead of extending it on every failure', async () => {
    await throttle.recordFailure(email);
    const first = await redis.ttl(`ratelimit:login:${email}`);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await throttle.recordFailure(email);
    const second = await redis.ttl(`ratelimit:login:${email}`);

    // a sliding window would reset it to 900 and never let the caller out
    expect(second).toBeLessThan(first);
  });

  it('counts each email separately', async () => {
    for (let i = 0; i < 10; i += 1) await throttle.recordFailure(email);

    await expect(throttle.assertAllowed(email)).rejects.toBeInstanceOf(
      RateLimitError,
    );
    await expect(
      throttle.assertAllowed('someone.else@gmail.com'),
    ).resolves.toBeUndefined();
  });

  it('treats the email case-insensitively, so casing cannot dodge the limit', async () => {
    for (let i = 0; i < 10; i += 1)
      await throttle.recordFailure('Brute@Gmail.com');

    await expect(
      throttle.assertAllowed('brute@gmail.com'),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('clears the counter when the password is finally right', async () => {
    for (let i = 0; i < 9; i += 1) await throttle.recordFailure(email);
    await throttle.recordSuccess(email);

    await expect(throttle.assertAllowed(email)).resolves.toBeUndefined();
    expect(redis.store.has(`material:ratelimit:login:${email}`)).toBe(false);
  });

  it('lets logins through when Redis is down rather than locking everyone out', async () => {
    redis.goDown();

    await throttle.recordFailure(email);
    await throttle.recordFailure(email);
    // no limiting is the deliberate trade: the limiter is a mitigation, not
    // the only thing protecting an account
    await expect(throttle.assertAllowed(email)).resolves.toBeUndefined();
  });

  it('honours a configured limit', async () => {
    process.env.LOGIN_MAX_ATTEMPTS = '3';

    for (let i = 0; i < 3; i += 1) await throttle.recordFailure(email);
    await expect(throttle.assertAllowed(email)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});
