/**
 * Every Redis key the app uses, in one place. Building keys by hand at each
 * call site is how you end up with a typo that silently caches nothing, or two
 * features quietly sharing a key.
 *
 * The `material:` prefix is added by the client, so these are the part after it.
 */
export const CacheKey = {
  /** slug -> the role's permission strings. */
  rolePermissions: 'perm:roles',

  /** user id -> { role, status, email, name }, read by the guard per request. */
  authContext: (userId: number) => `auth:user:${userId}`,

  /** The two dropdown lists behind the user form. */
  lookups: 'lookup:form',

  /** The module catalogue behind ADD PERMISSION. */
  modules: 'lookup:modules',

  /** Failed logins per email, for the brute-force limiter. */
  loginAttempts: (email: string) => `ratelimit:login:${email.toLowerCase()}`,

  /**
   * The materials list. The filters are part of the key, so `?status=Active`
   * and `?categoryId=1` are cached separately — which is why a write has to
   * clear the whole family rather than one key.
   */
  materialList: (fingerprint: string) => `list:materials:${fingerprint}`,
  materialListPattern: 'list:materials:*',
} as const;

/**
 * Turns a query DTO into a stable key fragment: same filters in any property
 * order produce the same string, so two identical requests share a cache entry.
 */
export function fingerprint(query: Record<string, unknown>): string {
  const parts = Object.entries(query)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`);

  return parts.length ? parts.join('&') : 'all';
}

/**
 * Pub/sub channel. One instance writes a role, every instance drops its local
 * copy — without this, a second instance would serve stale permissions until
 * its TTL ran out.
 */
export const CacheChannel = {
  invalidate: 'cache:invalidate',
} as const;

/** Seconds. Short enough that a missed invalidation self-heals quickly. */
export const CacheTtl = {
  rolePermissions: 300,
  authContext: 30,
  lookups: 120,
  modules: 300,
  /** Short: materials change often, and a write invalidates it anyway. */
  materialList: 60,
} as const;
