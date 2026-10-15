-- ===========================================================================
-- MASTER HUBUNGAN
-- ===========================================================================
--
-- Sampai migrasi ini, daftar status hubungan adalah KONSTANTA DI DALAM KODE.
-- Ia hidup di lima tempat sekaligus, dan dua di antaranya tidak dapat menyimpang
-- tanpa menghasilkan galat:
--
--   1. `contracts/types.ts`        RELATION_STATUSES  (sumber yang dianggap benar)
--   2. migrasi 001                 CHECK (initial_relation IN (...))  ← menolak nilai baru
--   3. frontend/src/domain/types   array TS lagi       ← status baru jadi "Belum diketahui"
--   4. i18n id/en                  label
--   5. storyPrompt.ts              ARTI_STATUS — arti untuk model
--
-- Akibatnya menambah status kesembilan berarti menyunting kelima tempat itu,
-- dan melewatkan salah satunya adalah kegagalan SENYAP: nilai sah dari model
-- ditolak `CHECK`, atau status yang tersimpan baik-baik saja tampil sebagai
-- "Belum diketahui" di layar pemain tanpa satu pun galat di mana pun.
--
-- Mulai sekarang daftar itu DATA, bukan kode. Yang diubah di sini:
--
--   * `relation_definitions`  — master yang disunting admin.
--   * `CHECK` pada `world_characters.initial_relation` DIGANTI kunci asing ke
--     master. Inilah yang membuat status kesembilan mungkin: `CHECK` menulis
--     nilainya secara harfiah, jadi nilai apa pun yang belum tertulis di situ
--     SELALU ditolak, betapa pun sahnya di master.
--   * `world_relationship_definitions` — salinan yang DIBEKUKAN per versi dunia.
--
-- ---------------------------------------------------------------------------
-- MENGAPA DIBEKUKAN PER VERSI DUNIA, BUKAN DIBACA LANGSUNG DARI MASTER
-- ---------------------------------------------------------------------------
-- Keputusan pemilik produk: "perjalanan yang sudah berjalan tetap memakai
-- definisi lamanya". Membaca master secara langsung setiap giliran berarti
-- menyunting satu kalimat arti di panel mengubah cara tokoh bersikap di
-- perjalanan yang sudah berjalan berjam-jam — dan menonaktifkan satu status
-- dapat membuat perjalanan lama kehilangan status yang sedang dipakainya.
--
-- Karena itu setiap versi dunia membawa salinan kosakatanya SENDIRI. Master
-- hanya memengaruhi versi yang diterbitkan SESUDAHNYA.
--
-- Perjalanan tidak butuh salinannya sendiri: `journeys.world_version` sudah
-- dikunci saat perjalanan dibuat, dan baris di sini tidak pernah berubah.
-- ===========================================================================

