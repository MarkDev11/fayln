-- ------------------------------------------------------------------
-- 004 — Admin panel: akun admin, sesi, konfigurasi, dan promosi
-- ------------------------------------------------------------------
--
-- Semua tabel di sini hanya dipakai panel admin. Tidak ada satu pun yang
-- disentuh jalur pemain (/v1), kecuali pembacaan promosi saat penukaran.
--
-- Catatan penting: kunci utama TIDAK diturunkan dari nomor urut lokal
-- (ADR-B09). Setiap ID di sini dibuat di kode dengan randomUUID().

-- ------------------------------------------------------------------
-- Akun admin
-- ------------------------------------------------------------------
--
-- Password disimpan sebagai hash scrypt dari node:crypto, bukan teks biasa.
-- Format kolom: scrypt$N$r$p$<salt-base64>$<hash-base64> — parameter ikut
-- disimpan supaya hash lama tetap dapat diverifikasi setelah parameter naik.

CREATE TABLE admin_users (
  admin_id      text PRIMARY KEY,
  username      text NOT NULL,
  password_hash text NOT NULL,
  display_name  text NOT NULL DEFAULT '',
  -- Peran disimpan meski MVP hanya punya satu tingkat; menambah peran nanti
  -- tidak perlu migrasi skema.
  role          text NOT NULL DEFAULT 'owner',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT admin_users_role_check CHECK (role IN ('owner', 'editor', 'support'))
  -- Format nama pengguna (huruf kecil, 3-32 karakter) ditegakkan di kode dengan
  -- Zod, bukan di sini. Operator regex `~` pada CHECK tidak didukung mesin
  -- database in-memory yang dipakai pengujian, sehingga aturannya akan tampak
  -- gagal di pengujian padahal SQL-nya benar untuk PostgreSQL.
);

-- Nama admin tidak boleh kembar. Dibandingkan tanpa memandang besar-kecil huruf,
-- supaya "Admin" dan "admin" tidak dapat hidup berdampingan.
CREATE UNIQUE INDEX admin_users_username_unique ON admin_users (lower(username));

-- ------------------------------------------------------------------
-- Sesi admin
-- ------------------------------------------------------------------
--
-- Token sesi yang dikirim ke peramban adalah token MENTAH; yang disimpan di sini
-- hanya hash SHA-256-nya. Dengan begitu isi tabel ini tidak dapat dipakai untuk
-- membajak sesi bila database bocor.

CREATE TABLE admin_sessions (
  session_hash text PRIMARY KEY,
  admin_id     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text NOT NULL DEFAULT '',
  ip_address   text NOT NULL DEFAULT '',
  CONSTRAINT admin_sessions_admin_fk
    FOREIGN KEY (admin_id) REFERENCES admin_users (admin_id) ON DELETE CASCADE
);

CREATE INDEX admin_sessions_admin_idx ON admin_sessions (admin_id);
CREATE INDEX admin_sessions_expiry_idx ON admin_sessions (expires_at);

-- ------------------------------------------------------------------
-- Catatan audit
-- ------------------------------------------------------------------
--
-- Setiap perubahan yang mengubah keadaan dicatat. Tanpa ini, tidak ada cara
-- menjawab "siapa yang mengubah ini".

