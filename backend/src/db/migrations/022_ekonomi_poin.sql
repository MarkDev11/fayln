-- Ekonomi poin harian (docs/17).
--
-- ---------------------------------------------------------------------------
-- MENGAPA TABEL BARU, BUKAN KOLOM DI usage_days
-- ---------------------------------------------------------------------------
-- Klaim harian adalah FAKTA bersejarah, bukan keadaan yang dapat berubah:
-- sekali seorang pemain mengklaim poin hari ini, baris itu tidak pernah
-- disunting lagi. Menaruhnya sebagai kolom di `usage_days` (yang memang
-- ditulis ulang oleh penagihan dan oleh panel admin) akan membuka jalur
-- yang tidak semestinya: reset pemakaian bisa ikut "mereset" klaim, dan
-- bonus streak dapat hilang tanpa jejak.
--
-- Satu baris per (account_id, claim_date) — pola yang sama dengan tolak
-- tagih-ganda di `usage_entries`: batasnya ditegakkan basis data lewat
-- kunci utama, bukan lewat pemeriksaan di aplikasi yang dapat terlewat
-- saat dua permintaan datang bersamaan.
--
-- Streak dihitung dari SELISIH claim_date (lihat usageRepository), bukan
-- dari jam `claimed_at`: jam klaim tidak relevan, hanya tanggal WIB-nya.
--
-- Catatan pg-mem: tanpa `IF NOT EXISTS` (tidak didukung); batasan CHECK
-- dan kunci utama majemuk sudah terbukti didukung di migrasi sebelumnya.
-- ---------------------------------------------------------------------------
CREATE TABLE daily_point_claims (
  account_id   text NOT NULL,
  -- Tanggal WIB (YYYY-MM-DD) saat klaim dilakukan.
  claim_date   text NOT NULL,
  -- Poin dasar yang diberikan, SUDAH termasuk pengali promosi saat klaim.
  base_points  integer NOT NULL,
  -- Bonus streak; nol kecuali hari kelipatan siklus (default: tiap hari ke-7).
  bonus_points integer NOT NULL,
  -- Hari ke-n dalam rentetan klaim beruntun; mulai dari 1.
  streak_day   integer NOT NULL,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, claim_date),
  CONSTRAINT daily_point_claims_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE,
  CONSTRAINT daily_point_claims_non_negative
    CHECK (base_points >= 0 AND bonus_points >= 0 AND streak_day >= 1)
);
