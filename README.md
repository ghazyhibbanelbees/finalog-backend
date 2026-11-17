# FINALOG (Financial Note & Alerts)

FINALOG adalah aplikasi pencatatan kas dan keuangan yang ditujukan bagi penyelenggara acara serta pedagang kecil hingga menengah. Repository ini berisi bagian backend dari aplikasi tersebut.

Perlu diketahui bahwa FINALOG hanya berfungsi sebagai alat pencatatan. Aplikasi tidak terhubung dengan layanan perbankan dan tidak memindahkan uang secara nyata. Seluruh saldo hanya berupa data di dalam database.

## Fitur yang telah tersedia
- Pendaftaran akun dan login
- Pengelolaan kategori transaksi
- Pengelolaan dana (pemisahan uang berdasarkan keperluan) dan transfer antar dana
- Pencatatan uang masuk dan uang keluar, dengan saldo dana yang diperbarui secara otomatis
- Unggah bukti belanja
- Ringkasan bulanan untuk halaman beranda

## Fitur yang akan dikembangkan
- Pengingat kas dan utang
- Bank komunitas
- Group chat

## Teknologi
Node.js, TypeScript, Express, dan PostgreSQL.

## Cara menjalankan
1. Pasang Node.js dan PostgreSQL, kemudian buat database kosong dengan nama `finalog`.
2. Salin berkas `.env.example` menjadi `.env`, lalu isi `DATABASE_URL`, `JWT_SECRET`, dan `DATA_KEY`.
3. Jalankan perintah berikut pada terminal:

       npm install
       npm run migrate
       npm run dev

4. Buka `http://localhost:3000/health`. Apabila muncul `{"status":"ok"}`, server telah berjalan dengan baik.

Seluruh nominal uang dikirim dan diterima dalam bentuk teks desimal, misalnya "150000.00".
