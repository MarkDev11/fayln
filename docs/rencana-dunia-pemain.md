# Rencana: Pemain Membuat Dunia Sendiri (v2)

Status: **rencana saja, belum ada kode.** Ditulis ulang 28 Oktober 2026.
Versi pertama dibuang: ia menyebut fase, bukan berkas dan fungsi. Dokumen ini
menyebut jalur berkas, nama fungsi, dan DDL yang persis.

## 1. Keputusan produk (mengikat)

| Hal | Keputusan |
|---|---|
| Aset | Pemain **membuat karakter sendiri** dan **mengunggah gambarnya sendiri** |
| Penulisan | **Sepenuhnya manual.** Tidak ada bantuan AI untuk sinopsis, premis, atau apa pun |
| Visibilitas | Pemain memilih **publik** atau **privat** |
| Batas & biaya | Jumlah dunia **tanpa batas, gratis** (pembuatan tidak memanggil AI, jadi tidak memakai poin) |
| Akses | **Semua pemain**, tanpa syarat |

Konsekuensi langsung dari "tanpa bantuan AI": **tidak ada satu pun panggilan model
di seluruh alur pembuatan dunia.** Fase "bantu tulis" di rencana lama dihapus,
bukan ditunda.

## 2. Fakta backend yang mengikat rencana ini

| Fakta | Bukti |
|---|---|
| `worlds` hanya punya `world_id`, `created_at` — **tanpa pemilik** | `001_init.sql` |
| Versi dunia: `title, synopsis, premise, cover_asset_id, status, content_rating, published_at` | `world_versions` |
| Status sah: `draft`, `published`, `retired`, `revoked` | `world_versions_status_check` |
| Aset dunia menyimpan `media_id`, `npc_id`, `expression`, `kind ∈ (cover, background, portrait)` | `world_assets` |
| Gambar: `media_id` = **SHA-256 isi berkas**, `byte_size ≤ 1048576`, jenis dari isi berkas, SVG ditolak | `007_media.sql`, `src/media/imageFile.ts:40` |
| Unggah hanya untuk admin: `POST /admin/media`, `MAX_UPLOAD_BYTES = 1024*1024` | `adminRoutes.ts:159,1869` |
| Draf + terbit sudah ada dan sudah benar: `createDraft`, `saveIdentity`, `addBackground`, `saveNpc`, `publishDraft` (membekukan kosakata dalam transaksi yang sama) | `src/admin/worldDraftRepository.ts:307,392,487,870,1226` |
| Batas yang sudah berlaku: `MAX_BACKGROUNDS = 50`, `MAX_NPCS = 50`, backstory 4000, nama 120 | `worldDraftRepository.ts:43,274,277` |
| Katalog menyaring `wv.status <> 'draft'` | `catalogRepository.ts:110,90` |
| Dunia non-`published` **ditolak** saat membuat perjalanan | `journeyService.ts:183` |

## 3. Empat hal yang harus dibereskan lebih dulu

Ini bukan tambahan fitur; ini yang membuat fitur bisa berdiri.

### 3.1 Katalog saat ini MENAMPILKAN dunia yang sudah ditarik
`status <> 'draft'` muncul di **tiga** tempat, bukan satu:

| Lokasi | Akibat |
|---|---|
| `catalogRepository.ts:90` (`LATEST_PUBLISHED_JOIN`) | versi `revoked` dianggap "versi terbaru yang sah" |
| `catalogRepository.ts:110` (`listWorlds`) | dunia `revoked`/`retired` ikut tampil di katalog |
| `catalogRepository.ts:450` (`findWorldVersion`) | halaman detail dunia `revoked` tetap dapat dibuka |

Padahal `journeyService.ts:183` menolak memainkan apa pun selain `published`.
Artinya hari ini ada dunia yang **terlihat dan bisa dibuka, tetapi gagal saat
dimainkan**. Moderasi tanpa memperbaiki ini hanya kosmetik: "tarik dunia" tidak
menarik apa pun.

Perbaikan: `status = 'published'` di ketiga tempat. Perlu satu keputusan: bila
versi terbaru `retired`, apakah versi `published` sebelumnya boleh muncul
kembali? Rekomendasi: ya — `retired` berarti "versi ini dihentikan", bukan
"dunianya hilang".

### 3.2 Dedup SHA-256 membuat "pemilik berkas" mustahil
`media_id` adalah hash isi. Dua pemain yang mengunggah gambar sama menghasilkan
**satu baris** dan yang kedua tidak menyisipkan apa pun. Karena itu:

- **Jangan** menambahkan `account_id` ke `media_blobs` — nilainya akan menunjuk
  pengunggah pertama, bukan pemilik.
- `uploaded_by` yang ada sekarang berisi **nama admin**; jangan dipakai ulang
  untuk pemain.
- Kuota penyimpanan per akun harus dihitung dari **`world_assets.media_id`
  melalui `worlds.account_id`, `COUNT(DISTINCT media_id)`** — bukan dari tabel
  media.

