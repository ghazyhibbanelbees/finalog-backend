-- FINALOG: skema lengkap (modul Keuangan + Group Chat)
-- Aturan BR-06: tidak ada FK antara tabel chat dan tabel keuangan. Titik temu hanya "users".

CREATE TYPE jenis_transaksi     AS ENUM ('MASUK','KELUAR');
CREATE TYPE status_utang        AS ENUM ('BELUM_LUNAS','LUNAS');
CREATE TYPE jenis_pengingat     AS ENUM ('KAS','UTANG');
CREATE TYPE status_pengingat    AS ENUM ('TERJADWAL','TERKIRIM');
CREATE TYPE status_anggota_bank AS ENUM ('MENUNGGU','AKTIF','DITOLAK');
CREATE TYPE status_laporan      AS ENUM ('DIAJUKAN','DITINDAK');
CREATE TYPE peran_grup          AS ENUM ('ADMIN','ANGGOTA');
CREATE TYPE status_anggota_grup AS ENUM ('UNDANGAN','AKTIF');

-- ===== Inti & akun =====
CREATE TABLE role (
  id_role   varchar(20) PRIMARY KEY,
  nama_role varchar(30) NOT NULL
);

CREATE TABLE users (
  id_user            varchar(10) PRIMARY KEY,
  username           varchar(30) NOT NULL,
  password           varchar(255) NOT NULL,
  nama_ktp           varchar(50) NOT NULL,
  -- no_ktp disimpan terenkripsi; hash dipakai untuk cek unik; last4 untuk masking
  no_ktp_enc         text NOT NULL,
  no_ktp_hash        char(64) NOT NULL,
  no_ktp_last4       char(4) NOT NULL,
  no_rekening        varchar(20) NOT NULL CHECK (no_rekening ~ '^[0-9]+$'),
  id_role            varchar(20) NOT NULL REFERENCES role(id_role),
  failed_login_count int NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_username_key UNIQUE (username),
  CONSTRAINT users_no_ktp_hash_key UNIQUE (no_ktp_hash)
);

