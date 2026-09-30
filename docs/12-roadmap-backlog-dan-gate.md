# 12 — Roadmap, Backlog, dan Gate

> Versi 1.0 · 29 September 2026.
> Urutan pembangunan frontend; backend produksi tetap di luar pekerjaan ini.
> Kebutuhan di [01](01-visi-lingkup-dan-kebutuhan.md); uji di [11](11-demo-dan-skenario-uji.md).

## 1. Fase

### F0 Persetujuan rencana

- Selesaikan O-01 sampai O-09 atau catat default yang dipakai.
- Bekukan D-01 sampai D-24; D-25/D-26 tetap ditunda.
- Tidak ada kode sebelum gate F0 lolos.

Gate F0:

- [x] Semua angka kuota/konteks dipahami sebagai target, bukan janji provider.
- [x] Tidak ada harga/model/login yang dikarang.
- [x] Backend/frontend tetap kosong.
- [x] Pengguna menyetujui stack dan batas usia usulan atau memintanya diubah.
- [x] Nama produk dikunci: **fayLN** (30 Sep 2026).

**Status: F0 LOLOS (kondisional) — 30 September 2026.** F1 boleh dimulai. F4 tetap terkunci sampai O-08a/O-08b dan O-09 selesai.

### F1 Fondasi frontend — **SELESAI 30 Sep 2026**

- Struktur Expo+TS, routing, i18n ID/EN, tema, token.
- Komponen dasar, state views, modal, telemetry nonteks.
- Mock gateway dan fixture demo.
- Test fondasi dan secret scan awal.

Bukti: 41 berkas sumber / 5.862 baris TypeScript di `project2/frontend`. Typecheck bersih,
79 tes lolos (6 suite), pemindaian rahasia bersih, `expo config` membaca `scheme: fayln` (SDK 57).
**Belum dijalankan di perangkat atau emulator** — gate F1 dinyatakan lolos pada tingkat
kode dan pengujian otomatis, bukan pada tingkat visual di perangkat.

Gate F1: shell + katalog mock + StoryDetail dapat diuji aksesibilitas. **Lolos.**

### F2 Player inti — **SELESAI 30 Sep 2026**

- Stage, dialogue, decision, composer, validasi event.
- Cursor canonical/presented/replay dan autosave.
- Auto/Log/NPC inspector.
- Scenario AC-05 sampai AC-17.

Bukti: typecheck bersih, **124 tes lolos (9 suite)** termasuk 18 tes reducer dan 11 tes alur.
Bundel web menyaji HTTP 200. Dua bug nyata ditemukan dan diperbaiki selama F2:
(1) `sequence` dimulai ulang tiap turn sehingga pengurutan lintas-turn salah;
(2) `require('expo-sqlite/kv-store')` tetap menarik worker web ke bundel → dipisah
menjadi `playbackStore.native.ts`. **Belum dijalankan di perangkat/emulator.**

Gate F2: demo Elysia–Leo deterministik lolos tanpa backend nyata. **Lolos.**

### F3 Journey dan pengaturan — **SELESAI 30 Sep 2026**

- JourneyList/Detail, Continue/Delete, profil, bahasa, baca/aksesibilitas.
- Kuota/context/compaction UI dengan simulator.
- Cache aset dan error mapping.
- Scenario AC-18 sampai AC-32.

Bukti: typecheck bersih, **166 tes lolos (12 suite)**, rahasia bersih, bundel web HTTP 200,
tipe rute bersih. Satu flakiness nyata ditemukan dan diperbaiki di sumbernya: dua pembaruan
perjalanan dalam milidetik yang sama menghasilkan `updatedAt` identik sehingga pengurutan
daftar tidak deterministik. Mock kini memberi stempel waktu yang dijamin menaik.

