-- ---------------------------------------------------------------------------
-- 009: genre menjadi DATA, bukan daftar yang ditulis di kode
-- ---------------------------------------------------------------------------
--
-- Sebelum ini, daftar genre hidup di TIGA tempat yang harus dijaga bersamaan:
-- konstanta `GENRES` di `contracts/types.ts`, `CHECK` di `world_genres`, dan
-- kunci terjemahan di aplikasi pemain. Menambah satu genre berarti menyunting
-- ketiganya — dan bila satu terlewat, kegagalannya senyap: `CHECK` menolak
-- simpanan tanpa pesan yang berguna, atau pemain melihat label yang salah.
--
-- Sekarang genre adalah tabel. Admin dapat menambah, mengubah, menonaktifkan,
-- dan menghapusnya dari panel, dan satu-satunya sumber kebenaran adalah baris di
-- tabel ini.
--
-- ---------------------------------------------------------------------------
-- MENGAPA `world_genres.genre` MENJADI FOREIGN KEY, BUKAN TETAP `CHECK`
-- ---------------------------------------------------------------------------
-- `CHECK (genre IN (...))` mengunci daftarnya ke dalam skema. Setiap genre baru
-- menuntut migrasi baru — dan itu berarti admin TIDAK dapat mengelola genre,
-- hanya pengembang yang dapat. Foreign key memindahkan kuncinya ke data, dan
-- sekaligus memberi perilaku yang diinginkan saat menghapus:
--
--   INSERT genre yang tidak ada      -> DITOLAK database
--   DELETE genre yang masih dipakai  -> DITOLAK database
--
-- Jadi panel tidak perlu (dan tidak boleh) menjadi satu-satunya penjaga.
-- Sudah dibuktikan terhadap pg-mem: `ALTER TABLE ... DROP CONSTRAINT` dan
-- `ADD CONSTRAINT ... FOREIGN KEY` keduanya didukung, dan penegakannya bekerja
-- dua arah.
--
-- `ON DELETE RESTRICT` (bawaan) disengaja: genre yang masih dipakai dunia mana
-- pun tidak boleh lenyap dan meninggalkan dunia tanpa genre. Panel menawarkan
-- "nonaktifkan" untuk itu — genre nonaktif tidak lagi ditawarkan di formulir,
-- tetapi dunia lama yang memakainya tetap utuh.
--
-- ---------------------------------------------------------------------------
-- BATAS `CHECK` DI SINI SENGAJA SEDERHANA
-- ---------------------------------------------------------------------------
-- Bentuk `genre_id` (huruf kecil, garis bawah) TIDAK ditegakkan `CHECK`, dan
-- itu bukan kelalaian. pg-mem — yang menjalankan seluruh uji — tidak mengenal
-- operator `~` maupun fungsi `length()`/`btrim()`, jadi `CHECK` yang memakainya
-- membuat MIGRASI GAGAL, bukan sekadar tidak menegakkan apa pun:
--
--   CHECK (genre_id ~ '^[a-z][a-z0-9_]{1,31}$')  -> "operator does not exist: text ~ text"
--   CHECK (length(btrim(label_id)) > 0)          -> "function length(text) does not exist"
--
-- Karena itu `CHECK` di sini hanya memakai perbandingan angka dan `NOT NULL` —
-- bentuk yang sudah terbukti jalan di migrasi 001..008. Aturan bentuk `genre_id`
-- ditegakkan di repositori (`genresRepository`), tempat ia juga dapat
-- mengembalikan pesan yang menjelaskan KENAPA sebuah id ditolak — sesuatu yang
-- tidak dapat dilakukan `CHECK` mana pun.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS genres (
  genre_id   text PRIMARY KEY,
  -- Label disimpan di sini, bukan hanya sebagai kunci terjemahan di klien.
  -- Genre buatan admin tidak akan pernah punya kunci terjemahan, jadi server
  -- harus dapat menyebut namanya sendiri.
  label_id   text NOT NULL,
  label_en   text NOT NULL,
  -- Urutan tampil di formulir dan di katalog. Angka, bukan abjad: "Romansa"
  -- tidak selalu yang pertama, dan urutan menurut abjad menaruh genre baru
  -- di tempat yang acak.
  position   integer NOT NULL DEFAULT 0,
  -- Genre nonaktif tidak ditawarkan lagi, tetapi tidak dihapus.
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT genres_position_check CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS genres_position_idx ON genres (position ASC, genre_id ASC);

-- Lima genre lama, dengan label yang sama seperti yang selama ini ditampilkan
-- aplikasi pemain. `position` mengikuti urutan yang sudah dipakai di katalog.
INSERT INTO genres (genre_id, label_id, label_en, position, active) VALUES
  ('romance', 'Romansa',          'Romance',      1, true),
  ('drama',   'Drama',            'Drama',        2, true),
  ('office',  'Kehidupan Kantor', 'Office Life',  3, true),
  ('fantasy', 'Fantasi',          'Fantasy',      4, true),
  ('mystery', 'Misteri',          'Mystery',      5, true)
ON CONFLICT (genre_id) DO NOTHING;

-- Ganti daftar-terkunci-skema dengan kunci asing ke tabel genre.
ALTER TABLE world_genres DROP CONSTRAINT IF EXISTS world_genres_value_check;

ALTER TABLE world_genres
  ADD CONSTRAINT world_genres_genre_fk
  FOREIGN KEY (genre) REFERENCES genres (genre_id);

-- Pencarian "dunia dengan genre tertentu" menyaring kolom yang berdiri sendiri;
-- indeks kunci utama dimulai dari `world_id` sehingga tidak menolong.
CREATE INDEX IF NOT EXISTS world_genres_genre_idx ON world_genres (genre);
