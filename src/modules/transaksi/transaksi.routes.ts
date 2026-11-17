import { Router } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTx } from '../../db';
import { KATEGORI_REALOKASI } from '../../utils/constants';
import { dateNotFuture, dateSchema } from '../../utils/date';
import { AppError, forbidden, notFound } from '../../utils/errors';
import { newId } from '../../utils/id';
import { fromCents, moneyPositive, toCents } from '../../utils/money';
import { applyDelta, lockDana } from '../dana/dana.service';

export const transaksiRoutes = Router();

const COLS = `id_transaksi, id_user, id_kategori, id_dana, id_bank, jenis, jumlah, tanggal,
  keterangan, bukti_belanja, created_at,
  (jenis = 'KELUAR' AND id_bank IS NOT NULL AND bukti_belanja IS NULL) AS tanpa_bukti`;

const validationError = (field: string, msg: string) =>
  new AppError(422, 'VALIDATION_FAILED', 'Data tidak valid', { [field]: msg });

/** MASUK menambah saldo, KELUAR mengurangi. Hasil dalam sen. */
const signed = (jenis: string, jumlah: string): bigint =>
  jenis === 'MASUK' ? toCents(jumlah) : -toCents(jumlah);

async function checkKategori(c: PoolClient, idKategori: string, jenis: string) {
  if (KATEGORI_REALOKASI.includes(idKategori)) {
    throw validationError('id_kategori', 'Kategori ini hanya dipakai oleh sistem');
  }
  const { rows } = await c.query('SELECT jenis FROM kategori WHERE id_kategori = $1', [idKategori]);
  if (!rows[0]) throw validationError('id_kategori', 'Kategori tidak ditemukan');
  if (rows[0].jenis !== jenis) {
    throw validationError('id_kategori', 'Jenis kategori tidak sesuai dengan jenis transaksi');
  }
}

async function checkBank(c: PoolClient, userId: string, idBank: string) {
  const { rowCount } = await c.query(
    `SELECT 1 FROM bank_komunitas k
     WHERE k.id_bank = $1 AND (k.id_pemilik = $2 OR EXISTS (
       SELECT 1 FROM anggota_bank a WHERE a.id_bank = k.id_bank AND a.id_user = $2 AND a.status = 'AKTIF'))`,
    [idBank, userId],
  );
  if (!rowCount) throw forbidden('Anda bukan pemilik atau anggota bank komunitas ini');
}

async function checkBukti(c: PoolClient, userId: string, nama: string) {
  const { rowCount } = await c.query('SELECT 1 FROM berkas WHERE nama = $1 AND id_user = $2', [nama, userId]);
  if (!rowCount) throw validationError('bukti_belanja', 'Berkas bukti belanja tidak ditemukan, unggah dulu');
}

const optStr = (max: number, msg: string) => z.string().trim().min(1).max(max, msg);

const createSchema = z.object({
  jenis: z.enum(['MASUK', 'KELUAR'], { message: 'Jenis harus MASUK atau KELUAR' }),
  id_kategori: z.string({ required_error: 'Kategori wajib dipilih' }).min(1, 'Kategori wajib dipilih'),
  jumlah: moneyPositive(),
  tanggal: dateNotFuture,
  keterangan: z.string().trim().max(200, 'Keterangan maksimal 200 karakter').nullish(),
  id_dana: z.string().min(1).nullish(),
  id_bank: z.string().min(1).nullish(),
  bukti_belanja: optStr(100, 'Nama berkas terlalu panjang').nullish(),
});

transaksiRoutes.post('/', async (req, res) => {
  const b = createSchema.parse(req.body);
  const userId = req.userId!;
  const jumlah = fromCents(toCents(b.jumlah));
  const row = await withTx(async (c) => {
    await checkKategori(c, b.id_kategori, b.jenis);
    if (b.id_bank) await checkBank(c, userId, b.id_bank);
    if (b.bukti_belanja) await checkBukti(c, userId, b.bukti_belanja);
    if (b.id_dana) {
      await lockDana(c, userId, [b.id_dana]);
      await applyDelta(c, userId, b.id_dana, signed(b.jenis, jumlah));
    }
    const { rows } = await c.query(
      `INSERT INTO transaksi (id_transaksi, id_user, id_kategori, id_dana, id_bank, jenis, jumlah,
                              tanggal, keterangan, bukti_belanja)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${COLS}`,
      [
        newId(12), userId, b.id_kategori, b.id_dana ?? null, b.id_bank ?? null, b.jenis, jumlah,
        b.tanggal, b.keterangan || null, b.bukti_belanja ?? null,
      ],
    );
    return rows[0];
  });
  res.status(201).json({ data: row });
});

