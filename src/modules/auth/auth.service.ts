import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { pool } from '../../db';
import { sha256 } from '../../utils/crypto';

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.accessTtlSeconds });
}

export async function issueTokens(userId: string) {
  const refreshToken = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 3600 * 1000);
  await pool.query(
    'INSERT INTO refresh_token (id_user, token_hash, expires_at) VALUES ($1,$2,$3)',
    [userId, sha256(refreshToken), expiresAt],
  );
  return {
    access_token: signAccessToken(userId),
    refresh_token: refreshToken,
    expires_in: config.accessTtlSeconds,
  };
}

export function maskTail(value: string): string {
  return '*'.repeat(Math.max(value.length - 4, 0)) + value.slice(-4);
}

export function publicUser(row: {
  id_user: string;
  username: string;
  nama_ktp: string;
  no_ktp_last4: string;
  no_rekening: string;
  id_role: string;
}) {
  return {
    id_user: row.id_user,
    username: row.username,
    nama_ktp: row.nama_ktp,
    no_ktp: '*'.repeat(12) + row.no_ktp_last4,
    no_rekening: maskTail(row.no_rekening),
    id_role: row.id_role,
  };
}