CREATE TABLE relation_definitions (
  relation_id    text PRIMARY KEY,
  label_id       text NOT NULL,
  label_en       text NOT NULL,
  -- Apa status ini BERARTI bagi tokohnya. Ditulis admin, dibaca model.
  meaning        text NOT NULL,
  -- CONTOH SIKAP: kalimat pendek tentang apa yang TERLIHAT, bukan apa yang
  -- dirasakan. Terpisah dari `meaning` karena `meaning` menjawab "apa
  -- keadaannya", sedangkan ini menjawab "bagaimana kelihatannya di layar".
  -- Model generik yang hanya diberi nama keadaan ("waspada") cenderung
  -- menghasilkan perbedaan gaya yang tipis; yang mengubah cara sebuah adegan
  -- terbaca adalah detail konkret: jarak, panjang kalimat, apa yang ditolak
  -- dilakukan. Opsional, tetapi sangat dianjurkan.
  --
  -- CATATAN PARSER: tanda hubung panjang (em dash) di dalam komentar SQL
  -- membuat lexer pg-mem gagal memproses berkas ini, sehingga seluruh uji
  -- skema berhenti. Karena itu komentar di berkas ini memakai tanda hubung
  -- biasa, dan komentar blok dihindari di dalam `CREATE TABLE`.
  behaviour_hint text NOT NULL DEFAULT '',
  position       integer NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Delapan status yang sudah ada, apa adanya — id dan labelnya TIDAK berubah,
-- supaya perjalanan lama yang menyimpannya tetap dapat dibaca.
--
-- `meaning` adalah kalimat yang dibaca MODEL, bukan pemain. Ia sengaja berbahasa
-- Indonesia seperti nilai statusnya: yang perlu dipahami model adalah sikap yang
-- harus ditampilkan, dan menuliskannya dalam bahasa yang sama dengan nilainya
-- menghilangkan satu lapisan penerjemahan yang bisa salah.
INSERT INTO relation_definitions
  (relation_id, label_id, label_en, meaning, behaviour_hint, position, active) VALUES
  ('normal',   'Normal',   'Neutral',
   'Netral — belum ada kedekatan maupun ketegangan; bersikap wajar seperti kepada orang yang baru dikenal.',
   'Menjawab secukupnya, ramah tanpa hangat. Tidak mencari alasan untuk tetap berbicara, dan tidak menghindar.',
   1, true),
  ('hangat',   'Hangat',   'Warm',
   'Hangat — ramah dan terbuka, tetapi belum dekat; senang berbicara, belum berbagi hal pribadi.',
   'Tersenyum lebih mudah, menyapa lebih dulu, dan menambahkan satu kalimat kecil yang tidak perlu. Masih menjaga batas hal yang pribadi.',
   2, true),
  ('waspada',  'Waspada',  'Wary',
   'Waspada — menjaga jarak dan berhati-hati mempercayai pemain; tetap sopan, tetapi tidak berbagi dan tidak mendekat.',
   'Menjaga jarak fisik, jawaban singkat dan lengkap seperlunya, menimbang kata-katanya. Sopan, tetapi tidak menawarkan apa pun.',
   3, true),
  ('tegang',   'Tegang',   'Tense',
   'Tegang — ketegangan terbuka; memotong pembicaraan pemain dan mudah tersinggung oleh hal kecil.',
   'Memotong kalimat, menjawab lebih keras daripada perlu, dan menolak permintaan kecil yang biasanya dituruti.',
   4, true),
  ('renggang', 'Renggang', 'Distant',
   'Renggang — menjauh dan menghindari pemain; jawabannya pendek, dan ia mencari alasan untuk pergi.',
   'Menjawab seperlunya, menghindari kontak mata, dan mengakhiri percakapan lebih cepat daripada yang diharapkan.',
   5, true),
  ('dekat',    'Dekat',    'Close',
   'Dekat — mempercayai pemain dan mencari kesempatan untuk bersama; mau bercerita hal yang tidak ia ceritakan kepada orang lain.',
   'Mencari alasan untuk ikut, memanggil dengan nama, dan membagikan detail yang tidak diceritakan kepada orang lain.',
   6, true),
  ('sayang',   'Sayang',   'Fond',
   'Sayang — menyukai pemain dengan tulus; memberi perhatian yang tidak diminta dan mengingat hal-hal kecil tentang pemain.',
   'Mengingat hal kecil tentang pemain, menawarkan bantuan yang tidak diminta, dan khawatir bila pemain tidak bercerita.',
   7, true),
  ('cinta',    'Cinta',    'In love',
   'Cinta — jatuh cinta kepada pemain; cemas kehilangan, dan keputusan pemain terasa jauh lebih berat baginya.',
   'Mencari keberadaan pemain lebih dulu, cemas saat pemain menjauh, dan pilihan pemain memengaruhi suasana hatinya sepanjang adegan.',
   8, true);

-- ---------------------------------------------------------------------------
-- `CHECK` harfiah diganti kunci asing ke master.
-- ---------------------------------------------------------------------------
-- `RESTRICT` (bawaan) adalah yang diinginkan: definisi yang masih dipakai
-- sebuah dunia tidak boleh hilang. Yang sudah tidak diinginkan dinonaktifkan,
-- bukan dihapus — sama seperti genre.
ALTER TABLE world_characters DROP CONSTRAINT world_characters_relation_check;

ALTER TABLE world_characters
  ADD CONSTRAINT world_characters_relation_fk
  FOREIGN KEY (initial_relation) REFERENCES relation_definitions (relation_id);

-- ---------------------------------------------------------------------------
-- Kosakata yang DIBEKUKAN untuk setiap versi dunia.
-- ---------------------------------------------------------------------------
-- Isinya salinan, bukan rujukan ke master: itulah yang membuat penyuntingan
-- master tidak menulis ulang arti perjalanan yang sudah berjalan. Kunci asing ke
-- master tetap ada supaya definisi yang masih dipakai versi mana pun tidak dapat
-- dihapus dari panel.
CREATE TABLE world_relationship_definitions (
  world_id       text NOT NULL,
  world_version  integer NOT NULL,
  relation_id    text NOT NULL,
  label_id       text NOT NULL,
  label_en       text NOT NULL,
  meaning        text NOT NULL,
  -- Salinan contoh sikap pada saat versi ini terbit. Lihat catatan di atas.
  behaviour_hint text NOT NULL DEFAULT '',
  position       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, world_version, relation_id),
  CONSTRAINT world_rel_defs_version_fk
    FOREIGN KEY (world_id, world_version)
    REFERENCES world_versions (world_id, world_version) ON DELETE CASCADE,
  CONSTRAINT world_rel_defs_relation_fk
    FOREIGN KEY (relation_id) REFERENCES relation_definitions (relation_id)
);

-- Versi dunia yang SUDAH ada dibekukan dari master tepat setelah ia diisi.
-- Tanpa baris ini, seluruh dunia yang sudah terbit akan kehilangan kosakatanya
-- dan setiap giliran berikutnya kehilangan daftar status yang sah.
--
-- Gabungannya ditulis dengan KOMA, bukan `CROSS JOIN`. Keduanya sama di
-- PostgreSQL, tetapi pg-mem — mesin yang dipakai pengujian — menolak kata
-- `CROSS JOIN` dengan "Join type not supported", dan migrasi yang gagal di
-- pengujian berarti tidak ada satu pun uji skema yang dapat berjalan.
INSERT INTO world_relationship_definitions
  (world_id, world_version, relation_id, label_id, label_en, meaning, behaviour_hint, position)
SELECT v.world_id, v.world_version, d.relation_id, d.label_id, d.label_en, d.meaning,
       d.behaviour_hint, d.position
FROM world_versions v, relation_definitions d;
