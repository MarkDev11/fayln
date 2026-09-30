-- Data rujukan demo.
--
-- PENTING: ini BUKAN konten produksi. Isinya sengaja dicocokkan dengan fixture
-- frontend (`frontend/src/data/mock/fixtures.ts`) supaya kedua sisi dapat diuji
-- terhadap katalog yang sama. Sebelum rilis, dunia-dunia ini diganti dengan
-- konten kurator, dan baris akun demo dihapus.
--
-- Aset memakai skema internal `asset://` karena gambar belum ada. Ini disengaja:
-- tidak ada URL CDN palsu yang dikarang.

-- ------------------------------------------------------------------
-- Akun demo
-- ------------------------------------------------------------------

INSERT INTO accounts (account_id, display_name, age) VALUES
  ('acc_demo', 'Arfan', 24);

-- ------------------------------------------------------------------
-- Dunia 1 — demo utama
-- ------------------------------------------------------------------

INSERT INTO worlds (world_id) VALUES ('w_bosku-mantan');

INSERT INTO world_versions (
  world_id, world_version, title, synopsis, premise,
  cover_asset_id, status, content_rating, published_at
) VALUES (
  'w_bosku-mantan', 7,
  'Bosku Adalah Mantan Pacarku di Kampus Dulu',
  'Hari pertama kerja di perusahaan AAA mempertemukanmu kembali dengan seseorang yang pernah kau kenal baik — kini ia atasanmu.',
  'Protagonis memulai pekerjaan pertama di perusahaan AAA. Elysia, mantan dari masa kampus, kini menjadi atasannya. Leo, sahabat keduanya, bekerja di tim yang sama.',
  'a_cover_kantor', 'published', '18_plus', now()
);

INSERT INTO world_genres (world_id, world_version, genre) VALUES
  ('w_bosku-mantan', 7, 'romance'),
  ('w_bosku-mantan', 7, 'drama'),
  ('w_bosku-mantan', 7, 'office');

INSERT INTO world_response_locales (world_id, world_version, locale) VALUES
  ('w_bosku-mantan', 7, 'id-ID'),
  ('w_bosku-mantan', 7, 'en-US');

INSERT INTO world_locations (world_id, world_version, location_id, label, position) VALUES
  ('w_bosku-mantan', 7, 'loc_gedung_luar', 'Luar Gedung AAA', 1),
  ('w_bosku-mantan', 7, 'loc_kantor_dalam', 'Interior Kantor', 2),
  ('w_bosku-mantan', 7, 'loc_ruang_rapat', 'Ruang Rapat Kecil', 3);

INSERT INTO world_characters (
  world_id, world_version, npc_id, name, role,
  public_backstory, initial_relation, default_portrait_asset_id, position
) VALUES
  ('w_bosku-mantan', 7, 'npc_elysia', 'Elysia', 'Atasan langsung',
   'Elysia memimpin tim operasional dan dikenal menuntut standar tinggi. Ia mengenal protagonis dari masa kuliah, sebuah bab yang tidak pernah ia bahas di kantor.',
   'normal', 'p_elysia_netral', 1),
  ('w_bosku-mantan', 7, 'npc_leo', 'Leo', 'Rekan senior',
   'Leo sudah tiga tahun di tim yang sama dan mengenal Elysia maupun protagonis sejak masa kuliah. Ia satu-satunya orang yang berani menggoda keduanya.',
   'normal', 'p_leo_netral', 2);

INSERT INTO world_character_traits (world_id, world_version, npc_id, position, trait) VALUES
  ('w_bosku-mantan', 7, 'npc_elysia', 1, 'Tegas'),
  ('w_bosku-mantan', 7, 'npc_elysia', 2, 'Menjaga batas profesional'),
  ('w_bosku-mantan', 7, 'npc_elysia', 3, 'Sinis bila terusik'),
  ('w_bosku-mantan', 7, 'npc_leo', 1, 'Santai'),
  ('w_bosku-mantan', 7, 'npc_leo', 2, 'Peka suasana'),
  ('w_bosku-mantan', 7, 'npc_leo', 3, 'Suka menengahi');

INSERT INTO world_character_expressions (world_id, world_version, npc_id, position, expression) VALUES
  ('w_bosku-mantan', 7, 'npc_elysia', 1, 'netral'),
  ('w_bosku-mantan', 7, 'npc_elysia', 2, 'kesal'),
  ('w_bosku-mantan', 7, 'npc_elysia', 3, 'tercengang'),
  ('w_bosku-mantan', 7, 'npc_elysia', 4, 'tersenyum_tipis'),
  ('w_bosku-mantan', 7, 'npc_leo', 1, 'senang'),
  ('w_bosku-mantan', 7, 'npc_leo', 2, 'netral'),
  ('w_bosku-mantan', 7, 'npc_leo', 3, 'bingung');

