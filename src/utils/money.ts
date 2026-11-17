import { z } from 'zod';

/** Uang dihitung dalam sen (bigint) agar tidak ada kesalahan pembulatan float. */
export function toCents(s: string): bigint {
  const neg = s.startsWith('-');
  const t = neg ? s.slice(1) : s;
  const [i, f = ''] = t.split('.');
  const c = BigInt(i || '0') * 100n + BigInt((f + '00').slice(0, 2));
  return neg ? -c : c;
}

export function fromCents(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const s = `${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`;
  return neg ? '-' + s : s;
}

const asString = (v: unknown) => (typeof v === 'number' ? String(v) : v);

const base = (requiredMsg: string) =>
  z.preprocess(
    asString,
    z
      .string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
      .regex(/^\d{1,13}(\.\d{1,2})?$/, 'Nominal tidak valid, contoh: 250000.00'),
  );

/** Nominal > 0, dikirim sebagai string desimal ("250000.00"). */
export const moneyPositive = (requiredMsg = 'Jumlah wajib diisi') =>
  base(requiredMsg).refine((v) => toCents(v as string) > 0n, 'Jumlah harus lebih dari 0');

/** Nominal >= 0. */
export const moneyNonNegative = (requiredMsg = 'Nominal wajib diisi') => base(requiredMsg);
