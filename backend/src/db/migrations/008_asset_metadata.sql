-- Metadata aset: gambar unggahan, titik fokus, kekuatan blur, dan keterangan.
--
-- Sebelumnya `world_assets` hanya menyimpan `label` dan `uri`. Wizard "Dunia
-- baru" memerlukan empat hal yang belum punya tempat:
--
--   1. `media_id` — menunjuk berkas yang diunggah. `uri` tetap dipertahankan
--      untuk aset lama yang dibakar ke dalam image, jadi keduanya hidup
--      berdampingan selama masa peralihan.
--   2. `description` dan `usage_note` — keterangan yang dibaca manusia dan
--      mesin cerita, mis. "Aula kantor" dan "banyak orang lalu lalang".
--   3. `encounter_likelihood` — contoh pemakaian yang diberikan pemilik proyek
--      ("ratenya gede disini") bukan sekadar prosa: itu SINYAL BERDABANG yang
--      akan dipakai mesin cerita. Apa pun yang dipakai untuk bercabang harus
--      terstruktur; prosa hanya untuk model bahasa. Karena itu ia kolom sendiri,
--      bukan diselipkan ke dalam `usage_note`.
--   4. `blur_strength` + `focal_x`/`focal_y` — disimpan sebagai NILAI, bukan
--      dibakar ke piksel. Alasannya: hasilnya tetap dapat disunting ulang, dan
--      satu berkas tetap tajam untuk keperluan lain.
--
-- MENGAPA normalisasi, bukan piksel:
--   - `focal_x`/`focal_y` disimpan 0..1 terhadap gambar TERSIMPAN. Piksel akan
--     langsung salah begitu klien memperkecil gambar sebelum mengunggah.
--   - `blur_strength` 0..100 adalah kekuatan, bukan piksel. `filter: blur()` di
--     CSS dan `blurRadius` di React Native berbeda SATUAN sekaligus ALGORITME,
--     jadi satu angka dalam piksel mustahil cocok di keduanya. Pemetaan ke
--     masing-masing platform dilakukan di sisi klien dari satu nilai ini.
ALTER TABLE world_assets ADD COLUMN media_id             text;
ALTER TABLE world_assets ADD COLUMN description          text NOT NULL DEFAULT '';
ALTER TABLE world_assets ADD COLUMN usage_note           text NOT NULL DEFAULT '';
ALTER TABLE world_assets ADD COLUMN encounter_likelihood text;
ALTER TABLE world_assets ADD COLUMN blur_strength        smallint NOT NULL DEFAULT 0;
ALTER TABLE world_assets ADD COLUMN focal_x              double precision NOT NULL DEFAULT 0.5;
ALTER TABLE world_assets ADD COLUMN focal_y              double precision NOT NULL DEFAULT 0.5;
ALTER TABLE world_assets ADD COLUMN width                integer;
ALTER TABLE world_assets ADD COLUMN height               integer;

ALTER TABLE world_assets ADD CONSTRAINT world_assets_likelihood_check
  CHECK (encounter_likelihood IS NULL
         OR encounter_likelihood IN ('none', 'low', 'medium', 'high'));

ALTER TABLE world_assets ADD CONSTRAINT world_assets_blur_check
  CHECK (blur_strength >= 0 AND blur_strength <= 100);

ALTER TABLE world_assets ADD CONSTRAINT world_assets_focal_check
  CHECK (focal_x >= 0 AND focal_x <= 1 AND focal_y >= 0 AND focal_y <= 1);

-- Pencarian "aset ini dipakai berapa versi" berjalan di setiap halaman aset.
CREATE INDEX world_assets_media_idx ON world_assets (media_id);