### 3.3 `WorldDraftRepository` ada di `src/admin/`, padahal ia logika domain
Rute pemain tidak boleh mengimpor dari `admin/`. Pindahkan berkas ke
`src/repositories/worldDraftRepository.ts` sebagai **commit tersendiri yang
hanya memindahkan berkas** (ubah impor, suite hijau sebelum dan sesudah, tanpa
perubahan perilaku). Kalau digabung dengan perubahan lain, kegagalan uji tidak
bisa dibedakan antara "pemindahan salah" dan "fitur salah".

### 3.4 Teks pemain masuk ke prompt AI
`premise`, `synopsis`, `public_backstory` ditulis pemain dan dikirim ke model.
Mitigasi yang harus ada sejak fase pertama, bukan belakangan:
- Ketiga bidang dibungkus penanda data di prompt, dengan aturan tegas bahwa
  isinya **bukan instruksi**.
- Batas panjang sudah ada untuk backstory (4000); tambahkan untuk premis dan
  sinopsis (usul 2000/3000) — sekarang tidak dibatasi di skema.
- Uji khusus: premis berbunyi "abaikan semua aturan sebelumnya" harus tetap
  diperlakukan sebagai teks dunia.

## 4. Perubahan skema

Migrasi `025_dunia_pemain.sql`:

```sql
ALTER TABLE worlds ADD COLUMN account_id text;
ALTER TABLE worlds ADD COLUMN visibility text NOT NULL DEFAULT 'public';
ALTER TABLE worlds
  ADD CONSTRAINT worlds_visibility_check CHECK (visibility IN ('public', 'private'));
ALTER TABLE worlds
  ADD CONSTRAINT worlds_account_fk
  FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE;
CREATE INDEX worlds_account_idx ON worlds (account_id);
```

- `account_id` **NULL** = dunia admin (semua dunia lama tetap sah, tanpa backfill).
- `visibility` default `public` supaya dunia lama tidak berubah perilakunya.
- `ON DELETE CASCADE`: menghapus akun menghapus dunianya. Alternatifnya
  `SET NULL` yang mengubah dunia pemain menjadi dunia admin — itu lebih buruk.

Catatan pg-mem: jangan pakai `ADD CONSTRAINT IF NOT EXISTS` (tidak ada), jangan
pakai em dash di komentar SQL, jangan komentar blok di dalam `CREATE TABLE`.

## 5. Kontrak API

Semua rute di bawah memakai identitas token pemain (`request.accountId`) dan
**tidak** memakai sesi admin.

| Rute | Isi | Catatan |
|---|---|---|
| `POST /v1/media` | biner gambar, `bodyLimit: 1 MB` | `inspectImage` yang sama; 415 untuk non-PNG/JPEG/WebP; balikan `{ mediaId }` |
| `POST /v1/worlds` | `{ title }` | memanggil `createDraft(accountId)`; balikan `{ worldId, worldVersion }` |
| `PATCH /v1/worlds/:id/identity` | `{ title, synopsis, premise, genres[], contentRating, coverMediaId }` | `saveIdentity` |
| `POST /v1/worlds/:id/backgrounds` | `{ mediaId, label }` | `addBackground`; `null` → 409 `LIMIT_REACHED` |
| `POST /v1/worlds/:id/characters` | `NpcInput` tanpa `npcId` | `saveNpc` |
| `PATCH /v1/worlds/:id/characters/:npcId` | `NpcInput` | `saveNpc` |
| `DELETE /v1/worlds/:id/characters/:npcId` | — | `deleteNpc` |
| `POST /v1/worlds/:id/publish` | `{ visibility: 'public' \| 'private' }` | `publishDraft` + set `visibility` dalam satu transaksi |
| `GET /v1/my/worlds` | — | daftar milik sendiri, termasuk draf |
| `DELETE /v1/worlds/:id` | — | hanya draf; dunia terbit tidak dihapus pemain |

Aturan yang tidak boleh dilanggar:

1. **Setiap rute mutasi memeriksa `worlds.account_id = request.accountId`.**
   Satu fungsi penjaga `assertOwnership(db, worldId, accountId)`, dipakai semua
   rute — bukan pemeriksaan yang ditulis ulang di tiap tempat.
2. **`GET /v1/worlds/:id` untuk dunia privat milik orang lain → 404, bukan 403.**
   403 mengonfirmasi keberadaannya.
3. **Membuat perjalanan** pada dunia privat hanya boleh oleh pemiliknya
   (`journeyService`), dan hanya bila `status = 'published'`.
4. `publishDraft` dan penetapan `visibility` harus **satu transaksi**; dunia
   yang terbit tetapi visibilitasnya gagal tersimpan akan tampil publik.

## 6. Pekerjaan per berkas

