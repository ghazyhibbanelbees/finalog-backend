import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { config } from '../config';

const encKey = Buffer.from(config.dataKey, 'hex');
const hashKey = createHash('sha256').update('hash:' + config.dataKey).digest();

/** AES-256-GCM. Format: iv.tag.ciphertext (base64) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Hash deterministik untuk cek keunikan KTP tanpa menyimpan nomor asli. */
export function hmac(value: string): string {
  return createHmac('sha256', hashKey).update(value).digest('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
