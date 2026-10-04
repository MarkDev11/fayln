-- Penyimpanan berkas gambar yang diunggah lewat panel admin.
--
-- MENGAPA base64, BUKAN bytea — ini keputusan hasil pengukuran, bukan selera.
--
-- Seluruh pengujian backend berjalan di atas pg-mem (PostgreSQL in-memory).
-- Sebuah probe membuktikan pg-mem MERUSAK bytea secara SENYAP. Menyimpan
-- deretan byte header PNG:
--
--   masuk : 89 50 4e 47 0d 0a 1a 0a 00 ff fe
--   keluar: EF BF BD 50 4e 47 0d 0a 1a 0a 00 EF BF BD EF BF BD
--
-- Setiap byte yang bukan UTF-8 sah diganti U+FFFD (EF BF BD). Tanpa galat,
-- tanpa peringatan. Header PNG dan JPEG memang penuh byte semacam itu, jadi
-- SETIAP gambar yang disimpan akan rusak — sementara seluruh uji tetap hijau,
-- karena uji hanya membandingkan apa yang dikembalikan pg-mem, bukan apa yang
-- benar-benar tersimpan.
--
-- Kolom teks base64 berperilaku identik di pg-mem dan di PostgreSQL 17,
-- sehingga jalur yang diuji benar-benar jalur yang berjalan. Harganya 33%
-- ukuran; ditukar dengan hilangnya seluruh kelas kegagalan senyap itu.
-- Integritas isi tetap dapat diperiksa lewat `sha256` dan `byte_size`.
--
-- Ukuran maksimum 1 MiB ditegakkan di sini DAN di route: klien sudah
-- memperkecil gambar sebelum mengunggah, jadi batas ini adalah jaring terakhir.
CREATE TABLE media_blobs (
  -- SHA-256 heksadesimal dari isi berkas. Menjadi kunci utama supaya berkas
  -- yang sama tidak pernah disimpan dua kali: versi dunia bersifat tidak
  -- berubah, jadi menerbitkan ulang tanpa dedupe akan menggandakan setiap byte.
  media_id       text PRIMARY KEY,
  content_type   text NOT NULL,
  byte_size      integer NOT NULL,
  width          integer NOT NULL,
  height         integer NOT NULL,
  has_alpha      boolean NOT NULL DEFAULT false,
  content_base64 text NOT NULL,
  uploaded_by    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_blobs_type_check
    CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT media_blobs_size_check
    CHECK (byte_size > 0 AND byte_size <= 1048576),
  CONSTRAINT media_blobs_dims_check
    CHECK (width > 0 AND height > 0)
);
