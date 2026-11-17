import { z } from 'zod';

/** Tanggal hari ini di WIB, format YYYY-MM-DD. */
export function todayWIB(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function isValidDate(v: string): boolean {
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const dateSchema = z
  .string({ required_error: 'Tanggal wajib diisi', invalid_type_error: 'Tanggal wajib diisi' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine(isValidDate, 'Tanggal tidak valid');

export const dateNotFuture = dateSchema.refine(
  (v) => v <= todayWIB(),
  'Tanggal tidak boleh di masa depan',
);
