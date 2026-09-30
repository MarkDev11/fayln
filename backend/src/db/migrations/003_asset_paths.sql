-- Mengubah penanda aset internal menjadi jalur yang disajikan backend.
--
-- Sebelumnya `world_assets.uri` memakai `asset://<id>`, penanda internal yang
-- sengaja tidak dapat dimuat: pada masa itu belum ada berkas gambar sama sekali.
-- Kini backend menyajikan berkas aset pada `/assets/*`, sehingga uri diubah
-- menjadi jalur relatif.
--
-- Mengapa jalur relatif, bukan alamat lengkap:
-- baris data yang sama harus dapat dipakai di lokal, di uji, dan di produksi
-- tanpa menyimpan nama host di dalam database. Alamat dasar digabung pada saat
-- respons dibuat, dibaca dari PUBLIC_BASE_URL.

UPDATE world_assets
SET uri = CASE kind
  WHEN 'cover'      THEN '/assets/cover/'      || asset_id || '.png'
  WHEN 'background' THEN '/assets/background/' || asset_id || '.png'
  WHEN 'portrait'   THEN '/assets/portrait/'   || asset_id || '.png'
END
WHERE uri LIKE 'asset://%';