### Fase 0 — Pemindahan (commit terpisah, tanpa perubahan perilaku)
- `src/admin/worldDraftRepository.ts` → `src/repositories/worldDraftRepository.ts`
- Perbarui impor di `src/admin/adminRoutes.ts`, `src/index.ts`, dan berkas uji.
- Gerbang: `tsc` + seluruh suite hijau, jumlah uji **tidak berubah**.

### Fase 1 — Kepemilikan & visibilitas
- `src/db/migrations/025_dunia_pemain.sql` (DDL di §4)
- `worldDraftRepository.createDraft(accountId: string | null)`
- `src/repositories/catalogRepository.ts`: `status = 'published'` di **tiga**
  tempat (`:90`, `:110`, `:450`); saring `visibility = 'public'` pada `listWorlds`
- `src/repositories/worldOwnership.ts` (baru): `assertOwnership`, `findOwned`
- `src/routes/worlds.ts` (baru): rute §5 kecuali `/v1/media`
- `src/http/schemas.ts`: skema badan permintaan + batas panjang premis/sinopsis
- Uji baru `tests/duniaPemain.test.ts`: kepemilikan, 404 vs 403, katalog
  menyembunyikan privat, `revoked` hilang dari katalog

### Fase 2 — Unggahan pemain
- `src/routes/media.ts` (baru): `POST /v1/media`, `bodyLimit: MAX_UPLOAD_BYTES`
- `MAX_UPLOAD_BYTES` dipindah ke satu modul bersama (`src/media/limits.ts`)
  supaya rute admin dan rute pemain tidak punya dua angka yang bisa berbeda
- Kuota per akun: kueri `COUNT(DISTINCT media_id)` lewat `world_assets` +
  `worlds.account_id`; batas **50 MB**; balikan 413 `STORAGE_QUOTA_EXCEEDED`
- Uji: tanpa token → 401; SVG menyamar PNG → 415; >1 MB → 413; berkas sama dua
  kali → `mediaId` sama dan kuota tidak bertambah

### Fase 3 — Wizard pemain (frontend)
Empat layar, memakai rute §5:
1. Identitas — judul, premis, sinopsis, genre, rating
2. Panggung — sampul + latar (maks. 50 sesuai `MAX_BACKGROUNDS`)
3. Pemain — karakter manual + potret/ekspresi (maks. 50 sesuai `MAX_NPCS`)
4. Tinjau & terbitkan — pilih publik/privat

Wajib di klien sebelum unggah: `expo-image-manipulator`, sisi terpanjang 1280 px,
JPEG kualitas ~0.8. Tanpa ini foto kamera 3-5 MB akan ditolak batas 1 MB dan
pemain tidak akan tahu sebabnya.

### Fase 4 — Moderasi
- Halaman admin **Dunia Pemain**: daftar dunia publik + tombol tarik
  (`status='revoked'`) — hanya berguna setelah §3.1 diperbaiki
- Tombol **Laporkan** pada dunia publik (tabel `world_reports` sederhana)
- Dunia ditarik: hilang dari katalog, perjalanan baru ditolak, perjalanan lama
  tetap terbaca

## 7. Urutan commit dan gerbang

| # | Commit | Gerbang |
|---|---|---|
| 1 | Pindahkan `worldDraftRepository` | tsc + suite hijau, jumlah uji sama |
| 2 | Migrasi 025 + kepemilikan di repositori | uji skema + uji kepemilikan |
| 3 | Katalog: `published` + `visibility` | uji katalog: revoked hilang, privat tidak tampil |
| 4 | Rute dunia pemain | uji rute: 401/404/409 |
| 5 | Unggahan pemain + kuota | uji media |
| 6 | Wizard aplikasi | jest + tsc |
| 7 | Moderasi | uji admin-render (jumlah ikon nav naik jadi 17) |

## 8. Risiko

| Risiko | Mitigasi |
|---|---|
| Injeksi prompt lewat teks pemain | Penanda data + aturan "bukan instruksi" + batas panjang + uji khusus |
| Katalog penuh dunia setengah jadi | Publik hanya lewat pilihan sadar; urutan katalog berbasis pemakaian |
| Penyimpanan membengkak | 50 MB/akun dihitung dari aset yang benar-benar dipakai, 1 MB/berkas, dedup SHA-256, kompresi klien |
| Dunia ditarik tetap terlihat | Diperbaiki di §3.1 **sebelum** moderasi dipakai |
| Dua definisi "batas unggah" | `src/media/limits.ts` sebagai satu sumber angka |
| Pemain menghapus dunia yang sedang dimainkan orang lain | Hapus hanya untuk draf; dunia terbit hanya ditarik admin |

## 9. Yang tidak dikerjakan

- Bantuan AI untuk menulis (dihapus dari lingkup, keputusan pemilik).
- Pembuatan gambar dengan AI.
- Dunia hasil racikan dari master (ditolak: pemain membuat sendiri).
- Editor teks kaya, tata letak khusus, atau tema tampilan per dunia.
