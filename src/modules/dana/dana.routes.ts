import { Router } from 'express';
import { z } from 'zod';
import { pool, withTx } from '../../db';
import { AppError, notFound } from '../../utils/errors';
import { newId } from '../../utils/id';
import { moneyNonNegative, moneyPositive, toCents } from '../../utils/money';
import { applyDelta, lockDana } from './dana.service';

export const danaRoutes = Router();

const COLS = `id_dana, nama_dana, saldo, target,
  CASE WHEN target IS NOT NULL THEN round(saldo / target * 100, 1) END AS persen_target`;

const validationError = (field: string, msg: string) =>
  new AppError(422, 'VALIDATION_FAILED', 'Data tidak valid', { [field]: msg });

function present(row: any) {
  return { ...row, persen_target: row.persen_target === null ? null : Number(row.persen_target) };
}

danaRoutes.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM dana WHERE id_user = $1 ORDER BY nama_dana, id_dana`,
    [req.userId],
  );
  res.json({ data: rows.map(present) });
});

const createSchema = z.object({
  nama_dana: z
    .string({ required_error: 'Nama dana wajib diisi', invalid_type_error: 'Nama dana wajib diisi' })
    .trim()
    .min(1, 'Nama dana wajib diisi')
    .max(50, 'Nama dana maksimal 50 karakter'),
  saldo_awal: moneyNonNegative().optional(),
  target: moneyPositive('Target tidak valid').nullish(),
});

danaRoutes.post('/', async (req, res) => {
  const b = createSchema.parse(req.body);
  const { rows } = await pool.query(
    `INSERT INTO dana (id_dana, id_user, nama_dana, saldo, target)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`,
    [newId(10), req.userId, b.nama_dana, b.saldo_awal ?? '0', b.target ?? null],
  );
  res.status(201).json({ data: present(rows[0]) });
});

const patchSchema = z
  .object({
    nama_dana: z.string().trim().min(1, 'Nama dana wajib diisi').max(50, 'Nama dana maksimal 50 karakter').optional(),
    target: moneyPositive('Target tidak valid').nullish(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Tidak ada data yang diubah');

danaRoutes.patch('/:id', async (req, res) => {
  const id = String(req.params.id);
  const b = patchSchema.parse(req.body);
  const sets: string[] = [];
  const params: unknown[] = [id, req.userId];
  if (b.nama_dana !== undefined) {
    params.push(b.nama_dana);
    sets.push(`nama_dana = $${params.length}`);
  }
  if (b.target !== undefined) {
    params.push(b.target);
    sets.push(`target = $${params.length}`);
  }
  const { rows } = await pool.query(
    `UPDATE dana SET ${sets.join(', ')} WHERE id_dana = $1 AND id_user = $2 RETURNING ${COLS}`,
    params,
  );
  if (!rows[0]) throw notFound('Dana tidak ditemukan');
  res.json({ data: present(rows[0]) });
});

const transferSchema = z.object({
  dari: z.string({ required_error: 'Dana asal wajib diisi' }).min(1, 'Dana asal wajib diisi'),
  ke: z.string({ required_error: 'Dana tujuan wajib diisi' }).min(1, 'Dana tujuan wajib diisi'),
  jumlah: moneyPositive(),
});

danaRoutes.post('/transfer', async (req, res) => {
  const b = transferSchema.parse(req.body);
  if (b.dari === b.ke) throw validationError('ke', 'Dana tujuan harus berbeda dari dana asal');
  const userId = req.userId!;
  const cents = toCents(b.jumlah);
  const result = await withTx(async (c) => {
    await lockDana(c, userId, [b.dari, b.ke]);
    await applyDelta(c, userId, b.dari, -cents);
    await applyDelta(c, userId, b.ke, cents);
    const { rows } = await c.query(`SELECT ${COLS} FROM dana WHERE id_dana = ANY($1)`, [[b.dari, b.ke]]);
    const byId = new Map(rows.map((r: any) => [r.id_dana, present(r)]));
    return { dari: byId.get(b.dari), ke: byId.get(b.ke) };
  });
  res.json({ data: result });
});

danaRoutes.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  await withTx(async (c) => {
    await lockDana(c, req.userId!, [id]);
    const { rows } = await c.query('SELECT saldo FROM dana WHERE id_dana = $1', [id]);
    if (toCents(rows[0].saldo) > 0n) {
      throw new AppError(409, 'DANA_MASIH_ADA_SALDO', 'Dana tidak bisa dihapus karena saldonya masih ada');
    }
    try {
      await c.query('DELETE FROM dana WHERE id_dana = $1', [id]);
    } catch (e: any) {
      if (e?.code === '23503') {
        throw new AppError(409, 'DANA_DIPAKAI', 'Dana tidak bisa dihapus karena masih dipakai transaksi atau utang');
      }
      throw e;
    }
  });
  res.status(204).end();
});
