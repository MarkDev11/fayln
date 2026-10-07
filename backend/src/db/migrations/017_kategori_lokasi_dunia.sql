-- Kategori lokasi pada dunia: satu dunia memakai satu kategori.
--
-- ---------------------------------------------------------------------------
-- MENGAPA KOLOM INI ADA
-- ---------------------------------------------------------------------------
-- Sebelum ini, latar dunia dipungut SATU PER SATU dari master lokasi: admin
-- membuka daftar, memilih tempat, menekan "Tambahkan", lalu mengulanginya untuk
-- setiap tempat. Untuk dunia bergenre era — mis. "masa kini" — yang isinya
-- dua puluh tempat, itu dua puluh kali memilih hal yang sama.
--
-- Pemilik produk memintanya jadi satu pilihan: tentukan KATEGORI (era) dunia,
-- dan seluruh lokasi di kategori itu menjadi latarnya. Daftar latarnya karena
-- itu TURUNAN, bukan hasil memilih satu per satu.
--
-- Konsekuensinya penting dan disengaja: latarnya tidak lagi disunting per baris.
-- Keterangan disalin dari master, blur 30, titik fokus netral. Menyimpan langkah
-- ini MEMBANGUN ULANG daftarnya, sehingga lokasi yang ditambahkan ke kategori
-- setelahnya ikut masuk saat disimpan lagi — tanpa langkah "sinkronkan" yang
-- harus diingat admin.
--
-- ---------------------------------------------------------------------------
-- CATATAN pg-mem
-- ---------------------------------------------------------------------------
-- Kolom ditambah TANPA kunci asing, lalu kuncinya ditambahkan terpisah. Bentuk
-- `ADD COLUMN ... REFERENCES ...` tidak dipakai karena dukungannya tidak pasti,
-- sedangkan `ADD CONSTRAINT ... FOREIGN KEY` sudah terbukti dipakai migrasi
-- sebelumnya.
--
-- Kolomnya NULLABLE: draf yang sudah ada belum punya kategori, dan menolak
-- baris lama berarti membuat basis data produksi tidak dapat dimigrasikan.
--
-- ON DELETE RESTRICT mengikuti aturan yang sama dengan `world_assets
-- .master_category_id`: kategori yang masih dipakai sebuah dunia tidak boleh
-- dihapus diam-diam.

ALTER TABLE world_versions ADD COLUMN location_category_id text;

ALTER TABLE world_versions ADD CONSTRAINT world_versions_location_category_fk
  FOREIGN KEY (location_category_id) REFERENCES location_categories (category_id)
  ON DELETE RESTRICT;
