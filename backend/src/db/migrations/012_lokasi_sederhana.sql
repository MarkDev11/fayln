-- Satu lokasi = satu gambar latar, satu kategori, satu keterangan.
--
-- ---------------------------------------------------------------------------
-- MENGAPA BENTUKNYA DISEDERHANAKAN
-- ---------------------------------------------------------------------------
-- `011_locations.sql` membuat `location_backgrounds` dengan satu gambar per
-- pasangan (lokasi, kategori), sehingga satu tempat dapat tampil di banyak era
-- dari satu baris master. Dalam pemakaian, bentuk itu lebih rumit daripada yang
-- dibutuhkan: yang diisi sehari-hari adalah satu tempat, satu era, satu gambar,
-- satu keterangan. Baris berulang hanya menambah satu pertanyaan yang harus
-- dijawab admin setiap kali ("era mana lagi yang mau saya isi?") tanpa ada yang
-- memakainya.
--
-- Karena itu `category_id`, `description`, dan `media_id` pindah ke `locations`
-- sendiri, dan `location_backgrounds` dibuang.
--
-- ---------------------------------------------------------------------------
-- PEMINDAHANNYA TIDAK MENJATUHKAN APA PUN
-- ---------------------------------------------------------------------------
-- Di bentuk baru, "Aula Kantor pada era dinasti" dan "Aula Kantor pada masa
-- kini" adalah DUA LOKASI — bukan satu lokasi dengan dua gambar. Jadi setiap
-- baris latar lama menjadi satu baris lokasi:
--
--   1. Lokasi yang sudah punya latar: salah satu latarnya mengisi baris yang
--      ADA, sehingga `location_id`-nya tidak berubah. Rujukan dari dunia
--      (`world_locations`, `world_assets.master_location_id`) tetap sahih.
--   2. Latar selebihnya pada lokasi yang sama menjadi baris lokasi BARU, dengan
--      id yang diturunkan dari pasangan lamanya supaya stabil dan terbaca.
--   3. Lokasi yang tidak punya satu pun latar dibuang: di bentuk baru ia tidak
--      dapat dirender maupun dipilih, jadi ia memang tidak pernah terpakai.
--
-- `DROP TABLE` di akhir karena itu AMAN: seluruh isinya sudah berpindah.
--
-- Catatan pg-mem: `UPDATE ... FROM` dan `INSERT ... SELECT` didukung, dan
-- sengaja dipakai alih-alih sub-kueri berkorelasi yang tidak didukungnya.
-- Kolom baru diberi NOT NULL lewat `DEFAULT ''` lebih dulu, karena itu satu-
-- satunya bentuk yang diterima pg-mem maupun PostgreSQL sungguhan.

ALTER TABLE locations ADD COLUMN category_id text;
ALTER TABLE locations ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN media_id    text NOT NULL DEFAULT '';

-- 1. Latar yang ada mengisi baris lokasinya. Bila sebuah lokasi punya lebih
--    dari satu latar, yang menang tidak ditentukan — dan itu tidak masalah,
--    karena langkah 2 akan memunculkan sisanya sebagai lokasi tersendiri.
UPDATE locations SET
  category_id = bg.category_id,
  description = bg.description,
  media_id    = bg.media_id
FROM location_backgrounds bg
WHERE bg.location_id = locations.location_id;

-- 2. Latar selebihnya menjadi lokasi baru. Baris yang sudah terpakai langkah 1
--    dikenali dari kategorinya yang sama persis, jadi ia tidak terduplikasi.
INSERT INTO locations (location_id, name, category_id, description, media_id, position)
SELECT l.location_id || '_' || b.category_id,
       l.name,
       b.category_id,
       b.description,
       b.media_id,
       l.position
FROM location_backgrounds b
JOIN locations l ON l.location_id = b.location_id
WHERE b.category_id <> l.category_id;

-- 3. Lokasi tanpa latar tidak dapat dipakai di bentuk baru.
DELETE FROM locations WHERE media_id = '';

ALTER TABLE locations ADD CONSTRAINT locations_category_fk
  FOREIGN KEY (category_id) REFERENCES location_categories (category_id) ON DELETE RESTRICT;

ALTER TABLE locations ADD CONSTRAINT locations_media_fk
  FOREIGN KEY (media_id) REFERENCES media_blobs (media_id);

-- Bentuk id kategori diperiksa di repository, bukan `CHECK`, karena pg-mem
-- tidak mengenal `~` maupun `length()` — dan `CHECK` seperti itu membuat
-- MIGRASI GAGAL, bukan sekadar tidak menegakkan apa pun.
--
-- `SET NOT NULL`, bukan `CHECK (category_id IS NOT NULL)`: pg-mem menolak
-- bentuk kedua walaupun tabelnya kosong ("violated by some row"), dan yang
-- pertama memang yang dimaksud.
ALTER TABLE locations ALTER COLUMN category_id SET NOT NULL;

DROP TABLE location_backgrounds;
