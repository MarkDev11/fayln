-- 006 — Waktu terbit dan waktu revisi yang bervariasi pada data contoh.
--
-- MENGAPA INI PERLU
--
-- Seed `002_seed_reference.sql` menyisipkan seluruh dunia dalam satu transaksi
-- dengan `published_at = now()`. Akibatnya semua dunia punya tanggal terbit yang
-- IDENTIK, dan urutan rail "Terbaru Dirilis" tidak membawa informasi apa pun —
-- ia jatuh ke tie-break `world_id`, yang praktis berarti urut abjad. Hal yang
-- sama berlaku untuk `created_at` versi.
--
-- Migrasi ini memberi tiap dunia garis waktu yang berbeda, sekaligus membuat
-- perbedaan dua rail TERLIHAT:
--
--   w_bosku-mantan       terbit lama (90 hari), BARU direvisi (2 hari)
--                        -> memuncaki "Baru Diperbarui", TIDAK di "Terbaru Dirilis"
--   w_rapat-tengah-malam baru terbit (5 hari), revisi pertama
--                        -> memuncaki "Terbaru Dirilis"
--
-- Bila kelak kedua rail kembali menampilkan daftar yang sama, data inilah yang
-- akan membuat kekembaran itu terlihat — tanpa itu, dua rail yang kembar dan
-- dua rail yang benar-benar berbeda akan tampak serupa.
--
-- `created_at` versi adalah waktu versi itu dibuat, yaitu saat terakhir isinya
-- disunting. Menyunting dunia terbit memang membuat baris versi baru, jadi
-- kolom ini memang mencatat revisi terakhir — tidak perlu kolom tambahan.
--
-- Hanya dunia contoh yang disentuh, dan `w_arsip-lama` sengaja dibiarkan:
-- statusnya `retired`, jadi ia tidak muncul di rail mana pun.

UPDATE world_versions
   SET published_at = now() - interval '90 days',
       created_at   = now() - interval '2 days'
 WHERE world_id = 'w_bosku-mantan';

UPDATE world_versions
   SET published_at = now() - interval '40 days',
       created_at   = now() - interval '20 days'
 WHERE world_id = 'w_lentera-terakhir';

UPDATE world_versions
   SET published_at = now() - interval '5 days',
       created_at   = now() - interval '5 days'
 WHERE world_id = 'w_rapat-tengah-malam';
