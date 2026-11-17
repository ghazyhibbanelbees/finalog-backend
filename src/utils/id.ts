import { randomBytes } from 'crypto';

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** ID acak. Pakai 10 untuk varchar(10), 12 untuk transaksi/pesan. */
export function newId(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