CREATE TABLE refresh_token (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_user    varchar(10) NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX idx_refresh_user ON refresh_token(id_user);

CREATE TABLE perangkat (
  id_perangkat varchar(10) PRIMARY KEY,
  id_user      varchar(10) NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
  push_token   text NOT NULL UNIQUE,
  platform     varchar(10) NOT NULL
);

CREATE TABLE notifikasi (
  id_notifikasi varchar(12) PRIMARY KEY,
  id_user       varchar(10) NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
  tipe          varchar(30) NOT NULL,
  judul         varchar(100) NOT NULL,
  isi           text NOT NULL,
  dibaca        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifikasi_user ON notifikasi(id_user, created_at DESC);

-- ===== Modul Keuangan =====
-- Perbaikan celah: kategori diberi kolom jenis (MASUK/KELUAR).
CREATE TABLE kategori (
  id_kategori   varchar(10) PRIMARY KEY,
  nama_kategori varchar(30) NOT NULL,
  jenis         jenis_transaksi NOT NULL
);

CREATE TABLE dana (
  id_user   varchar(10) NOT NULL REFERENCES users(id_user),
  id_dana   varchar(10) PRIMARY KEY,
  nama_dana varchar(50) NOT NULL,
  saldo     numeric(15,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  target    numeric(15,2) CHECK (target IS NULL OR target > 0)
);
CREATE INDEX idx_dana_user ON dana(id_user);

CREATE TABLE bank_komunitas (
  id_bank    varchar(10) PRIMARY KEY,
  id_pemilik varchar(10) NOT NULL REFERENCES users(id_user),
  nama_bank  varchar(50) NOT NULL
);

CREATE TABLE anggota_bank (
  id_anggota_bank   varchar(10) PRIMARY KEY,
  id_bank           varchar(10) NOT NULL REFERENCES bank_komunitas(id_bank),
  id_user           varchar(10) NOT NULL REFERENCES users(id_user),
  status            status_anggota_bank NOT NULL DEFAULT 'MENUNGGU',
  tanggal_bergabung date,
  UNIQUE (id_bank, id_user)
);

CREATE TABLE transaksi (
  id_transaksi  varchar(12) PRIMARY KEY,
  id_user       varchar(10) NOT NULL REFERENCES users(id_user),
  id_kategori   varchar(10) NOT NULL REFERENCES kategori(id_kategori),
  id_dana       varchar(10) REFERENCES dana(id_dana),
  id_bank       varchar(10) REFERENCES bank_komunitas(id_bank),
  jenis         jenis_transaksi NOT NULL,
  jumlah        numeric(15,2) NOT NULL CHECK (jumlah > 0),
  tanggal       date NOT NULL,        -- "tidak boleh di masa depan" divalidasi di aplikasi
  keterangan    varchar(200),
  bukti_belanja varchar(100),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transaksi_user ON transaksi(id_user, tanggal DESC);
CREATE INDEX idx_transaksi_bank ON transaksi(id_bank, tanggal DESC);

CREATE TABLE utang (
  id_utang          varchar(10) PRIMARY KEY,
  id_user           varchar(10) NOT NULL REFERENCES users(id_user),
  id_dana_realokasi varchar(10) REFERENCES dana(id_dana),  -- dana tujuan
  id_dana_sumber    varchar(10) REFERENCES dana(id_dana),  -- usulan: dana yang diambil
  pihak             varchar(50) NOT NULL,
  jumlah            numeric(15,2) NOT NULL CHECK (jumlah > 0),
  tenggat           date NOT NULL,
  status            status_utang NOT NULL DEFAULT 'BELUM_LUNAS',
  realokasi_at      timestamptz
);
CREATE INDEX idx_utang_job ON utang(status, tenggat);

CREATE TABLE pengingat (
  id_pengingat varchar(10) PRIMARY KEY,
  id_user      varchar(10) NOT NULL REFERENCES users(id_user),
  id_utang     varchar(10) REFERENCES utang(id_utang) ON DELETE CASCADE,
  jenis        jenis_pengingat NOT NULL,
  judul        varchar(50) NOT NULL,
  waktu_ingat  timestamptz NOT NULL,
  status       status_pengingat NOT NULL DEFAULT 'TERJADWAL',
  CHECK (jenis <> 'UTANG' OR id_utang IS NOT NULL)
);
CREATE INDEX idx_pengingat_job ON pengingat(status, waktu_ingat);

CREATE TABLE laporan_penarikan (
  id_laporan   varchar(10) PRIMARY KEY,
  id_bank      varchar(10) NOT NULL REFERENCES bank_komunitas(id_bank),
  id_transaksi varchar(12) NOT NULL UNIQUE REFERENCES transaksi(id_transaksi),
  id_pelapor   varchar(10) NOT NULL REFERENCES users(id_user),
  alasan       varchar(200) NOT NULL,
  tanggal      date NOT NULL DEFAULT current_date,
  status       status_laporan NOT NULL DEFAULT 'DIAJUKAN'
);

-- ===== Modul Group Chat (hanya berelasi ke users) =====
CREATE TABLE grup (
  id_grup        varchar(10) PRIMARY KEY,
  nama_grup      varchar(50) NOT NULL CHECK (char_length(nama_grup) >= 1),
  deskripsi      varchar(200),
  tanggal_dibuat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE anggota_grup (
  id_anggota_grup   varchar(10) PRIMARY KEY,
  id_grup           varchar(10) NOT NULL REFERENCES grup(id_grup) ON DELETE CASCADE,
  id_user           varchar(10) NOT NULL REFERENCES users(id_user),
  peran             peran_grup NOT NULL DEFAULT 'ANGGOTA',
  status            status_anggota_grup NOT NULL DEFAULT 'UNDANGAN',
  tanggal_bergabung timestamptz,
  terakhir_dibaca   varchar(12),   -- id_pesan terakhir yang dibaca (hitung belum_dibaca)
  UNIQUE (id_grup, id_user)
);
CREATE INDEX idx_anggota_grup_user ON anggota_grup(id_user, status);

CREATE TABLE pesan (
  id_pesan      varchar(12) PRIMARY KEY,
  id_grup       varchar(10) NOT NULL REFERENCES grup(id_grup) ON DELETE CASCADE,
  id_user       varchar(10) NOT NULL REFERENCES users(id_user),
  isi_pesan     text NOT NULL CHECK (char_length(isi_pesan) BETWEEN 1 AND 1000),
  waktu_kirim   timestamptz NOT NULL DEFAULT now(),
  status        varchar(10) NOT NULL DEFAULT 'TERKIRIM',
  client_msg_id varchar(40),
  UNIQUE (id_user, client_msg_id)
);
CREATE INDEX idx_pesan_riwayat ON pesan(id_grup, waktu_kirim DESC, id_pesan DESC);

-- ===== Seed =====
INSERT INTO role VALUES ('PEMILIK_REKENING','Pemilik Rekening');

INSERT INTO kategori (id_kategori, nama_kategori, jenis) VALUES
  ('KAT-001','Konsumsi','KELUAR'),
  ('KAT-002','Transportasi','KELUAR'),
  ('KAT-003','Perlengkapan','KELUAR'),
  ('KAT-004','Lainnya','KELUAR'),
  ('KAT-005','Realokasi','KELUAR'),
  ('KAT-006','Penjualan','MASUK'),
  ('KAT-007','Iuran','MASUK'),
  ('KAT-008','Lainnya','MASUK'),
  ('KAT-009','Realokasi','MASUK');
