import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config';
import { pool } from '../../db';
import { encrypt, hmac, sha256 } from '../../utils/crypto';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/id';
import { issueTokens, publicUser } from './auth.service';

export const authRoutes = Router();

authRoutes.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan, coba lagi nanti' } },
  }),
);

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username minimal 3 karakter')
    .max(30, 'Username maksimal 30 karakter')
    .regex(/^[A-Za-z0-9_.]+$/, 'Username hanya boleh huruf, angka, titik, dan underscore'),
  password: z.string().min(8, 'Password minimal 8 karakter').max(72, 'Password maksimal 72 karakter'),
  nama_ktp: z.string().trim().min(1, 'Nama sesuai KTP wajib diisi').max(50, 'Nama maksimal 50 karakter'),
  no_ktp: z.string().regex(/^\d{16}$/, 'Nomor KTP harus 16 digit angka'),
  no_rekening: z.string().regex(/^\d{1,20}$/, 'Nomor rekening hanya angka, maksimal 20 digit'),
});

authRoutes.post('/register', async (req, res) => {
  const body = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, 10);
  const id = newId(10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (id_user, username, password, nama_ktp, no_ktp_enc, no_ktp_hash,
                          no_ktp_last4, no_rekening, id_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PEMILIK_REKENING')
       RETURNING id_user, username, nama_ktp, no_ktp_last4, no_rekening, id_role`,
      [
        id,
        body.username,
        passwordHash,
        body.nama_ktp,
        encrypt(body.no_ktp),
        hmac(body.no_ktp),
        body.no_ktp.slice(-4),
        body.no_rekening,
      ],
    );
    res.status(201).json({ data: publicUser(rows[0]) });
  } catch (e: any) {
    if (e?.code === '23505') {
      if (e.constraint === 'users_username_key')
        throw new AppError(409, 'USERNAME_TAKEN', 'Username sudah dipakai', {
          username: 'Username sudah dipakai',
        });
      if (e.constraint === 'users_no_ktp_hash_key')
        throw new AppError(409, 'KTP_TAKEN', 'Nomor KTP sudah terdaftar', {
          no_ktp: 'Nomor KTP sudah terdaftar',
        });
    }
    throw e;
  }
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

const invalidCredentials = () =>
  new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Username atau password salah');

// Hash palsu agar waktu respons tidak membocorkan apakah username ada
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

authRoutes.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(429, 'AUTH_LOCKED', 'Terlalu banyak percobaan login, coba lagi beberapa menit lagi');
  }

  const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      const failed = user.failed_login_count + 1;
      const lock = failed >= config.maxFailedLogin;
      await pool.query(
        `UPDATE users SET failed_login_count = $2,
                locked_until = CASE WHEN $3::boolean THEN now() + make_interval(mins => $4::int) ELSE locked_until END
         WHERE id_user = $1`,
        [user.id_user, lock ? 0 : failed, lock, config.lockMinutes],
      );
    }
    throw invalidCredentials();
  }

  await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id_user = $1', [
    user.id_user,
  ]);
  const tokens = await issueTokens(user.id_user);
  res.json({ data: { ...tokens, user: publicUser(user) } });
});

const refreshSchema = z.object({ refresh_token: z.string().min(1, 'refresh_token wajib diisi') });

authRoutes.post('/refresh', async (req, res) => {
  const { refresh_token } = refreshSchema.parse(req.body);
  // Satu query atomik: cabut token lama hanya jika masih valid
  const { rows } = await pool.query(
    `UPDATE refresh_token SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id_user`,
    [sha256(refresh_token)],
  );
  if (!rows[0]) throw new AppError(401, 'AUTH_TOKEN_EXPIRED', 'Sesi berakhir, silakan login ulang');
  const tokens = await issueTokens(rows[0].id_user);
  res.json({ data: tokens });
});

authRoutes.post('/logout', async (req, res) => {
  const { refresh_token } = refreshSchema.parse(req.body);
  await pool.query('UPDATE refresh_token SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    sha256(refresh_token),
  ]);
  res.status(204).end();
});
