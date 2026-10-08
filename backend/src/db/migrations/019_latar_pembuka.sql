-- Latar pembuka dunia: lokasi tempat cerita dimulai.
--
-- ---------------------------------------------------------------------------
-- MENGAPA KOLOM INI ADA
-- ---------------------------------------------------------------------------
-- Mesin cerita harus memilih SATU latar untuk adegan pembuka, dan ia tidak punya
-- cara mengetahui latar mana yang benar: ia tidak memahami gambar, dan narasinya
-- jarang menyebut nama lokasi secara harfiah.
--
-- Dua percobaan sebelumnya gagal, dan keduanya terlihat di produksi:
--
--   1. `backgrounds[0]` — entri pertama menurut urutan MASTER. Adegan kantor
--      tampil dengan latar "Balkon Apartemen Saat Senja".
--   2. Pencocokan kata antara label dan narasi. Kata umum seperti "ruang" muncul
--      di narasi ("ruang terbuka") DAN di label ("Ruang Kelas Penuh Cahaya"),
--      sehingga kecocokan palsu mengalahkan kecocokan yang benar — atau, bila
--      tidak ada yang cocok, ia kembali ke entri pertama.
--
-- Keduanya TEBAKAN. Hanya admin yang tahu adegan pembukanya di mana, jadi
-- pilihannya disimpan di sini.
--
-- ---------------------------------------------------------------------------
-- CATATAN pg-mem
-- ---------------------------------------------------------------------------
-- Kolomnya NULLABLE: dunia yang sudah ada belum memilih, dan menolak baris lama
-- berarti membuat basis data produksi tidak dapat dimigrasikan. Mesin cerita
-- memakai pencocokan kata sebagai CADANGAN selama kolom ini kosong — tidak lebih
-- baik dari sebelumnya, tetapi tidak lebih buruk, dan admin dapat memperbaikinya
-- kapan saja.
--
-- ON DELETE RESTRICT mengikuti aturan yang sama dengan kolom master lainnya:
-- lokasi yang masih dipakai sebuah dunia tidak boleh dihapus diam-diam.

ALTER TABLE world_versions ADD COLUMN opening_location_id text;

ALTER TABLE world_versions ADD CONSTRAINT world_versions_opening_location_fk
  FOREIGN KEY (opening_location_id) REFERENCES locations (location_id)
  ON DELETE RESTRICT;
