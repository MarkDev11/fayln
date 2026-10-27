-- Perjalanan yang sudah selesai (endArc) menjadi TERMINAL dan tidak lagi
-- memblokir perjalanan baru di dunia yang sama.
--
-- Sebelumnya aturan D-12 ditegakkan indeks unik penuh
-- `journeys_one_active_per_world (account_id, world_id)`: satu baris perjalanan
-- apa pun, selesai ataupun tidak, mengunci dunianya selamanya. Pemain yang
-- menamatkan cerita tidak bisa memulainya lagi.
--
-- Sekarang baris perjalanan membawa `ended_at`: null berarti masih berjalan,
-- terisi berarti tamat. Indeks uniknya menjadi PARSIAL, hanya menegakkan
-- "maksimal satu perjalanan AKTIF per akun per dunia".
--
-- Kolom `ended_at` diisi oleh `appendTurn` saat beat `endArc` di-commit, jadi
-- penanda tamat tidak mungkin terlewat: ia lahir di transaksi yang sama
-- dengan beatnya.

ALTER TABLE journeys ADD COLUMN ended_at timestamptz;

DROP INDEX journeys_one_active_per_world;

CREATE UNIQUE INDEX journeys_one_active_per_world
  ON journeys (account_id, world_id)
  WHERE ended_at IS NULL;
