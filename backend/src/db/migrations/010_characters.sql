-- ---------------------------------------------------------------------------
-- 010: karakter menjadi DATA yang berdiri sendiri (master karakter)
-- ---------------------------------------------------------------------------
--
-- Sebelum ini, satu-satunya cara membuat karakter adalah lewat wizard "Dunia
-- baru" langkah 3 — dan setiap karakter hidup HANYA di dalam satu versi dunia.
-- Karakter yang sama pada dua dunia berarti mengunggah gambar yang sama dua
-- kali, dengan nama yang diketik dua kali.
--
-- Tabel di sini memindahkan bagian yang TIDAK khas dunia ke satu tempat:
-- nama karakter dan gambar-gambar ekspresinya. Yang khas dunia — peran, latar
-- belakang, hubungan awal dengan pemain — tetap tinggal di `world_characters`,
-- karena hal itu memang berbeda di tiap cerita.
--
-- ---------------------------------------------------------------------------
-- MENGAPA DUA TABEL, DAN MENGAPA `media_id` WAJIB ADA ISINYA
-- ---------------------------------------------------------------------------
-- `characters` memuat nama; `character_expressions` memuat pasangan
-- nama-ekspresi + gambar. Dipisah karena satu karakter punya banyak ekspresi,
-- dan karena ekspresi tanpa gambar adalah data mati.
--
-- Itu sebabnya `media_id` NOT NULL dan berkunci asing ke `media_blobs`:
--
--   * Ekspresi tanpa gambar TIDAK DAPAT dirender klien. Panel sudah pernah
--     membuang nama ekspresi yang gambarnya belum diunggah — tetapi itu
--     keputusan di sisi kode, dan hanya berlaku pada satu jalur simpan. Di
--     sini aturannya ditegakkan basis data, sehingga tidak ada jalur lain yang
--     dapat menyelundupkan nama tanpa gambar.
--   * Kunci asingnya membuat berkas gambar yang masih dipakai tidak dapat
--     dihapus dari `media_blobs` dan meninggalkan baris yang menunjuk ke
--     ketiadaan.
--
-- ---------------------------------------------------------------------------
-- `ON DELETE CASCADE` DISENGAJA, TETAPI TIDAK DIPERCAYAI
-- ---------------------------------------------------------------------------
-- Menghapus karakter seharusnya menghapus ekspresinya. Meski begitu,
-- `charactersRepository` tetap membuang baris ekspresi LEBIH DULU di dalam satu
-- transaksi, tidak mengandalkan cascade — pola yang sama seperti `saveNpc`.
-- Alasannya bukan kehati-hatian berlebihan: seluruh uji berjalan di atas
-- pg-mem, dan perilaku cascade di sana tidak dipercaya sebagai bukti. Cascade
-- di sini adalah jaring pengaman untuk PostgreSQL sungguhan, bukan mekanisme
-- yang diandalkan kode.
--
-- ---------------------------------------------------------------------------
-- BATAS `CHECK` SENGAJA SEDERHANA (alasan yang sama dengan 009)
-- ---------------------------------------------------------------------------
-- pg-mem tidak mengenal operator `~` maupun fungsi `length()`/`btrim()`, dan
-- `CHECK` yang memakainya membuat MIGRASI GAGAL — bukan sekadar tidak
-- menegakkan apa pun. Karena itu di sini hanya ada perbandingan angka dan
-- `NOT NULL`. Panjang nama dan bentuk id diperiksa di repositori, tempat
-- pesannya juga dapat menjelaskan KENAPA sebuah nilai ditolak.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS characters (
  -- Dibuat sistem (`char_<acak>`), bukan diketik admin. Berbeda dari genre,
  -- tidak ada nilai yang lebih baik daripada id buatan: nama karakter bebas
  -- ("Elysia", "Bu Ratna"), dan menurunkannya menjadi id akan menabrak nama
  -- yang sama pada dua karakter berbeda.
  character_id text PRIMARY KEY,
  name         text NOT NULL,
  -- Urutan tampil di daftar master dan, kelak, di pemilih pada wizard.
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT characters_position_check CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS characters_position_idx ON characters (position ASC, character_id ASC);

CREATE TABLE IF NOT EXISTS character_expressions (
  character_id text NOT NULL,
  -- Ekspresi pertama (position 0) menjadi potret bawaan karakter ini, sama
  -- seperti ekspresi `dasar` pada wizard. Urutannya karena itu bermakna.
  position     integer NOT NULL,
  expression   text NOT NULL,
  media_id     text NOT NULL,
  -- Membimbing mesin cerita, mis. "dipakai saat ia menahan kesal". Sifatnya
  -- melekat pada karakter, bukan pada dunia, jadi tempatnya di sini.
  usage_note   text NOT NULL DEFAULT '',
  PRIMARY KEY (character_id, position),
  CONSTRAINT character_expressions_character_fk
    FOREIGN KEY (character_id) REFERENCES characters (character_id) ON DELETE CASCADE,
  CONSTRAINT character_expressions_media_fk
    FOREIGN KEY (media_id) REFERENCES media_blobs (media_id),
  CONSTRAINT character_expressions_position_check CHECK (position >= 0)
);
