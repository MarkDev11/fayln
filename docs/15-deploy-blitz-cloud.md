# 15 — Panduan Deploy ke blitz.cloud

> Versi 1.1 · 30 September 2026.
> Seluruh fakta platform di dokumen ini berasal dari dokumentasi resmi blitz.cloud
> yang diakses 30 September 2026. Yang belum diuji ditandai **BELUM DIUJI**.

## 0. Keadaan saat ini — SUDAH LIVE

| | |
|---|---|
| **Alamat produksi** | **https://fayln-api.marky.blitz.cloud** |
| Sumber | GitHub `MarkDev11/fayln`, cabang `main`, folder `backend` |
| Build pertama | Berhasil, commit `a9e8ff9`, selesai dalam ~4,5 menit |
| Database | PostgreSQL 17 terkelola, nama `fayln-db`, tersambung |
| `DATABASE_URL` | Diisi otomatis oleh platform saat database disambungkan |
| Deploy ulang | Otomatis pada setiap push ke `main` (`followsPushes: true`) |

Yang terbukti bekerja di produksi (30 September 2026):

- `/health` → 200 · `/health/ready` → 200, `database: "ok"`
- `/v1/worlds` → katalog dari PostgreSQL sungguhan
- Buat perjalanan → 6 beat pembuka, 18.880 token, sisa 81.120
- Aksi kabedon → Elysia menjadi `waspada` dengan alasan publik
- Kuota → 37.760 terpakai, sisa 62.240, reset `2026-10-01T00:00:00.000Z`

## 1. Ringkasan

Backend fayLN adalah satu aplikasi Docker yang menyajikan HTTP dan menyimpan seluruh
keadaan di PostgreSQL. Tidak ada state di disk, tidak ada pekerjaan terjadwal, dan tidak
ada aplikasi kedua.

```text
GitHub repo (folder project2/backend)
        │
        ▼
blitz.cloud build  ──►  image linux/amd64
        │
        ▼
   app: fayln-api  ──►  https://<nama>.blitz.cloud
        │
        ▼
   PostgreSQL 17 (terkelola, otomatis)
```

## 2. Yang sudah disiapkan di repositori

| Berkas | Kegunaan |
|---|---|
| `Dockerfile` | Dua tahap (build lalu runtime), `--platform=linux/amd64`, `USER node`, membaca `PORT`. |
| `.dockerignore` | Mencegah `node_modules`, `.env`, dan hasil tes ikut terkirim. |
| `.env.example` | Daftar variabel yang dibaca, dengan nilai bawaan. |
| `src/config.ts` | Memvalidasi variabel; hanya `DATABASE_URL` yang wajib. |

## 3. Langkah deploy

### 3.1 Unggah ke GitHub

Repositori harus memuat folder `project2/backend`. blitz.cloud dapat membangun satu folder
di dalam repositori.

### 3.2 Buat aplikasi

1. Buka `beta.blitz.cloud`, klik **Host something new**.
2. Pilih **My own code**, lalu pilih repositori.
3. Beri nama singkat, misalnya `fayln-api`. Itu menjadi `fayln-api.<nama>.blitz.cloud`.
4. Pada **Advanced settings**, isi **Folder to build** dengan `project2/backend`.
   Tanpa ini, build dimulai dari akar repositori dan tidak menemukan `package.json` yang benar.
5. Klik **Build it and put it online**.

### 3.3 Sambungkan database

1. Buat database **PostgreSQL 17** dari halaman Databases.
2. Sambungkan ke aplikasi. blitz.cloud menyuntikkan alamat koneksi; karena nama variabel
   kami tidak termasuk yang dikenali otomatis, yang diberikan adalah `DATABASE_URL` —
   dan itu memang yang dibaca `src/config.ts`.

### 3.4 Variabel lingkungan

Isi pada tab **Environment**. Hanya ini yang diperlukan:

| Variabel | Nilai | Wajib |
|---|---|---|
| `DATABASE_URL` | diisi otomatis oleh platform | ya |
| `RUN_MIGRATIONS_ON_START` | `true` | tidak (bawaan `true`) |
| `LOG_LEVEL` | `info` | tidak |
| `CORS_ORIGINS` | mis. `https://app.fayln.example` | tidak |

