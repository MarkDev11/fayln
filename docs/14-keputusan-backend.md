# 14 — Keputusan Arsitektur Backend

> Versi 1.0 · 30 September 2026 · Status: **usulan yang sudah dijalankan**, menunggu peninjauan.
> Dokumen ini melengkapi [09](09-arsitektur-frontend-dan-kontrak.md) dan tidak menggantikannya.

## 1. Lingkup

Backend fayLN menyediakan: katalog dan kanon dunia, akun dan perjalanan, penyimpanan beat,
pengelolaan kuota, orkestrasi model AI, validasi hasil AI, dan penerimaan laporan.

Yang **tidak** dikerjakan pada tahap ini: panel admin, pembayaran, dan integrasi model
produksi. Ketiganya tetap terkunci oleh O-08a/O-08b/O-09 di dokumen 02.

## 2. Batasan platform yang membentuk keputusan

Fakta berikut berasal dari dokumentasi resmi blitz.cloud (diakses 30 September 2026) dan
**bukan asumsi**:

| Fakta | Konsekuensi desain |
|---|---|
| Aplikasi menerima `PORT` dari platform; Dockerfile yang ditulis platform memakai `8080` | Server **wajib** membaca `process.env.PORT`. Port tidak boleh dipatok di kode. |
| Hanya image **linux/amd64** yang dapat berjalan | Dockerfile memakai base image amd64; tidak boleh ada dependensi arm64. |
| Aplikasi berjalan sebagai user yang disebut Dockerfile; tanpa `USER` berarti root di dalam sandbox gVisor | Kita tetap menulis `USER` non-root sebagai kebiasaan baik, meskipun root diizinkan. |
| PostgreSQL 17, MariaDB 11.4, Redis (Valkey 8) tersedia sebagai layanan terkelola | Kita memakai **PostgreSQL 17**. Tidak ada MongoDB. |
| Kredensial database disuntikkan sebagai variabel lingkungan; bila nama variabel tidak dikenal, yang diberikan adalah `DATABASE_URL` | Konfigurasi membaca `DATABASE_URL` lebih dahulu. |
| **Paket gratis: aplikasi tidur setelah 2 jam tanpa pengunjung** | **Tidak boleh ada pekerjaan terjadwal yang menjadi syarat kebenaran.** Lihat bagian 5. |
| Folder yang dideklarasikan sebagai volume bertahan setelah restart; maksimum 6 folder, 1 GB | Kita **tidak** menyimpan state di disk. Semua state ada di PostgreSQL. |
| Maksimum 64 variabel lingkungan per aplikasi | Konfigurasi harus hemat variabel. |
| Monorepo didukung lewat "Folder to build" | `project2/backend` dibangun sebagai akar proyek; seluruh dependensinya harus berada di dalam folder itu. |
| Build dapat mencapai internet; jaringan privat tertutup | Egress ke penyedia model harus diuji, bukan diasumsikan. |

## 3. Keputusan: Node.js + TypeScript + Fastify + PostgreSQL

### ADR-B01 — Bahasa: TypeScript

Seluruh kontrak frontend sudah ditulis TypeScript di `project2/frontend/src/domain/types.ts`
dan `src/data/gateway.ts`. Memakai bahasa lain berarti menulis ulang kontrak itu dan
kehilangan kemampuan membandingkan tipe secara otomatis.

Alternatif yang ditolak: **Go** (image lebih kecil, tetapi kontrak harus ditulis ulang),
**PHP/Laravel** (dipakai di project1, tetapi tidak berbagi tipe), **Python** (sama).

### ADR-B02 — Kerangka HTTP: Fastify 5

Alasan utama bukan performa, melainkan **`@fastify/rate-limit` resmi**. FR-73 meminta
rate limit yang ditegakkan server, dan plugin ini menyediakannya tanpa menulis sendiri.
Fastify juga memiliki validasi skema bawaan dan dukungan TypeScript yang matang.

Alternatif yang ditolak: **Express** (rate limit dan validasi harus dirakit manual),
**Hono** (bagus, tetapi ekosistem plugin server-side lebih tipis).

### ADR-B03 — Akses database: `pg` dengan SQL langsung

Skema ditulis sebagai SQL yang dapat dibaca manusia dan dijalankan berurutan. Tidak ada
lapisan ORM yang menyembunyikan query.