CREATE TABLE admin_audit_log (
  entry_id    text PRIMARY KEY,
  admin_id    text,
  username    text NOT NULL,
  action      text NOT NULL,
  target_kind text NOT NULL DEFAULT '',
  target_id   text NOT NULL DEFAULT '',
  detail      jsonb,
  ip_address  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON admin_audit_log (target_kind, target_id);

-- ------------------------------------------------------------------
-- Konfigurasi aplikasi (key-value)
-- ------------------------------------------------------------------
--
-- Dipakai menyimpan pengaturan yang harus dapat diubah tanpa deploy: harga
-- tampilan token, biaya per giliran, konfigurasi promosi, dan sebagainya.
-- Nilai disimpan sebagai jsonb supaya bentuknya bebas, dengan kolom `kind`
-- sebagai penanda tipe yang diharapkan pembacanya.

CREATE TABLE app_settings (
  setting_key   text PRIMARY KEY,
  value         jsonb NOT NULL,
  kind          text NOT NULL DEFAULT 'json',
  description   text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text,
  -- Format kunci ditegakkan di kode (Zod); lihat catatan pada admin_users.
  CONSTRAINT app_settings_kind_check CHECK (kind IN ('json', 'string', 'number', 'boolean'))
);

-- ------------------------------------------------------------------
-- Model dan rantai fallback
-- ------------------------------------------------------------------
--
-- Mengapa ini tabel dan bukan konstanta di kode: biaya satu giliran berbeda
-- untuk setiap model, sedangkan FR-50 ("tidak ada generasi yang dikirim bila
-- anggaran tidak cukup") bergantung pada angka itu. Setelah B-01 diputuskan,
-- angka tersebut berubah tanpa deploy.

CREATE TABLE model_configs (
  model_id       text PRIMARY KEY,
  label          text NOT NULL,
  provider       text NOT NULL DEFAULT '',
  -- Biaya perkiraan satu giliran, dalam token. Ini yang dipakai memeriksa
  -- anggaran SEBELUM memanggil model.
  estimated_turn_cost integer NOT NULL,
  context_tokens integer NOT NULL,
  -- Urutan mencoba: 0 = utama, 1 = fallback pertama, dan seterusnya.
  position       integer NOT NULL DEFAULT 0,
  tier           text NOT NULL DEFAULT 'free',
  is_active      boolean NOT NULL DEFAULT false,
  notes          text NOT NULL DEFAULT '',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_configs_tier_check CHECK (tier IN ('free', 'paid')),
  CONSTRAINT model_configs_cost_positive CHECK (estimated_turn_cost > 0),
  CONSTRAINT model_configs_context_positive CHECK (context_tokens > 0),
  CONSTRAINT model_configs_position_non_negative CHECK (position >= 0)
);

CREATE INDEX model_configs_tier_idx ON model_configs (tier, position);

-- ------------------------------------------------------------------
-- Promosi
-- ------------------------------------------------------------------
--
-- Promosi memberi TOKEN BONUS, bukan mata uang terpisah. Alasannya: token adalah
-- satuan yang sejajar dengan biaya model, sehingga penagihan tetap dapat
-- diprediksi. Hadiah dalam bentuk lain akan memerlukan sistem pembukuan kedua.

CREATE TABLE promotions (
  promotion_id  text PRIMARY KEY,
  code          text NOT NULL,
  label         text NOT NULL DEFAULT '',
  -- Token bonus yang ditambahkan ke kuota harian akun saat kode ditukar.
  bonus_tokens  bigint NOT NULL,
  -- Batas pemakaian: 0 berarti tanpa batas.
  max_redemptions integer NOT NULL DEFAULT 0,
  redemption_count integer NOT NULL DEFAULT 0,
  -- Satu akun hanya boleh menukar sekali, kecuali ini disetel false.
  once_per_account boolean NOT NULL DEFAULT true,
  -- Syarat tier: 'any' berarti berlaku untuk semua.
  tier_requirement text NOT NULL DEFAULT 'any',
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_bonus_positive CHECK (bonus_tokens > 0),
  CONSTRAINT promotions_counts_non_negative
    CHECK (max_redemptions >= 0 AND redemption_count >= 0),
  CONSTRAINT promotions_tier_check
    CHECK (tier_requirement IN ('any', 'free', 'paid')),
  -- Periode harus masuk akal bila keduanya diisi.
  CONSTRAINT promotions_period_check
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

-- Kode promosi dibandingkan tanpa memandang besar-kecil huruf: pemain tidak
-- seharusnya gagal hanya karena menulis "HEMAT" alih-alih "hemat".
CREATE UNIQUE INDEX promotions_code_unique ON promotions (upper(code));

CREATE TABLE promotion_redemptions (
  redemption_id text PRIMARY KEY,
  promotion_id  text NOT NULL,
  account_id    text NOT NULL,
  tokens_granted bigint NOT NULL,
  -- Kolom penanda untuk indeks parsial di bawah. Berisi account_id bila promosi
  -- dibatasi satu kali per akun, dan NULL bila tidak dibatasi.
  --
  -- Mengapa kolom terpisah: indeks unik tidak dapat membaca kolom dari tabel
  -- lain (di sini `promotions.once_per_account`). Indeks parsial hanya
  -- menegakkan keunikan pada baris yang kolomnya NOT NULL, sehingga promosi
  -- tanpa batas tetap dapat ditukar berkali-kali.
  uniqueness_guard text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_redemptions_promotion_fk
    FOREIGN KEY (promotion_id) REFERENCES promotions (promotion_id) ON DELETE CASCADE,
  CONSTRAINT promotion_redemptions_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE,
  CONSTRAINT promotion_redemptions_tokens_positive CHECK (tokens_granted > 0)
);

CREATE INDEX promotion_redemptions_account_idx ON promotion_redemptions (account_id);

-- Inilah yang membuat penukaran ganda tidak mungkin, bukan sekadar tidak
-- mungkin secara kebiasaan. Ditegakkan database, bukan logika aplikasi.
CREATE UNIQUE INDEX promotion_redemptions_once_per_account
  ON promotion_redemptions (promotion_id, uniqueness_guard)
  WHERE uniqueness_guard IS NOT NULL;

-- ------------------------------------------------------------------
-- Saldo token bonus
-- ------------------------------------------------------------------
--
-- Bonus promosi TIDAK disimpan di `usage_days`, karena baris itu berkunci
-- (account_id, usage_date) dan akan hangus setiap tengah malam — pemain akan
-- kehilangan hadiahnya hanya karena hari berganti. Bonus adalah saldo yang
-- berdiri sendiri dan dikonsumsi SETELAH kuota harian habis.
--
-- Urutannya penting: kuota harian dipakai lebih dahulu, baru bonus. Dengan
-- begitu bonus tidak hangus dan pemain tidak pernah "kehilangan" jatah harian.

CREATE TABLE bonus_balances (
  account_id      text PRIMARY KEY,
  balance_tokens  bigint NOT NULL DEFAULT 0,
  lifetime_granted bigint NOT NULL DEFAULT 0,
  lifetime_used   bigint NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bonus_balances_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE,
  CONSTRAINT bonus_balances_non_negative
    CHECK (balance_tokens >= 0 AND lifetime_granted >= 0 AND lifetime_used >= 0)
);

