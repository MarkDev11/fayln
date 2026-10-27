-- Kejadian mesin cerita (observabilitas).
--
-- Sebelumnya satu-satunya jejak "mesin AI gagal lalu simulator mengambil
-- alih" adalah baris log warn yang menghilang begitu log platform bergulir.
-- Tabel ini membuat kejadian itu JADI DATA: pemilik dapat melihat dari panel
-- berapa sering simulator menulis cerita minggu ini, tanpa skrip manual.
--
-- Penulisan baris TIDAK PERNAH menggagalkan permintaan: repository-nya
-- menelan galat pencatatan, karena cerita lebih penting daripada lognya.
--
-- Jenis kejadian:
--   engine_failed   : panggilan model gagal (jaringan, timeout, tanpa kunci).
--   scene_rejected  : adegan model ditolak validator.
--   simulator_used  : giliran akhirnya ditulis simulator cadangan.
--   events_skipped  : adegan diterima, tetapi sebagian peristiwanya dibuang.

CREATE TABLE engine_events (
  id          text PRIMARY KEY,
  kind        text NOT NULL,
  detail      text,
  journey_id  text,
  turn_id     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_events_kind_check
    CHECK (kind IN ('engine_failed', 'scene_rejected', 'simulator_used', 'events_skipped'))
);

-- Daftar "terakhir" di halaman admin selalu membaca yang TERBARU lebih dulu.
CREATE INDEX engine_events_recent ON engine_events (created_at DESC);

-- Hitungan per jenis juga membaca menurut jenis.
CREATE INDEX engine_events_by_kind ON engine_events (kind, created_at DESC);
