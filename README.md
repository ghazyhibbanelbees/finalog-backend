# FINALOG Backend (tahap 1 + tahap 2)

Node.js + TypeScript + Express + PostgreSQL.

## Cara menjalankan
1. Buat database kosong `finalog` di pgAdmin.
2. Buka file `.env`, ganti `PASSWORD_POSTGRES_KAMU` dengan password user `postgres`.
3. Di terminal VS Code (folder ini):
   ```
   npm install
   npm run migrate
   npm run dev
   ```
4. Cek http://localhost:3000/health -> {"status":"ok"}

## Isi
- Tahap 1: register, login, refresh, logout, /me, ubah password, /devices
- Tahap 2: kategori, dana, transfer, transaksi (efek saldo), unggah bukti, ringkasan
- Migrasi: migrations/001_init.sql (skema lengkap), migrations/002_berkas.sql (bukti belanja)

## Catatan
- Nominal uang dikirim/diterima sebagai teks desimal ("150000.00").
- Jangan commit file `.env` (sudah ada di .gitignore). Untuk deploy, buat JWT_SECRET dan DATA_KEY baru.
