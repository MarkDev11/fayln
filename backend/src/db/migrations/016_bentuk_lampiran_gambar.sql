-- Bentuk lampiran gambar per provider.
--
-- ---------------------------------------------------------------------------
-- MENGAPA KOLOM INI ADA
-- ---------------------------------------------------------------------------
-- Penyedia "OpenAI-compatible" TIDAK seragam dalam satu hal yang menentukan:
-- bagaimana gambar dilampirkan pada pesan.
--
--   OpenAI dan sebagian besar gateway:
--     {"type":"image_url","image_url":{"url":"data:image/webp;base64,..."}}
--
--   Mistral:
--     {"type":"image_url","image_url":"data:image/webp;base64,..."}
--
-- Bedanya hanya satu tingkat pembungkusan, dan salah pilih TIDAK menghasilkan
-- galat: Mistral membuang bagian yang bentuknya tidak dikenali, lalu modelnya
-- menjawab "tidak ada gambar yang diberikan". Gejalanya menyesatkan ke arah yang
-- salah sama sekali — tampak seperti gambar yang gagal diunggah atau model yang
-- tidak mendukung visi, padahal gambarnya terkirim dengan bentuk yang salah.
--
-- Ini terjadi pada 6 Oktober 2026: 20 gambar diunggah, semuanya gagal, dan
-- jawaban modelnya baru menunjukkan sebabnya setelah pesan galat diperbaiki
-- untuk menampilkan alasan dari model.
--
-- Karena tidak ada bentuk yang diterima keduanya, pilihannya disimpan per
-- provider dan diisi admin. Nilai bawaan 'object' karena itulah bentuk yang
-- dipakai OpenAI dan mayoritas gateway.
--
-- Catatan pg-mem: `CHECK` dengan daftar nilai didukung (dipakai sejak 004).

ALTER TABLE providers ADD COLUMN image_part text NOT NULL DEFAULT 'object';

ALTER TABLE providers ADD CONSTRAINT providers_image_part_check
  CHECK (image_part IN ('object', 'string'));
