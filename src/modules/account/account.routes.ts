import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, withTx } from '../../db';
import { AppError, notFound } from '../../utils/errors';
import { newId } from '../../utils/id';
import { issueTokens, publicUser } from '../auth/auth.service';

export const accountRoutes = Router();

accountRoutes.get('/me', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id_user, username, nama_ktp, no_ktp_last4, no_rekening, id_role
     FROM users WHERE id_user = $1`,
    [req.userId],
  );
  if (!rows[0]) throw notFound();
  res.json({ data: publicUser(rows[0]) });
});

const passwordSchema = z.object({
  password_lama: z.string().min(1, 'Password lama wajib diisi'),
  password_baru: z.string().min(8, 'Password minimal 8 karakter').max(72, 'Password maksimal 72 karakter'),
});

accountRoutes.patch('/me/password', async (req, res) => {
  const body = passwordSchema.parse(req.body);
  const { rows } = await pool.query('SELECT password FROM users WHERE id_user = $1', [req.userId]);
  if (!rows[0]) throw notFound();
  if (!(await bcrypt.compare(body.password_lama, rows[0].password))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Password lama salah', {
      password_lama: 'Password lama salah',
    });
  }
  const newHash = await bcrypt.hash(body.password_baru, 10);
  await withTx(async (c) => {
    await c.query('UPDATE users SET password = $2 WHERE id_user = $1', [req.userId, newHash]);
    await c.query('UPDATE refresh_token SET revoked_at = now() WHERE id_user = $1 AND revoked_at IS NULL', [
      req.userId,
    ]);
  });
  // Sesi saat ini tetap hidup lewat token baru; sesi lain sudah dicabut
  const tokens = await issueTokens(req.userId!);
  res.json({ data: tokens });
});

const deviceSchema = z.object({
  push_token: z.string().min(1, 'push_token wajib diisi'),
  platform: z.enum(['android', 'ios'], { message: 'platform harus android atau ios' }),
});

accountRoutes.post('/devices', async (req, res) => {
  const body = deviceSchema.parse(req.body);
  await pool.query(
    `INSERT INTO perangkat (id_perangkat, id_user, push_token, platform)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (push_token) DO UPDATE SET id_user = EXCLUDED.id_user, platform = EXCLUDED.platform`,
    [newId(10), req.userId, body.push_token, body.platform],
  );
  res.status(204).end();
});