INSERT INTO world_assets (world_id, world_version, asset_id, kind, label, uri, npc_id, expression, position) VALUES
  ('w_bosku-mantan', 7, 'a_cover_kantor', 'cover', 'Kantor AAA', 'asset://a_cover_kantor', NULL, NULL, 1),
  ('w_bosku-mantan', 7, 'bg_gedung_luar', 'background', 'Luar Gedung AAA', 'asset://bg_gedung_luar', NULL, NULL, 1),
  ('w_bosku-mantan', 7, 'bg_kantor_dalam', 'background', 'Interior Kantor', 'asset://bg_kantor_dalam', NULL, NULL, 2),
  ('w_bosku-mantan', 7, 'bg_ruang_rapat', 'background', 'Ruang Rapat Kecil', 'asset://bg_ruang_rapat', NULL, NULL, 3),
  ('w_bosku-mantan', 7, 'p_elysia_netral', 'portrait', 'Elysia — netral', 'asset://p_elysia_netral', 'npc_elysia', 'netral', 1),
  ('w_bosku-mantan', 7, 'p_elysia_kesal', 'portrait', 'Elysia — kesal', 'asset://p_elysia_kesal', 'npc_elysia', 'kesal', 2),
  ('w_bosku-mantan', 7, 'p_elysia_tercengang', 'portrait', 'Elysia — tercengang', 'asset://p_elysia_tercengang', 'npc_elysia', 'tercengang', 3),
  ('w_bosku-mantan', 7, 'p_elysia_tersenyum_tipis', 'portrait', 'Elysia — senyum tipis', 'asset://p_elysia_tersenyum_tipis', 'npc_elysia', 'tersenyum_tipis', 4),
  ('w_bosku-mantan', 7, 'p_leo_netral', 'portrait', 'Leo — netral', 'asset://p_leo_netral', 'npc_leo', 'netral', 5),
  ('w_bosku-mantan', 7, 'p_leo_senang', 'portrait', 'Leo — senang', 'asset://p_leo_senang', 'npc_leo', 'senang', 6),
  ('w_bosku-mantan', 7, 'p_leo_bingung', 'portrait', 'Leo — bingung', 'asset://p_leo_bingung', 'npc_leo', 'bingung', 7);

-- ------------------------------------------------------------------
-- Dunia 2 — Lentera Terakhir
-- ------------------------------------------------------------------

INSERT INTO worlds (world_id) VALUES ('w_lentera-terakhir');

INSERT INTO world_versions (
  world_id, world_version, title, synopsis, premise,
  cover_asset_id, status, content_rating, published_at
) VALUES (
  'w_lentera-terakhir', 3,
  'Lentera Terakhir di Ujung Desa',
  'Sebuah desa kehilangan cahayanya satu per satu. Kau satu-satunya yang masih bisa menyalakan lentera.',
  'Setiap malam satu lentera di desa padam. Penjaga lentera terakhir harus mencari sebabnya sebelum desa kehilangan cahaya sepenuhnya.',
  'a_cover_lentera', 'published', '13_plus', now()
);

INSERT INTO world_genres (world_id, world_version, genre) VALUES
  ('w_lentera-terakhir', 3, 'fantasy'),
  ('w_lentera-terakhir', 3, 'mystery');

INSERT INTO world_response_locales (world_id, world_version, locale) VALUES
  ('w_lentera-terakhir', 3, 'id-ID');

INSERT INTO world_locations (world_id, world_version, location_id, label, position) VALUES
  ('w_lentera-terakhir', 3, 'loc_alun_alun', 'Alun-Alun Desa', 1);

INSERT INTO world_characters (
  world_id, world_version, npc_id, name, role,
  public_backstory, initial_relation, default_portrait_asset_id, position
) VALUES (
  'w_lentera-terakhir', 3, 'npc_penjaga', 'Penjaga Lentera', 'Mentor',
  'Ia menjaga lentera desa sejak lama dan menyimpan catatan yang tidak dibaca siapa pun.',
  'normal', 'p_penjaga_netral', 1
);

INSERT INTO world_character_traits (world_id, world_version, npc_id, position, trait) VALUES
  ('w_lentera-terakhir', 3, 'npc_penjaga', 1, 'Pendiam'),
  ('w_lentera-terakhir', 3, 'npc_penjaga', 2, 'Hati-hati');

INSERT INTO world_character_expressions (world_id, world_version, npc_id, position, expression) VALUES
  ('w_lentera-terakhir', 3, 'npc_penjaga', 1, 'netral'),
  ('w_lentera-terakhir', 3, 'npc_penjaga', 2, 'khawatir');

