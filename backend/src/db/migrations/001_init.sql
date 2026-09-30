-- fayLN — skema awal.
--
-- Prinsip yang tercermin di sini:
-- 1. Versi dunia TIDAK DAPAT DIUBAH. Journey mengunci world_version, sehingga
--    penerbitan versi baru tidak pernah mengubah cerita yang sedang berjalan (D-23).
-- 2. Beat adalah catatan yang tidak dapat diubah. Tidak ada UPDATE atau DELETE
--    pada tabel beats; koreksi dilakukan dengan menambah turn baru.
-- 3. Hubungan disimpan sebagai hasil turunan dari beat yang sudah di-commit,
--    bukan sebagai nilai yang ditulis klien.
-- 4. Kuota disimpan dengan cap tanggal UTC, sehingga reset harian dihitung saat
--    dibaca dan tidak memerlukan pekerjaan terjadwal (lihat docs/14 bagian 5).
-- 5. Semua waktu memakai timestamptz dalam UTC.

-- ------------------------------------------------------------------
-- Akun
-- ------------------------------------------------------------------

CREATE TABLE accounts (
  account_id   text PRIMARY KEY,
  display_name text,
  age          integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_age_range CHECK (age IS NULL OR (age >= 13 AND age <= 99))
);

-- ------------------------------------------------------------------
-- Dunia dan versinya
-- ------------------------------------------------------------------

-- Identitas dunia yang stabil lintas versi.
CREATE TABLE worlds (
  world_id   text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Satu baris per versi terbit. Baris yang sudah ada tidak pernah diubah.
CREATE TABLE world_versions (
  world_id                  text NOT NULL,
  world_version             integer NOT NULL,
  title                     text NOT NULL,
  synopsis                  text NOT NULL,
  premise                   text NOT NULL,
  cover_asset_id            text NOT NULL,
  status                    text NOT NULL,
  content_rating            text NOT NULL,
  published_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, world_version),
  CONSTRAINT world_versions_world_fk
    FOREIGN KEY (world_id) REFERENCES worlds (world_id) ON DELETE CASCADE,
  CONSTRAINT world_versions_status_check
    CHECK (status IN ('draft', 'published', 'retired', 'revoked')),
  CONSTRAINT world_versions_rating_check
    CHECK (content_rating IN ('all', '13_plus', '18_plus')),
  CONSTRAINT world_versions_version_positive CHECK (world_version >= 1)
);

-- Genre dan bahasa respons disimpan sebagai baris terpisah, bukan larik, agar
-- pencarian "dunia dengan genre tertentu" memakai indeks biasa.
CREATE TABLE world_genres (
  world_id      text NOT NULL,
  world_version integer NOT NULL,
  genre         text NOT NULL,
  PRIMARY KEY (world_id, world_version, genre),
  CONSTRAINT world_genres_version_fk
    FOREIGN KEY (world_id, world_version)
    REFERENCES world_versions (world_id, world_version) ON DELETE CASCADE,
  CONSTRAINT world_genres_value_check
    CHECK (genre IN ('romance', 'drama', 'office', 'fantasy', 'mystery'))
);

CREATE TABLE world_response_locales (
  world_id      text NOT NULL,
  world_version integer NOT NULL,
  locale        text NOT NULL,
  PRIMARY KEY (world_id, world_version, locale),
  CONSTRAINT world_locales_version_fk
    FOREIGN KEY (world_id, world_version)
    REFERENCES world_versions (world_id, world_version) ON DELETE CASCADE,
  CONSTRAINT world_locales_value_check CHECK (locale IN ('id-ID', 'en-US'))
);

CREATE TABLE world_locations (
  world_id      text NOT NULL,
  world_version integer NOT NULL,
  location_id   text NOT NULL,
  label         text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, world_version, location_id),
  CONSTRAINT world_locations_version_fk
    FOREIGN KEY (world_id, world_version)
    REFERENCES world_versions (world_id, world_version) ON DELETE CASCADE
);

-- ------------------------------------------------------------------
-- Karakter
-- ------------------------------------------------------------------

CREATE TABLE world_characters (
  world_id                  text NOT NULL,
  world_version             integer NOT NULL,
  npc_id                    text NOT NULL,
  name                      text NOT NULL,
  role                      text NOT NULL,
  public_backstory          text NOT NULL,
  initial_relation          text NOT NULL,
  default_portrait_asset_id text NOT NULL,
  position                  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, world_version, npc_id),
  CONSTRAINT world_characters_version_fk
    FOREIGN KEY (world_id, world_version)
    REFERENCES world_versions (world_id, world_version) ON DELETE CASCADE,
  CONSTRAINT world_characters_relation_check
    CHECK (initial_relation IN
      ('normal', 'hangat', 'waspada', 'tegang', 'renggang', 'dekat', 'sayang', 'cinta'))
);

