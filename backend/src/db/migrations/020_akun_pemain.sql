-- Akun pemain: kredensial dan sesi.
--
-- ---------------------------------------------------------------------------
-- MENGAPA INI ADA
-- ---------------------------------------------------------------------------
-- Sebelum migrasi ini, identitas pemain ditentukan oleh header `x-account-id`
-- yang DIKIRIM KLIEN. Server mempercayainya apa adanya. Akibatnya bukan sekadar
-- teoretis: dengan mengetik id akun orang lain di header, siapa pun dapat membaca
-- seluruh perjalanan akun itu. Sudah dibuktikan langsung terhadap produksi
-- 9 Oktober 2026 — satu permintaan `GET /v1/journeys` dengan id akun yang bukan
-- milik pemanggil mengembalikan HTTP 200 beserta isi perjalanannya.
--
-- Karena pemain menyimpan cerita yang berbeda-beda per akun, identitas tidak
-- boleh lagi berupa klaim. Ia harus dibuktikan dengan kata sandi.
--
-- ---------------------------------------------------------------------------
-- KENAPA TABELNYA DIPISAH, BUKAN DICAMPUR KE admin_users
-- ---------------------------------------------------------------------------
-- `admin_users` adalah staf yang mengelola katalog; `accounts` adalah pemain.
-- Menyatukannya berarti satu kebocoran pada panel admin membuka seluruh akun
-- pemain, dan sebaliknya. Keduanya juga punya siklus hidup yang berbeda: admin
-- dibuat manual, pemain mendaftar sendiri.
--
-- ---------------------------------------------------------------------------
-- CATATAN pg-mem
-- ---------------------------------------------------------------------------
-- Mesin database in-memory yang dipakai pengujian tidak mendukung operator `~`
-- di dalam CHECK. Karena itu keunikan dan format email ditegakkan dengan
-- CREATE UNIQUE INDEX pada `lower(email)` (bukan CHECK), dan validasi format
-- dilakukan di kode dengan Zod. Ini mengikuti pola yang sama dengan
-- `admin_users_username_unique` di 004.

-- ---------------------------------------------------------------------------
-- Kredensial pemain
-- ---------------------------------------------------------------------------
--
-- Kolomnya NULLABLE dengan sengaja. Tabel `accounts` sudah berisi baris lama
-- (termasuk `acc_demo` dan akun-akun percobaan) yang tidak punya email maupun
-- kata sandi. Menolak baris lama berarti basis data produksi tidak dapat
-- dimigrasikan sama sekali.
--
-- Akun tanpa kredensial TIDAK dapat dipakai masuk — dan memang itu yang
-- diinginkan: perjalanan lama tetap tersimpan, tetapi tidak ada seorang pun yang
-- dapat mengklaimnya. Sesuai keputusan pemilik produk: dibiarkan, tidak
-- dipulihkan.

ALTER TABLE accounts ADD COLUMN email text;
ALTER TABLE accounts ADD COLUMN password_hash text;
ALTER TABLE accounts ADD COLUMN last_login_at timestamptz;

-- Email tidak boleh kembar, dibandingkan tanpa memandang besar-kecil huruf,
-- supaya "Budi@mail.com" dan "budi@mail.com" tidak dapat hidup berdampingan.
-- Indeks parsial: baris lama yang emailnya NULL tidak ikut dibandingkan —
-- tanpa `WHERE`, semua NULL akan dianggap berbeda di PostgreSQL (memang benar),
-- tetapi menuliskan syaratnya membuat maksudnya terbaca jelas.
CREATE UNIQUE INDEX accounts_email_unique
  ON accounts (lower(email))
  WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Sesi pemain
-- ---------------------------------------------------------------------------
--
-- Pola yang sama dengan `admin_sessions` di 004, dan alasannya sama: token yang
-- dikirim ke perangkat adalah token MENTAH, sedangkan yang disimpan di sini
-- hanya hash SHA-256-nya. Dengan begitu, isi tabel ini tidak dapat dipakai untuk
-- membajak sesi bila basis data bocor.
--
-- Masa berlaku disimpan sebagai kolom, bukan dihitung dari `created_at`, supaya
-- kebijakan "sesi berlaku N hari" dapat diubah tanpa menafsirkan ulang baris
-- yang sudah ada.
--
-- ON DELETE CASCADE: menghapus akun otomatis mencabut seluruh sesinya.

CREATE TABLE player_sessions (
  session_hash text PRIMARY KEY,
  account_id   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text NOT NULL DEFAULT '',
  CONSTRAINT player_sessions_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE
);

CREATE INDEX player_sessions_account_idx ON player_sessions (account_id);
CREATE INDEX player_sessions_expiry_idx ON player_sessions (expires_at);
