-- Jiwa (soul) dan asal karakter pada dunia.
--
-- ---------------------------------------------------------------------------
-- MENGAPA KOLOM INI ADA
-- ---------------------------------------------------------------------------
-- Sebelum ini, karakter dibuat dari nol di dalam wizard: nama, peran, sifat,
-- relasi, latar belakang, dan potretnya diketik atau diunggah di sana. Padahal
-- master karakter sudah ada dan sudah berisi potret beserta ekspresinya — jadi
-- setiap dunia mengunggah ulang gambar yang sama.
--
-- Pemilik produk memintanya dibalik: karakter DIPUNGUT dari master, dan yang
-- diisi di wizard hanya yang memang milik DUNIA:
--
--   - nama    : boleh diganti untuk dunia ini (master tidak ikut berubah);
--   - peran   : fungsi tokoh dalam cerita ini — "bosmu", "sahabatmu";
--   - background: latar belakangnya di dunia ini;
--   - soul    : kepribadian mendalamnya.
--
-- ---------------------------------------------------------------------------
-- SOUL BUKAN SIFAT (TRAITS)
-- ---------------------------------------------------------------------------
-- Sifat berupa daftar kata ("pendiam, teliti"). Soul berupa paragraf: apa yang
-- mendorongnya, apa yang ditakutinya, bagaimana ia bicara. Soul MENGGANTIKAN
-- sifat, bukan menambahnya — satu paragraf dapat menyatakan "pendiam" sekaligus
-- MENGAPA ia pendiam, sedangkan daftar kata tidak dapat. `world_character_traits`
-- karena itu tidak lagi ditulis, meski tabelnya dibiarkan ada: menghapus tabel
-- tidak dapat dibatalkan, sedangkan berhenti menulisnya tidak merusak apa pun.
--
-- ---------------------------------------------------------------------------
-- CATATAN pg-mem
-- ---------------------------------------------------------------------------
-- Kedua kolom NULLABLE: baris karakter yang sudah ada belum punya soul dan tidak
-- menunjuk master mana pun. Menolak baris lama berarti membuat basis data
-- produksi tidak dapat dimigrasikan.
--
-- Kunci asing ditambahkan terpisah, bukan di dalam ADD COLUMN, mengikuti pola
-- migrasi 017: bentuk `ADD COLUMN ... REFERENCES` dukungannya tidak pasti,
-- sedangkan `ADD CONSTRAINT ... FOREIGN KEY` sudah terbukti.

ALTER TABLE world_characters ADD COLUMN soul text NOT NULL DEFAULT '';
ALTER TABLE world_characters ADD COLUMN master_character_id text;

ALTER TABLE world_characters ADD CONSTRAINT world_characters_master_fk
  FOREIGN KEY (master_character_id) REFERENCES characters (character_id)
  ON DELETE RESTRICT;
