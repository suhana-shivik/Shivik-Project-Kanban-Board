import { createHmac, timingSafeEqual } from 'crypto';
import type { Role } from './roles';

/**
 * A JWT (HS256) built on node's crypto, so the project keeps its current
 * dependency list. The wire format is the standard three dot-separated
 * base64url segments, so jwt.io and any client library can read it.
 */

export interface TokenPayload {
  /** User id. */
  sub: number;
  email: string;
  name: string;
  role: Role;
  /** Seconds since the epoch. */
  iat: number;
  exp: number;
}

export class InvalidTokenError extends Error {}

const HEADER = base64url(
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
);

export function signToken(
  claims: Omit<TokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
): { token: string; expiresAt: string; expiresIn: number } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;

  const body = base64url(Buffer.from(JSON.stringify({ ...claims, iat, exp })));
  const signed = `${HEADER}.${body}`;

  return {
    token: `${signed}.${sign(signed, secret)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    expiresIn: ttlSeconds,
  };
}

export function verifyToken(token: string, secret: string): TokenPayload {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new InvalidTokenError('Malformed token');
  }

  const [header, body, signature] = segments;
  if (!equals(signature, sign(`${header}.${body}`, secret))) {
    throw new InvalidTokenError('Token signature is invalid');
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as TokenPayload;
  } catch {
    throw new InvalidTokenError('Malformed token');
  }

  if (
    typeof payload.exp !== 'number' ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new InvalidTokenError('Token has expired');
  }

  return payload;
}

/** Pulls the credential out of `Authorization: Bearer <token>`. */
export function bearerToken(header?: string): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

function sign(input: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(input).digest());
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/** Constant-time compare so a bad signature leaks no timing information. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
