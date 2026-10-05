-- Provider sebagai entitas tersendiri.
--
-- ---------------------------------------------------------------------------
-- MENGAPA DIPISAH
-- ---------------------------------------------------------------------------
-- Sebelum ini "provider" hanyalah teks bebas pada baris model (`model_configs.
-- provider`). Akibatnya tidak ada tempat untuk menyimpan hal-hal yang
-- sebenarnya milik PROVIDER, bukan milik model:
--
--   base_url   — ke mana permintaan dikirim
--   api_type   — protokolnya (chat completions / responses / messages)
--   prefix     — awalan id model, mis. "oc-prod" pada "oc-prod/gpt-4o-mini"
--
-- Menaruh ketiganya di baris model berarti menuliskannya ulang untuk setiap
-- model dari provider yang sama — dan satu salah ketik menghasilkan model yang
-- diam-diam menembak alamat yang salah.
--
-- Bentuknya mengikuti pemisahan yang sudah dipakai master lain di panel ini:
-- satu tabel untuk hal yang berdiri sendiri (provider), dan satu tabel untuk
-- hal yang menunjuk ke sana (model).
--
-- ---------------------------------------------------------------------------
-- KUNCI API TIDAK DISIMPAN DI SINI
-- ---------------------------------------------------------------------------
-- `api_key_env` menyimpan NAMA variabel lingkungan, bukan nilainya. Alasannya
-- sudah menjadi aturan proyek ini sejak awal: rahasia tidak masuk basis data
-- yang isinya dapat dibaca panel, dan tidak masuk image atau repositori.
-- Dua alasan tambahan yang khas proyek ini:
--
--   1. Cadangan malam blitz.cloud menyimpan isi basis data. Kunci yang ada di
--      sana akan ikut tersalin ke tempat yang tidak kita kendalikan.
--   2. Panel ini punya peran `support`. Satu halaman yang salah menampilkan
--      kolom rahasia akan membocorkannya ke orang yang tidak seharusnya.
--
-- Panel tetap dapat MEMERIKSA apakah variabelnya terpasang (tanpa pernah
-- menampilkan nilainya), jadi admin tahu konfigurasinya lengkap atau belum.
--
-- ---------------------------------------------------------------------------
-- BARIS LAMA DIPINDAHKAN, BUKAN DIBUANG
-- ---------------------------------------------------------------------------
-- Setiap nilai `provider` yang berbeda menjadi satu baris provider, dan setiap
-- model lama menunjuk ke provider itu. Prefix diambil dari namanya; bila dua
-- nama menghasilkan prefix yang sama, itu tidak membuat migrasi gagal —
-- keunikan prefix ditegakkan repository dengan alasan yang dapat dibaca admin,
-- bukan oleh `UNIQUE` yang gagal sebagai galat basis data.
--
-- Catatan pg-mem: `lower()` dipakai, dan `DROP COLUMN` dipakai. Keduanya
-- diuji; bila salah satu tidak didukung, migrasi akan GAGAL dan itu terlihat
-- di `tests/schema.test.ts`.

CREATE TABLE IF NOT EXISTS providers (
  provider_id text PRIMARY KEY,
  name        text NOT NULL,
  prefix      text NOT NULL,
  api_type    text NOT NULL,
  base_url    text NOT NULL,
  -- NAMA variabel lingkungan, bukan nilainya. Lihat catatan di atas.
  api_key_env text NOT NULL DEFAULT '',
  position    integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT providers_api_type_check
    CHECK (api_type IN ('chat-completions', 'responses', 'messages')),
  CONSTRAINT providers_position_check CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS providers_position_idx
  ON providers (position ASC, provider_id ASC);

ALTER TABLE model_configs ADD COLUMN provider_id text;
ALTER TABLE model_configs ADD COLUMN model_key   text NOT NULL DEFAULT '';

-- Provider turunan dari nilai lama. Id-nya memakai nama apa adanya supaya
-- deterministik dan tidak mungkin bertabrakan antar nama yang berbeda.
INSERT INTO providers (provider_id, name, prefix, api_type, base_url)
SELECT DISTINCT 'prov_' || m.provider, m.provider, lower(m.provider), 'chat-completions', ''
FROM model_configs m
WHERE m.provider <> '';

UPDATE model_configs SET provider_id = 'prov_' || provider WHERE provider <> '';

-- Nama model di provider: baris lama belum punya, dan id lamanya adalah
-- tebakan terbaik yang tersedia.
UPDATE model_configs SET model_key = model_id WHERE model_key = '';

-- `provider` teks tidak dipakai lagi; rujukannya sudah pindah ke provider_id.
ALTER TABLE model_configs DROP COLUMN provider;

ALTER TABLE model_configs ADD CONSTRAINT model_configs_provider_fk
  FOREIGN KEY (provider_id) REFERENCES providers (provider_id) ON DELETE RESTRICT;
