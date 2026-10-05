-- Master lokasi: kategori (era/setting), lokasi, dan latar belakangnya.
--
-- ---------------------------------------------------------------------------
-- MENGAPA TIGA TABEL, BUKAN SATU
-- ---------------------------------------------------------------------------
-- Sebelum ini "lokasi" hanya ada di dalam satu versi dunia (`world_locations`,
-- label saja) dan "latar belakang" hanya ada di dalam satu versi dunia
-- (`world_assets` kind='background', gambar saja). Akibatnya tempat yang sama
-- pada dua cerita berarti mengunggah gambar yang sama dua kali — persis masalah
-- yang sudah diselesaikan master karakter.
--
-- Yang dipindahkan ke sini adalah bagian yang TIDAK khas satu cerita:
--
--   `location_categories` — SETTING/ERA. "fantasy", "masa kini", "masa lalu",
--   "era dinasti". Daftarnya adalah DATA, bukan `CHECK` di skema, dengan alasan
--   yang sama seperti `genres`: kategori baru tidak boleh menuntut migrasi.
--
--   `locations` — TEMPATNYA. "Sekolah", "Aula Kantor", "Hutan Utara". Nama
--   tempat tidak khas satu cerita.
--
--   `location_backgrounds` — GAMBARNYA, satu baris per pasangan
--   (lokasi, kategori). Inilah yang membuat satu tempat dapat tampil di banyak
--   era tanpa mengunggah ulang.
--
-- Yang khas satu cerita (keterangan yang dibaca mesin cerita, kekuatan blur,
-- titik fokus, peluang kemunculan) SENGAJA tetap tinggal di `world_assets`:
-- hal itu berbeda di tiap cerita, dan menaruhnya di master akan membuat satu
-- dunia menyunting dunia lain.
--
-- ---------------------------------------------------------------------------
-- KEPUTUSAN YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
-- ---------------------------------------------------------------------------
-- 1. GAMBAR WAJIB. `media_id NOT NULL` + kunci asing ke `media_blobs`.
--    Latar tanpa gambar tidak dapat dirender, dan mesin cerita dapat memilihnya.
--    Repository membuang baris tanpa gambar SEBELUM sampai ke sini, jadi
--    constraint ini adalah jaring pengaman, bukan satu-satunya penjaga.
--
-- 2. SATU GAMBAR PER (LOKASI, KATEGORI). Kunci utamanya adalah pasangan itu.
--    "Sekolah pada era dinasti" adalah satu gambar, bukan daftar. Bila kelak
--    satu tempat perlu beberapa gambar pada era yang sama (mis. siang/malam),
--    yang ditambahkan adalah kolom varian pada kunci utama — bukan tabel baru.
--
-- 3. MENGHAPUS KATEGORI YANG MASIH DIPAKAI DITOLAK (`ON DELETE RESTRICT`).
--    Sama seperti genre: kategori yang tidak diinginkan tidak dihapus, tetapi
--    gambar-gambarnya dibuang lebih dulu. Menghapus kategori akan memutus
--    gambar di SEMUA lokasi sekaligus, dan itu terlalu mudah terjadi.
--
-- 4. HANYA OPERATOR YANG DIKENAL pg-mem DI DALAM `CHECK`. pg-mem tidak mengenal
--    `~`, `length()`, maupun `btrim()`, dan `CHECK` yang memakainya membuat
--    MIGRASI GAGAL — bukan sekadar tidak menegakkan apa pun. Karena itu bentuk
--    id diperiksa di repository, bukan di sini.
--
-- ---------------------------------------------------------------------------
-- TAUTAN DARI SISI DUNIA
-- ---------------------------------------------------------------------------
-- `world_assets` mendapat `master_location_id` dan `master_category_id` supaya
-- sebuah dunia tahu latar itu datang dari mana. Keduanya NULL untuk aset yang
-- diunggah sebelum master ini ada, dan itu memang benar: aset lama tidak
-- berasal dari master mana pun.
--
-- PERINGATAN: `CatalogAdminRepository.copyVersionInto()` menyalin `world_assets`
-- dengan DAFTAR KOLOM TETAP. Kedua kolom ini WAJIB ada di daftar itu, kalau
-- tidak setiap penyuntingan dunia akan menghapus tautannya tanpa suara.

CREATE TABLE IF NOT EXISTS location_categories (
  category_id text PRIMARY KEY,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_categories_position_check CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS location_categories_position_idx
  ON location_categories (position ASC, category_id ASC);

CREATE TABLE IF NOT EXISTS locations (
  location_id text PRIMARY KEY,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_position_check CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS locations_position_idx
  ON locations (position ASC, location_id ASC);

CREATE TABLE IF NOT EXISTS location_backgrounds (
  location_id          text NOT NULL,
  category_id          text NOT NULL,
  media_id             text NOT NULL,
  description          text NOT NULL DEFAULT '',
  usage_note           text NOT NULL DEFAULT '',
  encounter_likelihood text,
  blur_strength        smallint NOT NULL DEFAULT 0,
  focal_x              double precision NOT NULL DEFAULT 0.5,
  focal_y              double precision NOT NULL DEFAULT 0.5,
  width                integer,
  height               integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, category_id),
  CONSTRAINT location_backgrounds_location_fk
    FOREIGN KEY (location_id) REFERENCES locations (location_id) ON DELETE CASCADE,
  CONSTRAINT location_backgrounds_category_fk
    FOREIGN KEY (category_id) REFERENCES location_categories (category_id) ON DELETE RESTRICT,
  CONSTRAINT location_backgrounds_media_fk
    FOREIGN KEY (media_id) REFERENCES media_blobs (media_id),
  CONSTRAINT location_backgrounds_likelihood_check
    CHECK (encounter_likelihood IS NULL
           OR encounter_likelihood IN ('none', 'low', 'medium', 'high')),
  CONSTRAINT location_backgrounds_blur_check
    CHECK (blur_strength >= 0 AND blur_strength <= 100),
  CONSTRAINT location_backgrounds_focal_check
    CHECK (focal_x >= 0 AND focal_x <= 1 AND focal_y >= 0 AND focal_y <= 1)
);

-- "Latar ini dipakai berapa dunia" dihitung lewat indeks ini.
CREATE INDEX IF NOT EXISTS location_backgrounds_media_idx
  ON location_backgrounds (media_id);

-- Tautan dari sisi dunia. NULL = aset lama yang bukan berasal dari master.
ALTER TABLE world_assets ADD COLUMN master_location_id text;
ALTER TABLE world_assets ADD COLUMN master_category_id text;

-- Jaring pengaman terakhir: lokasi atau kategori yang masih dipakai sebuah dunia
-- tidak dapat dihapus, sekalipun pemeriksaan di repository terlewat. `RESTRICT`
-- dipilih, bukan `CASCADE`: menghapus master tidak boleh menghapus isi cerita
-- orang lain.
ALTER TABLE world_assets ADD CONSTRAINT world_assets_master_location_fk
  FOREIGN KEY (master_location_id) REFERENCES locations (location_id) ON DELETE RESTRICT;
ALTER TABLE world_assets ADD CONSTRAINT world_assets_master_category_fk
  FOREIGN KEY (master_category_id) REFERENCES location_categories (category_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS world_assets_master_location_idx
  ON world_assets (master_location_id);