`PORT` **tidak perlu diisi** — platform menyuntikkannya, dan server membacanya.

Jangan isi rahasia apa pun yang tidak diperlukan. Kunci penyedia model **tidak** ditaruh
di sini sampai penyedianya diputuskan (B-01).

### 3.5 Setelah deploy

Periksa berurutan:

```text
GET /health        → 200 {"status":"ok"}
GET /health/ready  → 200 {"status":"ready","database":"ok"}
GET /v1/meta       → memuat identityMode dan storyEngine.simulator
GET /v1/worlds     → daftar dunia dari data rujukan
```

Bila `/health` menjawab tetapi `/health/ready` menjawab 503, masalahnya ada pada
penyambungan database, bukan pada aplikasi.

## 4. Perilaku platform yang harus diingat

| Perilaku | Akibat pada fayLN |
|---|---|
| **Paket gratis menidurkan aplikasi setelah 2 jam tanpa pengunjung** | Permintaan pertama setelah tidur akan lebih lambat karena proses dan pool database dibangun ulang. Ini normal, bukan kerusakan. |
| Aplikasi dibangunkan oleh permintaan berikutnya | Tidak ada data yang hilang karena seluruh keadaan ada di PostgreSQL, bukan di memori. |
| Port dipilih dari `EXPOSE` atau disuntikkan lewat `PORT` | Kode membaca `PORT`; `EXPOSE 8080` hanya cadangan. |
| Build berjalan di amd64 | `Dockerfile` memakai `--platform=linux/amd64`. |
| Maksimum 64 variabel lingkungan | Konfigurasi kami memakai paling banyak 6. |
| Folder persisten maksimum 6, 1 GB | Kami tidak memakai satu pun. |
| Versi sebelumnya dapat dipulihkan dari Activity | Migrasi database bersifat maju saja, jadi memulihkan kode lama setelah migrasi baru berjalan dapat menyebabkan ketidakcocokan skema. Perhatikan urutannya. |

## 5. Hasil verifikasi Docker — SUDAH DIUJI 30 September 2026

Diuji pada Docker Desktop 29.2.1 (Windows, x86_64, 8 CPU, 16 GB) memakai
`docker-compose.test.yml` dengan PostgreSQL 17 sungguhan.

| # | Yang diuji | Hasil |
|---|---|---|
| 1 | `docker build` untuk amd64 | **Berhasil**, 45 detik |
| 2 | Ukuran image | **355 MB** |
| 3 | Berjalan sebagai non-root | **`uid=1000(node)`** |
| 4 | `PORT` dibaca dari lingkungan container | **`PORT=8080`** |
| 5 | Migrasi di PostgreSQL 17 sungguhan | **2 migrasi diterapkan, 19 tabel dibuat** |
| 6 | Indeks unik ditegakkan | `journeys_one_active_per_world`, `turns_one_per_operation`, `usage_entries_one_per_operation` |
| 7 | `/health` dan `/health/ready` | **200**, database `ok` |
| 8 | Katalog dari PostgreSQL | 4 dunia, genre benar, filter genre 2 hasil |
| 9 | Detail dunia | Elysia + Leo, 3 latar, 7 portrait |
| 10 | Buat perjalanan | 6 beat pembuka, usage 18.880, sisa 81.120 |
| 11 | Idempotensi operation id | **Journey sama**, tidak ada duplikat |
| 12 | Baseline hubungan di sesi | **normal, normal** — anti bocor R-04 terbukti |
| 13 | Aksi kabedon | Elysia → **waspada** dengan alasan publik |
| 14 | Kuota setelah giliran | 37.760 terpakai, sisa 62.240 |
| 15 | Restart container (meniru bangun dari tidur) | **Sehat dalam ~12 detik**, data dan kuota utuh |

Butir 15 penting: membuktikan bahwa keputusan "seluruh keadaan di PostgreSQL, tanpa
pekerjaan terjadwal" benar-benar berfungsi ketika aplikasi berhenti lalu hidup lagi.

### Aset gambar — disajikan backend

Sejak commit `aeeb0ba`, backend menyajikan berkas gambar pada `/assets/*`.