Alasan: aturan domain fayLN bergantung pada **invariant** yang harus terlihat — misalnya
"hubungan hanya berubah karena beat yang sudah di-commit", "uang dibulatkan", dan
"settlement kuota tepat sekali per operasi". Invariant seperti itu lebih mudah dibuktikan
pada SQL langsung daripada pada abstraksi ORM.

Alternatif yang ditolak: **Prisma** (bagus, tetapi menambah lapisan pembuatan kode dan
menyembunyikan SQL yang justru ingin kami audit), **Drizzle** (pilihan yang wajar, ditunda
sampai skema stabil).

### ADR-B04 — Validasi: Zod

Setiap masukan dari klien divalidasi terhadap skema Zod sebelum menyentuh database.
Zod juga menghasilkan tipe, sehingga skema validasi dan tipe tidak dapat berbeda.

### ADR-B05 — ID dibuat aplikasi, bukan database

ID berupa `text` dengan awalan (`w_`, `j_`, `t_`, `b_`) dan dibuat di kode aplikasi memakai
`crypto.randomUUID()`. Tidak memakai `gen_random_uuid()` dari database.

Alasan: kontrak frontend sudah memakai ID berawalan sebagai string, dan menghindari
ketergantungan pada ekstensi PostgreSQL sehingga skema dapat diuji dengan database
in-memory.

### ADR-B06 — Waktu: `timestamptz`, disimpan UTC

Semua waktu disimpan sebagai `timestamptz` dalam UTC. Perhitungan reset kuota memakai UTC;
tampilan waktu lokal adalah tanggung jawab frontend (sesuai D-07).

### ADR-B07 — Migrasi wajib tahan database yang belum siap