const listSchema = z.object({
  jenis: z.enum(['MASUK', 'KELUAR'], { message: 'jenis harus MASUK atau KELUAR' }).optional(),
  id_kategori: z.string().min(1).optional(),
  id_dana: z.string().min(1).optional(),
  dari: dateSchema.optional(),
  sampai: dateSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

transaksiRoutes.get('/', async (req, res) => {
  const q = listSchema.parse(req.query);
  const where: string[] = ['id_user = $1'];
  const params: unknown[] = [req.userId];
  const add = (cond: string, v: unknown) => {
    params.push(v);
    where.push(cond.replace('?', `$${params.length}`));
  };
  if (q.jenis) add('jenis = ?', q.jenis);
  if (q.id_kategori) add('id_kategori = ?', q.id_kategori);
  if (q.id_dana) add('id_dana = ?', q.id_dana);
  if (q.dari) add('tanggal >= ?::date', q.dari);
  if (q.sampai) add('tanggal <= ?::date', q.sampai);
  if (q.cursor) {
    const [tgl, id] = Buffer.from(q.cursor, 'base64url').toString().split('|');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl ?? '') || !id) throw validationError('cursor', 'Cursor tidak valid');
    params.push(tgl, id);
    where.push(`(tanggal, id_transaksi) < ($${params.length - 1}::date, $${params.length})`);
  }
  params.push(q.limit + 1);
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM transaksi WHERE ${where.join(' AND ')}
     ORDER BY tanggal DESC, id_transaksi DESC LIMIT $${params.length}`,
    params,
  );
  const hasMore = rows.length > q.limit;
  const data = hasMore ? rows.slice(0, q.limit) : rows;
  const last = data[data.length - 1];
  const next_cursor =
    hasMore && last ? Buffer.from(`${last.tanggal}|${last.id_transaksi}`).toString('base64url') : null;
  res.json({ data, meta: { next_cursor } });
});

transaksiRoutes.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM transaksi WHERE id_transaksi = $1 AND id_user = $2`,
    [String(req.params.id), req.userId],
  );
  if (!rows[0]) throw notFound('Transaksi tidak ditemukan');
  res.json({ data: rows[0] });
});

const patchSchema = z
  .object({
    id_kategori: z.string().min(1, 'Kategori wajib dipilih').optional(),
    jumlah: moneyPositive().optional(),
    tanggal: dateNotFuture.optional(),
    keterangan: z.string().trim().max(200, 'Keterangan maksimal 200 karakter').nullish(),
    id_dana: z.string().min(1).nullish(),
    bukti_belanja: optStr(100, 'Nama berkas terlalu panjang').nullish(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Tidak ada data yang diubah');

/** Ubah transaksi: efek lama dibalik, efek baru diterapkan, selisih per dana dihitung sekali. */
transaksiRoutes.patch('/:id', async (req, res) => {
  const id = String(req.params.id);
  const b = patchSchema.parse(req.body);
  const userId = req.userId!;
  const row = await withTx(async (c) => {
    const { rows } = await c.query(
      'SELECT * FROM transaksi WHERE id_transaksi = $1 AND id_user = $2 FOR UPDATE',
      [id, userId],
    );
    const old = rows[0];
    if (!old) throw notFound('Transaksi tidak ditemukan');
    if (KATEGORI_REALOKASI.includes(old.id_kategori)) throw forbidden('Transaksi sistem tidak dapat diubah');
    const rep = await c.query('SELECT 1 FROM laporan_penarikan WHERE id_transaksi = $1', [id]);
    if (rep.rowCount) {
      throw new AppError(409, 'TRANSAKSI_DILAPORKAN', 'Transaksi yang sudah dilaporkan tidak dapat diubah');
    }

    const next = {
      id_kategori: b.id_kategori ?? old.id_kategori,
      jumlah: b.jumlah ? fromCents(toCents(b.jumlah)) : old.jumlah,
      tanggal: b.tanggal ?? old.tanggal,
      keterangan: b.keterangan !== undefined ? b.keterangan || null : old.keterangan,
      id_dana: b.id_dana !== undefined ? b.id_dana : old.id_dana,
      bukti_belanja: b.bukti_belanja !== undefined ? b.bukti_belanja : old.bukti_belanja,
    };

    if (b.id_kategori) await checkKategori(c, next.id_kategori, old.jenis);
    if (b.bukti_belanja) await checkBukti(c, userId, b.bukti_belanja);

    // Selisih saldo per dana
    const deltas = new Map<string, bigint>();
    const add = (idDana: string | null, d: bigint) => {
      if (idDana) deltas.set(idDana, (deltas.get(idDana) ?? 0n) + d);
    };
    add(old.id_dana, -signed(old.jenis, old.jumlah));
    add(next.id_dana, signed(old.jenis, next.jumlah));
    const ids = [...deltas.keys()];
    await lockDana(c, userId, ids);
    for (const idDana of ids.sort()) await applyDelta(c, userId, idDana, deltas.get(idDana)!);

    const upd = await c.query(
      `UPDATE transaksi SET id_kategori=$2, jumlah=$3, tanggal=$4, keterangan=$5, id_dana=$6, bukti_belanja=$7
       WHERE id_transaksi = $1 RETURNING ${COLS}`,
      [id, next.id_kategori, next.jumlah, next.tanggal, next.keterangan, next.id_dana, next.bukti_belanja],
    );
    return upd.rows[0];
  });
  res.json({ data: row });
});

transaksiRoutes.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const userId = req.userId!;
  await withTx(async (c) => {
    const { rows } = await c.query(
      'SELECT * FROM transaksi WHERE id_transaksi = $1 AND id_user = $2 FOR UPDATE',
      [id, userId],
    );
    const old = rows[0];
    if (!old) throw notFound('Transaksi tidak ditemukan');
    if (KATEGORI_REALOKASI.includes(old.id_kategori)) throw forbidden('Transaksi sistem tidak dapat dihapus');
    const rep = await c.query('SELECT 1 FROM laporan_penarikan WHERE id_transaksi = $1', [id]);
    if (rep.rowCount) {
      throw new AppError(409, 'TRANSAKSI_DILAPORKAN', 'Transaksi yang sudah dilaporkan tidak dapat dihapus');
    }
    if (old.id_dana) {
      await lockDana(c, userId, [old.id_dana]);
      await applyDelta(c, userId, old.id_dana, -signed(old.jenis, old.jumlah));
    }
    await c.query('DELETE FROM transaksi WHERE id_transaksi = $1', [id]);
  });
  res.status(204).end();
});