| | |
|---|---|
| Lokasi berkas | `backend/assets/` — ikut ke dalam image Docker |
| Alamat | `https://fayln-api.marky.blitz.cloud/assets/<jenis>/<nama>.png` |
| Jenis | `cover/` 768×1024 · `background/` 1024×576 · `portrait/` 512×768 |
| Cara menambah | Commit lalu dorong; build ulang otomatis menyajikannya |
| Penamaan | Nama berkas **harus sama dengan `asset_id`** di `world_assets` |

Tiga keputusan di baliknya:

1. **Tidak ada mekanisme unggah.** Gambar berversi bersama kode, tidak memerlukan
   folder persisten (yang **tidak ikut dicadangkan** di paket gratis), dan terlacak
   di riwayat git.
2. **`world_assets.uri` menyimpan jalur relatif**, bukan alamat lengkap. Alamat dasar
   digabung saat respons dibuat dari `PUBLIC_BASE_URL`, sehingga baris data yang sama
   dapat dipakai di lokal, uji, dan produksi tanpa menyimpan nama host di database.
3. **Keamanan dua lapis** di `src/routes/assets.ts`: nama berkas dibatasi karakter
   aman, lalu jalur akhir diverifikasi masih berada di dalam folder aset. Lapisan
   kedua ini yang mencegah pelintasan jalur (`../`).

Terbukti di produksi: portrait, latar, dan sampul masing-masing **HTTP 200
`image/png`**; percobaan `/assets/../../../package.json` **ditolak**.

**Keadaan gambar saat ini: placeholder, bukan karya akhir.** 18 berkas yang ada
adalah bidang warna datar buatan otomatis supaya alur dapat dibuktikan. Mereka
sengaja netral dan tidak memuat wajah atau identitas karakter mana pun (R-06).
Ganti satu per satu tanpa mengubah kode apa pun.

### Yang MASIH belum diuji

| # | Hal | Cara membuktikan |
|---|---|---|
| 1 | Sandbox runtime blitz.cloud mengizinkan egress ke penyedia model | Panggil endpoint penyedia dari dalam aplikasi setelah model diputuskan |
| 2 | Tidur sungguhan selama dua jam di platform mereka | Akses aplikasi setelah lebih dari dua jam tidak dipakai |
| 3 | Rate limit di belakang reverse proxy platform | Kirim lebih dari `RATE_LIMIT_MAX` permintaan dan pastikan balasan 429 |
| 4 | Waktu build pertama di server mereka | Lihat log build pertama |

Butir 1 baru relevan setelah B-01 (penyedia model) diputuskan.

### Catatan tentang image 355 MB

Ukuran ini berasal dari `node:22-bookworm-slim` ditambah dependensi produksi. Bila perlu
dikecilkan, urutan yang aman: pindah ke `node:22-alpine`, lalu buang berkas yang tidak
terpakai. Jangan mengorbankan `USER node` atau `EXPOSE` demi ukuran.

## 6. Risiko yang diketahui

1. **Identitas masih placeholder.** Siapa pun yang mengetahui sebuah `account_id` dapat
   membaca perjalanan akun itu. **Jangan dipakai untuk data nyata sebelum B-02 selesai.**
   Route sudah menandai `identityMode: 'placeholder'` di `/v1/meta` supaya keadaan ini
   tidak terlupakan.
2. **Mesin cerita masih simulator.** Belum ada model; semua keluaran deterministik dan
   ditandai `simulator: true`.
3. **Migrasi bersifat maju saja.** Tidak ada migrasi turun. Perubahan yang merusak harus
   diperbaiki dengan migrasi baru.
4. **Data rujukan demo ikut terpasang.** Empat dunia contoh dan satu akun demo dibuat oleh
   `002_seed_reference.sql`. Ganti sebelum rilis publik.

## 7. Perintah yang berguna

```bash
npm run build        # kompilasi ke dist/
npm start            # jalankan hasil kompilasi
npm run migrate      # terapkan migrasi tanpa menjalankan server
npm run typecheck    # periksa tipe
npm test             # jalankan seluruh pengujian
```

Pengujian memakai PostgreSQL in-memory. Itu cukup untuk membuktikan migrasi dan query
berjalan, tetapi **bukan** pengganti pengujian terhadap PostgreSQL 17 sungguhan.
