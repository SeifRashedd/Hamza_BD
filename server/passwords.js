import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

/** Hashes an envelope password with scrypt and a random salt: "scrypt$<salt>$<hash>". */
export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(plain.normalize('NFC'), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Exact (case-sensitive) comparison in constant time. */
export async function verifyPassword(plain, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(plain.normalize('NFC'), Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
