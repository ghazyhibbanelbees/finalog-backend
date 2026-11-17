import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { pool } from '../../db';
import { AppError, notFound } from '../../utils/errors';
import { newId } from '../../utils/id';

export const uploadsRoutes = Router();

const MAX_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

/** Deteksi tipe dari isi berkas (bukan dari nama/header yang bisa dipalsukan). */
function detectType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 4 && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

function runUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('berkas')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran berkas maksimal 5 MB' : 'Berkas tidak valid';
      return next(new AppError(422, 'VALIDATION_FAILED', msg, { berkas: msg }));
    }
    if (err) return next(err);
    next();
  });
}

uploadsRoutes.post('/bukti', runUpload, async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Berkas wajib diunggah', {
      berkas: 'Kirim berkas pada field "berkas" (multipart/form-data)',
    });
  }
  const type = detectType(file.buffer);
  if (!type) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Tipe berkas harus JPG, PNG, atau PDF', {
      berkas: 'Tipe berkas harus JPG, PNG, atau PDF',
    });
  }
  const nama = `${newId(12)}.${type.ext}`;
  await pool.query(
    'INSERT INTO berkas (nama, id_user, mime, ukuran, data) VALUES ($1,$2,$3,$4,$5)',
    [nama, req.userId, type.mime, file.size, file.buffer],
  );
  res.status(201).json({ data: { bukti_belanja: nama, mime: type.mime, ukuran: file.size } });
});

/** Boleh diunduh oleh pengunggah, atau pemilik bank yang punya transaksi dengan bukti ini. */
uploadsRoutes.get('/bukti/:nama', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.mime, b.data FROM berkas b
     WHERE b.nama = $1 AND (b.id_user = $2 OR EXISTS (
       SELECT 1 FROM transaksi t JOIN bank_komunitas k ON k.id_bank = t.id_bank
       WHERE t.bukti_belanja = b.nama AND k.id_pemilik = $2))`,
    [String(req.params.nama), req.userId],
  );
  if (!rows[0]) throw notFound('Berkas tidak ditemukan');
  res.set('Content-Type', rows[0].mime);
  res.set('Content-Disposition', 'inline');
  res.send(rows[0].data);
});
