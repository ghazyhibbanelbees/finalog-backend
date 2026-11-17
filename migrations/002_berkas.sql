-- Penyimpanan bukti belanja. Untuk tugas kuliah disimpan di database (bytea) agar deploy mudah.
-- Untuk produksi sungguhan, ganti ke object storage (S3, Cloudinary, dll).
CREATE TABLE berkas (
  nama       varchar(100) PRIMARY KEY,
  id_user    varchar(10) NOT NULL REFERENCES users(id_user),
  mime       varchar(50) NOT NULL,
  ukuran     int NOT NULL,
  data       bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_berkas_user ON berkas(id_user);
