import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function encryptionKey(): Buffer {
  const material = env.SETTINGS_ENCRYPTION_KEY ?? env.ACCESS_TOKEN_SECRET;
  return Buffer.from(hkdfSync('sha256', material, 'gnomon-settings', 'secret-box-v1', 32));
}

/** Encrypts a short secret as `v1:<iv>:<tag>:<ciphertext>` (base64 parts). */
export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join(':');
}

/** Returns null when the value was sealed with a different key or is corrupt. */
export function openSecret(sealed: string): string | null {
  const [version, iv, tag, ciphertext] = sealed.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