INSERT INTO world_assets (world_id, world_version, asset_id, kind, label, uri, npc_id, expression, position) VALUES
  ('w_lentera-terakhir', 3, 'a_cover_lentera', 'cover', 'Lentera Desa', 'asset://a_cover_lentera', NULL, NULL, 1),
  ('w_lentera-terakhir', 3, 'bg_alun_alun', 'background', 'Alun-Alun Desa', 'asset://bg_alun_alun', NULL, NULL, 1),
  ('w_lentera-terakhir', 3, 'p_penjaga_netral', 'portrait', 'Penjaga — netral', 'asset://p_penjaga_netral', 'npc_penjaga', 'netral', 2);

-- ------------------------------------------------------------------
-- Dunia 3 — Rapat Tengah Malam
-- ------------------------------------------------------------------

INSERT INTO worlds (world_id) VALUES ('w_rapat-tengah-malam');

INSERT INTO world_versions (
  world_id, world_version, title, synopsis, premise,
  cover_asset_id, status, content_rating, published_at
) VALUES (
  'w_rapat-tengah-malam', 1,
  'Rapat Tengah Malam',
  'Rapat pukul dua pagi terasa aneh. Tak ada siapa pun yang mengirim undangan itu.',
  'Kantor mengadakan rapat tengah malam yang tidak pernah dijadwalkan siapa pun.',
  'a_cover_rapat', 'published', '13_plus', now()
);

INSERT INTO world_genres (world_id, world_version, genre) VALUES
  ('w_rapat-tengah-malam', 1, 'mystery'),
  ('w_rapat-tengah-malam', 1, 'office');

INSERT INTO world_response_locales (world_id, world_version, locale) VALUES
  ('w_rapat-tengah-malam', 1, 'id-ID'),
  ('w_rapat-tengah-malam', 1, 'en-US');

INSERT INTO world_locations (world_id, world_version, location_id, label, position) VALUES
  ('w_rapat-tengah-malam', 1, 'loc_ruang_rapat_besar', 'Ruang Rapat Besar', 1);

INSERT INTO world_characters (
  world_id, world_version, npc_id, name, role,
  public_backstory, initial_relation, default_portrait_asset_id, position
) VALUES (
  'w_rapat-tengah-malam', 1, 'npc_rekan_baru', 'Rekan Baru', 'Rekan sekantor',
  'Ia ikut rapat itu dan sejak malam tersebut tidak mau membicarakannya.',
  'normal', 'p_rekan_cemas', 1
);

INSERT INTO world_character_traits (world_id, world_version, npc_id, position, trait) VALUES
  ('w_rapat-tengah-malam', 1, 'npc_rekan_baru', 1, 'Cemas'),
  ('w_rapat-tengah-malam', 1, 'npc_rekan_baru', 2, 'Detail');

INSERT INTO world_character_expressions (world_id, world_version, npc_id, position, expression) VALUES
  ('w_rapat-tengah-malam', 1, 'npc_rekan_baru', 1, 'cemas'),
  ('w_rapat-tengah-malam', 1, 'npc_rekan_baru', 2, 'netral');

INSERT INTO world_assets (world_id, world_version, asset_id, kind, label, uri, npc_id, expression, position) VALUES
  ('w_rapat-tengah-malam', 1, 'a_cover_rapat', 'cover', 'Ruang Rapat', 'asset://a_cover_rapat', NULL, NULL, 1),
  ('w_rapat-tengah-malam', 1, 'bg_ruang_rapat_besar', 'background', 'Ruang Rapat Besar', 'asset://bg_ruang_rapat_besar', NULL, NULL, 1),
  ('w_rapat-tengah-malam', 1, 'p_rekan_cemas', 'portrait', 'Rekan — cemas', 'asset://p_rekan_cemas', 'npc_rekan_baru', 'cemas', 2);

-- ------------------------------------------------------------------
-- Dunia 4 — terarsip (dipakai menguji state retired, AC-04)
-- ------------------------------------------------------------------

INSERT INTO worlds (world_id) VALUES ('w_arsip-lama');

INSERT INTO world_versions (
  world_id, world_version, title, synopsis, premise,
  cover_asset_id, status, content_rating, published_at
) VALUES (
  'w_arsip-lama', 2,
  'Musim Panas yang Tertunda',
  'Cerita ini sudah diarsipkan kurator dan tidak dapat dimulai lagi.',
  'Arsip.',
  'a_cover_arsip', 'retired', '13_plus', now()
);

INSERT INTO world_genres (world_id, world_version, genre) VALUES
  ('w_arsip-lama', 2, 'drama');

INSERT INTO world_response_locales (world_id, world_version, locale) VALUES
  ('w_arsip-lama', 2, 'id-ID');

INSERT INTO world_assets (world_id, world_version, asset_id, kind, label, uri, npc_id, expression, position) VALUES
  ('w_arsip-lama', 2, 'a_cover_arsip', 'cover', 'Arsip', 'asset://a_cover_arsip', NULL, NULL, 1);
