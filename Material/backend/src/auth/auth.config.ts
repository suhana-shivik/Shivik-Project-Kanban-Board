import { Logger } from '@nestjs/common';

/** Signing key and lifetime for the login tokens, read once per call. */

const DEV_SECRET = 'material-master-dev-secret-change-me';

/** Anything shorter than this is trivially brute-forced offline. */
const MIN_SECRET_LENGTH = 32;

export function isProduction(): boolean {
  return (process.env.NODE_ENV ?? 'development') === 'production';
}

export function authSecret(): string {
  return process.env.AUTH_SECRET || DEV_SECRET;
}

/** Defaults to 8 hours — a working day, so a demo session never expires. */
export function tokenTtlSeconds(): number {
  const configured = Number(process.env.AUTH_TOKEN_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : 8 * 3600;
}

/**
 * Called once at boot. A weak signing key means anyone can mint a token for
 * any role, so in production this refuses to start rather than logging a
 * warning nobody reads. In development it only warns, so a fresh clone runs.
 */
export function assertAuthSecretIsSafe(): void {
  const logger = new Logger('Auth');
  const secret = process.env.AUTH_SECRET ?? '';

  const problem =
    !secret || secret === DEV_SECRET
      ? 'AUTH_SECRET is unset or still the bundled development value'
      : secret.length < MIN_SECRET_LENGTH
        ? `AUTH_SECRET is only ${secret.length} characters; use at least ${MIN_SECRET_LENGTH}`
        : null;

  if (!problem) return;

  if (isProduction()) {
    throw new Error(
      `${problem}. Refusing to start: every login token is signed with it. ` +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }

  logger.warn(`${problem} — fine for local work, fatal in production.`);
}