**Koreksi lingkup:** mode baca offline DIHAPUS sebagai fitur karena cerita dihasilkan AI.
FR-51 menjadi penanganan kehilangan koneksi di tengah sesi; SC-21 menjadi "Cache Aset dan
Koneksi". Yang tetap dijaga: draft dan posisi baca tidak hilang saat koneksi putus.

**Belum dijalankan di perangkat atau emulator.**

**Perapian sisa F3 (30 Sep 2026):** riwayat baca-saja kini dapat dibuka dari detail
Perjalanan (SC-07) — `LogDrawer` dilepas dari `PlaybackState` agar dapat dipakai layar lain
dan hanya menampilkan sampai posisi baca pemain. Bagian "Cache aset & koneksi" ditambahkan
di Pengaturan (SC-21) dengan pembersihan cache berkonfirmasi yang tidak menyentuh save.
Lembar pelaporan (SC-22) ditambahkan dengan kontrak `submitReport` yang menandai laporan
simulator sebagai `localOnly` sehingga UI tidak mengklaim laporan terkirim ke server.
Status: **183 tes lolos (13 suite)**, typecheck bersih, bundel web HTTP 200.

Gate F3: seluruh P0 frontend terbukti dengan simulator berlabel. **Lolos.**

### F4 Integrasi backend nyata

- Di luar pekerjaan ini; hanya dimulai setelah kontrak, auth, entitlement, dan provider siap.
- Replay seluruh acceptance dengan backend; mock tetap untuk regresi.
- Gate keamanan/privasi D-26 sebelum beta publik.

### F5 Rilis terbatas

- P1 terpilih: favorit, bookmark, archive, ekspor aman, audio.
- Pilot usability kecil; perbaiki funnel dan pemahaman kuota.
- Kebijakan harga, rating, retensi, dan dukungan operasional harus selesai.

## 2. Backlog bernomor

| ID | Pekerjaan | FR/AC | Gate |
|---|---|---|---|
| B-01 | Shell tabs + navigasi + i18n | FR-01–04 | F1 |
| B-02 | Home/search/filter + virtualized grid | FR-01–04, AC-01–02 | F1 |
| B-03 | StoryDetail/CharacterSheet publik | FR-06–08, AC-03–04 | F1 |
| B-04 | Setup akun/persona dan gate usia | FR-10,31–34, AC-21 | F1 |
| B-05 | Player stage/dialogue/advance | FR-13–16, AC-05 | F2 |
| B-06 | Decision + composer + idempotency | FR-17–18, AC-06–10 | F2 |
| B-07 | Cursor/state presented/replay | FR-24–25, AC-09–12 | F2 |
| B-08 | Auto/Log/inspector | FR-19–23, AC-15–16 | F2 |
| B-09 | Journey list/detail/continue/delete | FR-26–28, AC-18–20 | F3 |
| B-10 | Pengaturan/bahasa/aksesibilitas | FR-31–39, AC-21–23 | F3 |
| B-11 | Paket/kuota/memori simulator | FR-41–50, AC-24–28 | F3 |
| B-12 | Cache aset/koneksi/error/report | FR-51–60, AC-29–32 | F3 |
| B-13 | Fixture + E2E + audit | Semua AC P0 | F3 |
| B-14 | Integrasi backend nyata | Kontrak 09 | F4 |
| B-15 | P1 terpilih dan pilot | FR-05,29,62,67 | F5 |

## 3. Yang tidak dikerjakan

Regenerate/rewind, multiplayer, marketplace, Live2D/3D, voice cloning, gambar real-time, gacha/stamina, model offline, dan migrasi canon otomatis. Item P2 hanya dibahas bila F3 selesai dan ada persetujuan baru.

## 4. Aturan perubahan selama pembangunan

- Satu perubahan kebutuhan memperbarui FR, layar, DTO, fixture, dan AC terkait.
- Tidak ada “sekalian” P1/P2 tanpa persetujuan.
- Setiap gate menyimpan bukti test, bukan sekadar checklist.
- Mock tidak dihapus; ia menjadi regresi setelah backend nyata tersedia.
