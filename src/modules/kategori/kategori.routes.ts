import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { KATEGORI_REALOKASI } from '../../utils/constants';

export const kategoriRoutes = Router();

const querySchema = z.object({
  jenis: z.enum(['MASUK', 'KELUAR'], { message: 'jenis harus MASUK atau KELUAR' }).optional(),
});

kategoriRoutes.get('/', async (req, res) => {
  const { jenis } = querySchema.parse(req.query);
  const { rows } = await pool.query(
    `SELECT id_kategori, nama_kategori, jenis FROM kategori
     WHERE id_kategori <> ALL($1::text[]) AND ($2::jenis_transaksi IS NULL OR jenis = $2::jenis_transaksi)
     ORDER BY jenis, nama_kategori`,
    [KATEGORI_REALOKASI, jenis ?? null],
  );
  res.json({ data: rows });
});