`runMigrations` mencoba ulang dengan backoff (1s, 2s, 4s, 8s; maksimum 5 percobaan) untuk
galat **koneksi** saja: `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, dan kode SQL kelas
koneksi (`08003`, `08006`, `57P01`, `57P03`).

Alasan: di blitz.cloud aplikasi dan databasenya dapat bangun bersamaan. Sebelum ini,
satu `ECONNREFUSED` sesaat membuat proses keluar dan platform menandai aplikasi rusak —
padahal hanya perlu menunggu beberapa detik.

**Galat SQL yang sebenarnya tidak boleh dicoba ulang.** Kesalahan migrasi harus tetap
terlihat; mengulanginya hanya menyamarkan masalah. Pengujian menjaga kedua sisi aturan ini.

### ADR-B08 — Akun diadakan saat pertama terlihat

Setiap permintaan ke jalur `/v1/` melewati hook identitas yang memanggil `accounts.ensure()`.
Akun dibuat lebih dahulu sebelum route mana pun menyentuh tabel yang berkias-asing padanya.

Alasan: klien membuat ID perangkat sendiri, sehingga baris akunnya belum ada saat pertama
kali dipakai. Tanpa langkah ini, permintaan pertama setiap pengguna baru gagal pada kunci
asing `operations_account_fk` dan muncul sebagai HTTP 500 — bukan pesan yang dapat
dimengerti pemain.

Konsekuensi yang harus disadari: siapa pun dapat membuat akun sebanyak yang ia mau dengan
mengirim ID baru. Ini **dapat diterima selama B-02 belum selesai** karena akun tanpa
autentikasi memang tidak punya arti keamanan. Setelah B-02 selesai, pengadaan akun harus
terikat pada identitas yang terautentikasi, dan hook ini menjadi tempat menegakkannya.

Jalur `/assets/*` dan `/health*` **tidak boleh** menyentuh database lewat hook ini.

### ADR-B09 — ID beat harus unik global, bukan per giliran

`beats.beat_id` adalah kunci utama tabel, bukan kunci gabungan `(turn_id, sequence)`.
Awalan ID beat karena itu WAJIB berasal dari ID turn yang sesungguhnya
(`beatIdPrefix` pada `StoryContext`), bukan dari nomor turn.

Alasan: ID yang hanya berbasis nomor turn membuat pembukaan **setiap** perjalanan
menghasilkan `t001-b001` yang sama, sehingga perjalanan kedua selalu gagal disimpan
dengan `duplicate key value violates unique constraint "beats_pkey"`. Perjalanan pertama
kebetulan lolos, jadi masalahnya baru muncul pada yang berikutnya.

Aturan tetap: **jangan pernah menurunkan kunci utama dari nomor urut lokal.** Nomor urut
hanya bermakna di dalam induknya; kunci utama bermakna di seluruh tabel.

### ADR-B10 — Perilaku yang hanya terbukti lewat produksi

Tiga cacat pada ADR-B07, B08, dan B09 **tidak tertangkap oleh pengujian yang ada**, karena:

1. Seluruh pengujian tidak mengirim header `x-account-id`, sehingga jatuh ke akun demo
   yang sudah dibuat migrasi seed — jalur "perangkat baru" tidak pernah diuji.
2. Setiap berkas pengujian memakai database baru, sehingga tabrakan antar perjalanan
   tidak mungkin terlihat.

Aturan yang berlaku mulai sekarang: **setiap kali sebuah jalur baru disambungkan,
periksa juga jalur "pengguna baru" dan "pemakaian kedua"**, bukan hanya satu panggilan
yang berhasil. Uji regresi untuk ketiganya sudah ada dan **terbukti gagal** bila
perbaikannya dibatalkan.

Berkas uji: `backend/tests/api.test.ts` (perangkat baru; dua perjalanan tanpa tabrakan;
label opsi) dan `backend/tests/schema.test.ts` (percobaan ulang migrasi).

## 4. Bentuk layanan

```text
project2/backend/
├── Dockerfile              # amd64, non-root, membaca PORT
├── src/
│   ├── index.ts            # titik masuk: konfigurasi, server, shutdown
│   ├── config.ts           # validasi variabel lingkungan
│   ├── server.ts           # pabrik aplikasi Fastify
│   ├── logging.ts          # log terstruktur
│   ├── contracts/          # DTO dan kode kesalahan (cermin kontrak frontend)
│   ├── db/                 # pool, runner migrasi, migrations/*.sql
│   ├── repositories/       # akses data per agregat
│   └── routes/             # endpoint HTTP
└── tests/
```

Aturan: route tidak menulis SQL; route memanggil repository. Repository tidak mengetahui
HTTP. Dengan begitu aturan domain dapat diuji tanpa server.

## 5. Pekerjaan terjadwal — keputusan penting

**Keputusan:** tidak ada pekerjaan terjadwal yang menjadi syarat kebenaran.

Karena aplikasi tidur setelah dua jam tanpa pengunjung pada paket gratis, cron apa pun akan
terlewat. Karena itu:

| Kebutuhan | Cara yang dipakai |
|---|---|
| Reset kuota harian | **Dihitung saat dibaca.** Pemakaian disimpan dengan cap tanggal UTC; saat pemakaian dibaca, hari ini dibandingkan dengan cap terakhir dan kuota dianggap baru bila harinya berubah. Tidak perlu ada yang berjalan tengah malam. |
| Kedaluwarsa operasi yang macet | Diperiksa saat operasi itu diakses. |
| Pembersihan data lama | Dijalankan malas (lazy) saat ada permintaan terkait, dengan batas waktu. |
| Compaction Paid | Dipicu oleh permintaan, bukan oleh jadwal. |

Konsekuensi: backend tetap benar meskipun tidak pernah diakses selama berhari-hari, dan
tidak ada ketergantungan pada aplikasi "worker" terpisah. Bila nanti diperlukan pekerjaan
latar sungguhan, blitz.cloud menyediakan mode "Runs in the background" yang tidak tidur,
tetapi itu menambah satu aplikasi ke kuota paket.

## 6. Yang belum diputuskan

| ID | Pertanyaan | Status |
|---|---|---|
| B-01 | Penyedia dan model AI (Free dan Paid) | Terkunci; lihat O-08a/O-08b |
| B-02 | Metode autentikasi dan penerbitan sesi | Belum diputuskan |
| B-03 | Penyedia pembayaran dan penegakan entitlement | Belum diputuskan |
| B-04 | Retensi data, enkripsi kolom, dan pemulihan bencana | D-26 masih terbuka |
| B-05 | Apakah egress ke penyedia model diizinkan dari sandbox runtime | **Harus diuji, bukan diasumsikan** |

## 7. Kriteria selesai tahap backend pertama

- Server membaca `PORT` dan tetap berjalan tanpa variabel lain yang wajib selain database.
- Migrasi dapat dijalankan berulang tanpa efek samping.
- Endpoint katalog, detail dunia, perjalanan, dan laporan mematuhi kontrak dokumen 09.
- Operasi bersifat idempotent terhadap `clientOperationId`.
- Tidak ada rahasia di dalam image atau repositori.
- `docker build` berhasil untuk `linux/amd64` **dan** server menjawab `/health`.
