import { Router } from 'express';
import { pool } from '../../db';
import { KATEGORI_REALOKASI } from '../../utils/constants';
import { todayWIB } from '../../utils/date';
import { fromCents, toCents } from '../../utils/money';

export const ringkasanRoutes = Router();

/**
 * Data layar Beranda untuk bulan berjalan (WIB).
 * Asumsi: saldo_kas_bulan_ini = total masuk - total keluar bulan ini.
 * Transaksi "Realokasi" (perpindahan antar dana oleh sistem) tidak dihitung.
 */
ringkasanRoutes.get('/', async (req, res) => {
  const bulanAwal = todayWIB().slice(0, 8) + '01';
  const sum = await pool.query(
    `SELECT
       COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'MASUK'), 0)  AS total_masuk,
       COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'KELUAR'), 0) AS total_keluar
     FROM transaksi
     WHERE id_user = $1
       AND tanggal >= $2::date AND tanggal < ($2::date + interval '1 month')
       AND id_kategori <> ALL($3::text[])`,
    [req.userId, bulanAwal, KATEGORI_REALOKASI],
  );
  const dana = await pool.query(
    'SELECT COALESCE(SUM(saldo), 0) AS total_saldo_dana FROM dana WHERE id_user = $1',
    [req.userId],
  );
  const masuk = toCents(String(sum.rows[0].total_masuk));
  const keluar = toCents(String(sum.rows[0].total_keluar));
  res.json({
    data: {
      bulan: bulanAwal.slice(0, 7),
      total_masuk: fromCents(masuk),
      total_keluar: fromCents(keluar),
      saldo_kas_bulan_ini: fromCents(masuk - keluar),
      total_saldo_dana: fromCents(toCents(String(dana.rows[0].total_saldo_dana))),
    },
  });
});
