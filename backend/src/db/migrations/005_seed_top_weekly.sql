-- fayLN — data contoh untuk rail "Top 10 Minggu Ini".
--
-- MENGAPA ADA
-- Rail "Top 10 Minggu Ini" dihitung dari jumlah perjalanan yang dimulai per dunia
-- dalam 7 hari terakhir. Tanpa baris `journeys`, rail itu selalu kosong dan tidak
-- dapat diperiksa sama sekali — tidak oleh pengujian, tidak oleh mata.
--
-- Seperti `002_seed_reference.sql`, isi berkas ini adalah DATA DEMO, bukan konten
-- produksi. Ia ada supaya bentuk respons dan tampilan rail dapat dibuktikan.
--
-- AKURASI YANG SENGAJA DIPERTAHANKAN
-- Angka yang muncul di rail adalah hasil hitungan sungguhan atas baris di bawah,
-- bukan angka yang ditulis langsung ke respons. Jadi bila rumusnya salah, rail
-- akan menampilkan angka yang salah — dan itu memang tujuannya. Menulis angka
-- langsung ke respons akan menyembunyikan kesalahan rumus.
--
-- Distribusinya sengaja tidak rata: w_bosku-mantan paling banyak, w_lentera-terakhir
-- nomor dua, w_rapat-tengah-malam paling sedikit. Urutan yang tidak seragam membuat
-- pengurutan benar-benar teruji; bila semuanya sama banyak, urutan yang salah pun
-- akan tampak benar.
--
-- IDEMPOTEN: seluruh pernyataan memakai `ON CONFLICT DO NOTHING`, sehingga migrasi
-- ini aman meski dijalankan pada basis data yang sudah memuat sebagian barisnya.

-- Index pendukung: rail menghitung COUNT(*) yang dikelompokkan per dunia dengan
-- saringan waktu. Index ini membuat penghitungan itu tidak memindai seluruh tabel
-- saat jumlah perjalanan bertambah.
CREATE INDEX IF NOT EXISTS journeys_by_world_created
  ON journeys (world_id, created_at DESC);

-- ------------------------------------------------------------------
-- Akun demo untuk perjalanan contoh
-- ------------------------------------------------------------------
--
-- Dibuat terpisah dari `acc_demo` karena satu akun hanya boleh punya SATU
-- perjalanan aktif per dunia (`journeys_one_active_per_world`, D-12). Tanpa akun
-- tambahan, mustahil membuat lebih dari tiga perjalanan untuk membuktikan
-- pengurutan.
--
-- Akun-akun ini tidak dipakai layar mana pun; ia hanya pemilik baris perjalanan.

INSERT INTO accounts (account_id, display_name, age) VALUES
  ('acc_seed_top_1', 'Contoh Top 1', 24),
  ('acc_seed_top_2', 'Contoh Top 2', 25),
  ('acc_seed_top_3', 'Contoh Top 3', 26),
  ('acc_seed_top_4', 'Contoh Top 4', 27),
  ('acc_seed_top_5', 'Contoh Top 5', 28),
  ('acc_seed_top_6', 'Contoh Top 6', 29),
  ('acc_seed_top_7', 'Contoh Top 7', 30),
  ('acc_seed_top_8', 'Contoh Top 8', 31),
  ('acc_seed_top_9', 'Contoh Top 9', 32)
ON CONFLICT (account_id) DO NOTHING;

-- ------------------------------------------------------------------
-- Perjalanan contoh
-- ------------------------------------------------------------------
--
-- Tanggal dibuat memakai `now() - interval`, BUKAN tanggal tetap. Alasannya:
-- saringan rail adalah "7 hari terakhir dari sekarang". Tanggal tetap akan
-- kedaluwarsa dan rail kembali kosong beberapa hari setelah berkas ini ditulis.
-- Dengan bentuk relatif, data contoh selalu segar berapa pun lama basis data
-- dibiarkan berjalan.
--
-- Rentangnya dijaga di dalam 7 hari (0–6 hari lalu) supaya setiap baris memang
-- termasuk dalam jendela mingguan yang dihitung rail.
--
-- Versi dunia diambil dari versi TERBIT yang ada di `002_seed_reference.sql`.
-- Karena berkas itu tidak diubah, versinya tetap: w_bosku-mantan=7,
-- w_lentera-terakhir=3, w_rapat-tengah-malam=1.

INSERT INTO journeys (
  journey_id, account_id, world_id, world_version,
  persona_name, persona_age, response_locale, created_at, updated_at
) VALUES
  -- w_bosku-mantan — 4 perjalanan (peringkat 1)
  ('j_seed_top_01', 'acc_seed_top_1', 'w_bosku-mantan', 7, 'Kirana', 24, 'id-ID',
   now() - interval '0 days', now() - interval '0 days'),
  ('j_seed_top_02', 'acc_seed_top_2', 'w_bosku-mantan', 7, 'Damar',  25, 'id-ID',
   now() - interval '1 days', now() - interval '1 days'),
  ('j_seed_top_03', 'acc_seed_top_3', 'w_bosku-mantan', 7, 'Sari',   26, 'id-ID',
   now() - interval '3 days', now() - interval '3 days'),
  ('j_seed_top_04', 'acc_seed_top_4', 'w_bosku-mantan', 7, 'Bima',   27, 'id-ID',
   now() - interval '6 days', now() - interval '6 days'),

  -- w_lentera-terakhir — 2 perjalanan (peringkat 2)
  ('j_seed_top_05', 'acc_seed_top_5', 'w_lentera-terakhir', 3, 'Nara',  28, 'id-ID',
   now() - interval '2 days', now() - interval '2 days'),
  ('j_seed_top_06', 'acc_seed_top_6', 'w_lentera-terakhir', 3, 'Ayu',   29, 'id-ID',
   now() - interval '5 days', now() - interval '5 days'),

  -- w_rapat-tengah-malam — 1 perjalanan (peringkat 3)
  ('j_seed_top_07', 'acc_seed_top_7', 'w_rapat-tengah-malam', 1, 'Rian', 30, 'id-ID',
   now() - interval '4 days', now() - interval '4 days')
ON CONFLICT (journey_id) DO NOTHING;

-- ------------------------------------------------------------------
-- Perjalanan DI LUAR jendela mingguan
-- ------------------------------------------------------------------
--
-- Dua baris ini sengaja lebih tua dari 7 hari. Gunanya sebagai pengontrol: bila
-- saringan waktu rail salah dihapus, w_rapat-tengah-malam akan naik ke peringkat 1
-- (3 perjalanan, mengalahkan w_lentera-terakhir yang hanya 2). Dengan begitu,
-- kesalahan "lupa menyaring waktu" langsung terlihat sebagai urutan yang berubah —
-- bukan sebagai test yang lolos padahal rusak.

INSERT INTO journeys (
  journey_id, account_id, world_id, world_version,
  persona_name, persona_age, response_locale, created_at, updated_at
) VALUES
  ('j_seed_old_01', 'acc_seed_top_8', 'w_rapat-tengah-malam', 1, 'Tirta', 31, 'id-ID',
   now() - interval '20 days', now() - interval '20 days'),
  ('j_seed_old_02', 'acc_seed_top_9', 'w_rapat-tengah-malam', 1, 'Wulan', 32, 'id-ID',
   now() - interval '45 days', now() - interval '45 days')
ON CONFLICT (journey_id) DO NOTHING;