CREATE TABLE world_character_traits (
  world_id      text NOT NULL,
  world_version integer NOT NULL,
  npc_id        text NOT NULL,
  position      integer NOT NULL,
  trait         text NOT NULL,
  PRIMARY KEY (world_id, world_version, npc_id, position),
  CONSTRAINT character_traits_character_fk
    FOREIGN KEY (world_id, world_version, npc_id)
    REFERENCES world_characters (world_id, world_version, npc_id) ON DELETE CASCADE
);

CREATE TABLE world_character_expressions (
  world_id      text NOT NULL,
  world_version integer NOT NULL,
  npc_id        text NOT NULL,
  position      integer NOT NULL,
  expression    text NOT NULL,
  PRIMARY KEY (world_id, world_version, npc_id, position),
  CONSTRAINT character_expressions_character_fk
    FOREIGN KEY (world_id, world_version, npc_id)
    REFERENCES world_characters (world_id, world_version, npc_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------
-- Aset
-- ------------------------------------------------------------------

CREATE TABLE world_assets (
  world_id      text NOT NULL,
  world_version integer NOT NULL,
  asset_id      text NOT NULL,
  kind          text NOT NULL,
  label         text NOT NULL,
  uri           text NOT NULL,
  npc_id        text,
  expression    text,
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, world_version, asset_id),
  CONSTRAINT world_assets_version_fk
    FOREIGN KEY (world_id, world_version)
    REFERENCES world_versions (world_id, world_version) ON DELETE CASCADE,
  CONSTRAINT world_assets_kind_check CHECK (kind IN ('cover', 'background', 'portrait')),
  -- Portrait wajib punya pemilik dan ekspresi; aset lain tidak boleh punya.
  CONSTRAINT world_assets_portrait_shape CHECK (
    (kind = 'portrait' AND npc_id IS NOT NULL AND expression IS NOT NULL)
    OR (kind <> 'portrait' AND npc_id IS NULL AND expression IS NULL)
  )
);

-- ------------------------------------------------------------------
-- Perjalanan
-- ------------------------------------------------------------------

CREATE TABLE journeys (
  journey_id           text PRIMARY KEY,
  account_id           text NOT NULL,
  world_id             text NOT NULL,
  -- Versi dikunci saat pembuatan; tidak pernah berubah setelahnya.
  world_version        integer NOT NULL,
  persona_name         text NOT NULL,
  persona_age          integer NOT NULL,
  response_locale      text NOT NULL,
  last_read_beat_id    text NOT NULL DEFAULT '',
  last_read_sequence   integer NOT NULL DEFAULT 0,
  decision_count       integer NOT NULL DEFAULT 0,
  has_unread_beats     boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journeys_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE,
  CONSTRAINT journeys_version_fk
    FOREIGN KEY (world_id, world_version)
    REFERENCES world_versions (world_id, world_version),
  CONSTRAINT journeys_locale_check CHECK (response_locale IN ('id-ID', 'en-US')),
  CONSTRAINT journeys_persona_age_check CHECK (persona_age >= 13 AND persona_age <= 99),
  CONSTRAINT journeys_progress_non_negative
    CHECK (last_read_sequence >= 0 AND decision_count >= 0)
);

-- MVP: satu perjalanan aktif per akun per dunia (D-12). Bila multi-slot dibuka
-- pada P1, indeks unik ini yang dicabut — bukan logika aplikasi.
CREATE UNIQUE INDEX journeys_one_active_per_world
  ON journeys (account_id, world_id);

CREATE INDEX journeys_by_account_updated
  ON journeys (account_id, updated_at DESC);

-- Hubungan awal yang ditetapkan dunia, disalin saat perjalanan dibuat.
-- Dipisahkan dari keadaan kanonik agar frontend dapat menurunkan hubungan yang
-- boleh dilihat tanpa risiko kebocoran (R-04, AC-12).
CREATE TABLE journey_relations_baseline (
  journey_id    text NOT NULL,
  npc_id        text NOT NULL,
  status        text NOT NULL,
  reason_public text NOT NULL,
  PRIMARY KEY (journey_id, npc_id),
  CONSTRAINT journey_baseline_journey_fk
    FOREIGN KEY (journey_id) REFERENCES journeys (journey_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------
-- Turn dan beat
-- ------------------------------------------------------------------

-- Operasi idempotent (FR-52). Satu operation_id menghasilkan tepat satu efek.
CREATE TABLE operations (
  operation_id  text PRIMARY KEY,
  account_id    text NOT NULL,
  journey_id    text,
  kind          text NOT NULL,
  state         text NOT NULL,
  -- Envelope hasil disimpan apa adanya agar pengulangan mengembalikan hal yang sama.
  result        jsonb,
  error_code    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CONSTRAINT operations_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE,
  CONSTRAINT operations_kind_check
    CHECK (kind IN ('create_journey', 'submit_choice', 'submit_custom', 'compaction')),
  CONSTRAINT operations_state_check
    CHECK (state IN ('running', 'succeeded', 'failed'))
);

CREATE TABLE turns (
  turn_id          text PRIMARY KEY,
  journey_id       text NOT NULL,
  revision         integer NOT NULL,
  operation_id     text NOT NULL,
  -- Jenis masukan pemain; null untuk giliran pembuka.
  input_kind       text,
  input_option_id  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turns_journey_fk
    FOREIGN KEY (journey_id) REFERENCES journeys (journey_id) ON DELETE CASCADE,
  CONSTRAINT turns_operation_fk
    FOREIGN KEY (operation_id) REFERENCES operations (operation_id),
  CONSTRAINT turns_input_kind_check
    CHECK (input_kind IS NULL OR input_kind IN ('option', 'custom', 'opening')),
  CONSTRAINT turns_revision_positive CHECK (revision >= 1)
);

-- Satu operasi hanya boleh menghasilkan satu turn.
CREATE UNIQUE INDEX turns_one_per_operation ON turns (operation_id);
CREATE INDEX turns_by_journey_revision ON turns (journey_id, revision);

-- Catatan beat yang tidak dapat diubah. Tidak ada UPDATE atau DELETE di sini.
CREATE TABLE beats (
  beat_id   text PRIMARY KEY,
  turn_id   text NOT NULL,
  journey_id text NOT NULL,
  -- Urutan menaik di dalam satu turn. Dimulai dari 1 pada setiap turn.
  sequence  integer NOT NULL,
  event     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beats_turn_fk
    FOREIGN KEY (turn_id) REFERENCES turns (turn_id) ON DELETE CASCADE,
  CONSTRAINT beats_journey_fk
    FOREIGN KEY (journey_id) REFERENCES journeys (journey_id) ON DELETE CASCADE,
  CONSTRAINT beats_sequence_positive CHECK (sequence >= 1),
  CONSTRAINT beats_unique_sequence UNIQUE (turn_id, sequence)
);

CREATE INDEX beats_by_journey ON beats (journey_id, created_at, sequence);

-- ------------------------------------------------------------------
-- Kuota dan pemakaian
-- ------------------------------------------------------------------

-- Satu baris per akun per hari UTC. Reset harian tidak memerlukan cron: baris
-- hari baru dibuat saat pemakaian pertama hari itu (docs/14 bagian 5).
CREATE TABLE usage_days (
  account_id    text NOT NULL,
  -- Tanggal UTC dalam bentuk YYYY-MM-DD.
  usage_date    text NOT NULL,
  tier          text NOT NULL DEFAULT 'free',
  spent_tokens  bigint NOT NULL DEFAULT 0,
  reserved_tokens bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, usage_date),
  CONSTRAINT usage_days_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE,
  CONSTRAINT usage_days_tier_check CHECK (tier IN ('free', 'paid')),
  CONSTRAINT usage_days_non_negative
    CHECK (spent_tokens >= 0 AND reserved_tokens >= 0)
);

-- Buku besar pemakaian per operasi. Satu operasi tidak boleh ditagih dua kali.
CREATE TABLE usage_entries (
  entry_id      text PRIMARY KEY,
  account_id    text NOT NULL,
  usage_date    text NOT NULL,
  operation_id  text NOT NULL,
  prompt_tokens integer NOT NULL,
  completion_tokens integer NOT NULL,
  charged_total integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_entries_day_fk
    FOREIGN KEY (account_id, usage_date)
    REFERENCES usage_days (account_id, usage_date) ON DELETE CASCADE,
  CONSTRAINT usage_entries_operation_fk
    FOREIGN KEY (operation_id) REFERENCES operations (operation_id),
  CONSTRAINT usage_entries_non_negative
    CHECK (prompt_tokens >= 0 AND completion_tokens >= 0 AND charged_total >= 0)
);

-- Inilah yang membuat penagihan ganda tidak mungkin, bukan sekadar tidak mungkin
-- secara kebiasaan.
CREATE UNIQUE INDEX usage_entries_one_per_operation
  ON usage_entries (operation_id);

-- ------------------------------------------------------------------
-- Laporan
-- ------------------------------------------------------------------

CREATE TABLE reports (
  report_id    text PRIMARY KEY,
  account_id   text NOT NULL,
  journey_id   text,
  beat_id      text,
  category     text NOT NULL,
  detail       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE,
  CONSTRAINT reports_journey_fk
    FOREIGN KEY (journey_id) REFERENCES journeys (journey_id) ON DELETE SET NULL,
  CONSTRAINT reports_category_check
    CHECK (category IN ('story', 'character', 'asset', 'relationship', 'content', 'technical'))
);

CREATE INDEX reports_by_account ON reports (account_id, created_at DESC);
