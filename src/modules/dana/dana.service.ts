import { PoolClient } from 'pg';
import { AppError, notFound } from '../../utils/errors';
import { fromCents } from '../../utils/money';

/** Kunci baris dana milik user, diurutkan berdasarkan id supaya tidak terjadi deadlock. */
export async function lockDana(client: PoolClient, userId: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  for (const id of sorted) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM dana WHERE id_dana = $1 AND id_user = $2 FOR UPDATE',
      [id, userId],
    );
    if (!rowCount) throw notFound('Dana tidak ditemukan');
  }
}

/** Ubah saldo (dalam sen, bisa negatif). Ditolak jika saldo akan menjadi negatif. Panggil lockDana dulu. */
export async function applyDelta(client: PoolClient, userId: string, idDana: string, deltaCents: bigint) {
  if (deltaCents === 0n) return;
  const delta = fromCents(deltaCents);
  const { rowCount } = await client.query(
    `UPDATE dana SET saldo = saldo + $3::numeric
     WHERE id_dana = $1 AND id_user = $2 AND saldo + $3::numeric >= 0`,
    [idDana, userId, delta],
  );
  if (!rowCount) throw new AppError(422, 'SALDO_TIDAK_CUKUP', 'Saldo dana tidak mencukupi');
}
