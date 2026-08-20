import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * scrypt from node's crypto — no native build step, and strong enough that a
 * leaked db.json does not hand over the passwords.
 *
 * Stored format: `scrypt$<salt hex>$<derived key hex>`.
 */

const PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(plain, salt, KEY_LENGTH).toString('hex');
  return `${PREFIX}$${salt}$${key}`;
}

/**
 * Accepts a plaintext record too, so a db.json written before hashing existed
 * still logs in. Those get upgraded on the next successful login.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!isHashed(stored)) {
    return stored === plain;
  }

  const [, salt, key] = stored.split('$');
  const expected = Buffer.from(key, 'hex');
  const actual = scryptSync(plain, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isHashed(stored: string): boolean {
  return stored.startsWith(`${PREFIX}$`) && stored.split('$').length === 3;
}
