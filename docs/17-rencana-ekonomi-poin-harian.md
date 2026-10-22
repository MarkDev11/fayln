# 17 — Rencana Ekonomi Poin Harian (Daily Login + Bayar per Adegan)

> Status: **RANCANGAN — menunggu persetujuan pemilik produk sebelum implementasi.**
> Diputuskan bersama pemilik produk, 22 Oktober 2026.

## 1. Ringkasan perubahan

| | Sekarang | Sesudah |
|---|---|---|
| Mata uang | token AI (meteran infrastruktur) | **poin** (mata uang produk) |
| Jatah harian free | 100.000 token/hari, otomatis | **100 poin/hari, diklaim lewat popup daily login** |
| Biaya bermain | biaya token sesungguhnya (estimasi 6.000/giliran) | **10 poin per giliran; adegan pembuka GRATIS** |
| Sisa saldo | hangus harian (UTC) | **hangus harian (WIB), tidak menumpuk** |
| Ganti hari | 07:00 WIB (hari UTC) | **00:00 WIB** |
| Bonus streak | — | **login 7 hari beruntun → +300 poin** |

## 2. Fakta sistem saat ini (verifikasi kode, bukan ingatan)

- Kuota dihitung dalam token: `FREE_DAILY_TOKENS: positiveInt(100_000)` — `backend/src/config.ts:54`.
- Biaya satu giliran diperkirakan `estimatedTurnCost = 6_000` token — `backend/src/services/aiStoryEngine.ts:86`. Artinya free user hari ini ± 16 giliran/hari; **sesudah perubahan jadi 10 giliran/hari** — pengetatan disengaja oleh pemilik produk.
- Reset harian **malas** (tanpa cron): baris per `(account_id, usage_date)` di `usage_days`; hari baru = baris baru = saldo baru — `backend/src/repositories/usageRepository.ts`. Desain ini wajib dipertahankan: blitz.cloud menidurkan aplikasi 30 menit tanpa pengunjung, cron pasti terlewat.
- Penagihan ada di **dua** tempat: adegan pembuka (`journeyService.ts:398`) dan giliran (`journeyService.ts:698`). Tolak-tagih-ganda dijamin indeks unik `operation_id` di `usage_entries`.
- Pemeriksaan pra-giliran `assertQuotaAvailable` menuntut `available >= estimatedTurnCost` — `journeyService.ts:753-766`.
- Frontend membaca `UsageDTO` (available/spent/allowanceLimit/resetAt) dan menampilkannya di badge Beranda + `QuotaSheet`.
- Admin punya pengali kuota per paket (`settingsRepository.quotaMultiplier('free'|'paid')`) — harus ikut disesuaikan.

## 3. Desain yang sudah diputuskan

1. **Popup daily login.** Sekali per hari, setelah masuk, pemain melihat popup "Klaim 100 Poin". Tanpa klaim, saldo hari itu **0** — giliran ditolak dengan pesan yang mengarah ke popup.
2. **Streak 7 hari.** Klaim beruntun 7 hari (tanpa bolong) → hari ke-7 bonus **+300** (total hari itu 400). Bolong satu hari → streak kembali ke 0. Siklus berulang: hari ke-14 beruntun kembali berbonus.
3. **Biaya 10 poin per giliran.** Adegan pembuka **gratis**. Giliran yang gagal (`SUBMIT_FAILED`) dan giliran yang jatuh ke mesin cadangan simulator **tidak ditagih** — pemain tidak membayar untuk barang yang tidak jadi.
4. **Sisa poin hangus** saat ganti hari; tiap hari mulai dari klaim baru. Tidak menumpuk.
5. **Hari = WIB (Asia/Jakarta).** Ganti hari 00:00 WIB.

Asumsi yang saya pakai (koreksi bila salah): bonus berulang tiap kelipatan 7 hari; akun berbayar belum ada sehingga konversi `PAID_DAILY_TOKENS` ditunda sampai fitur bayar benar-benar dibuat.

## 4. Rancangan teknis

### 4.1 Backend

**Konfigurasi** (`config.ts`, mengikuti pola env yang sudah ada):
```
FREE_DAILY_POINTS      = 100
SCENE_POINT_COST       = 10
STREAK_BONUS_POINTS    = 300
STREAK_CYCLE_DAYS      = 7
```
`FREE_DAILY_TOKENS`/`PAID_DAILY_TOKENS` dipensiunkan dari jalur kuota (pencatatan token internal di `usage_entries` TETAP berjalan — untuk analitik biaya, bukan untuk menagih pemain).

**Kunci tanggal WIB** (`usageRepository.ts`): `utcDateKey()` → `jakartaDateKey()` (offset +07 tanpa DST). `nextUtcReset()` → tengah malam WIB berikutnya. Streak dihitung dari selisih `claim_date`, bukan dari jam.

**Tabel baru** (migrasi `022_ekonomi_poin.sql`):
```
daily_point_claims (
  account_id, claim_date,            -- PK (account_id, claim_date)
  base_points, bonus_points, streak_day, claimed_at
)
```
Klaim = INSERT satu baris; DB menolak klaim kedua hari yang sama (unik) — pola yang sama dengan tolak-tagih-ganda yang sudah terbukti. Streak dibaca saat klaim: klaim kemarin ada → `streak_day+1`; tidak ada → 1.

**Saldo tersedia** = `SUM(base+bonus) hari ini` − `spent hari ini` (`usage_days.spent_tokens` berganti makna menjadi poin; `charged_total` = 10 per giliran sukses).

**Endpoint baru** `POST /v1/usage/claim` → `{ awarded, bonus, streakDay, available, resetAt }`. Idempoten: klaim ulang hari sama → jawaban tanpa hadiah (bukan galat), supaya retry aman.

**`UsageDTO` diperluas**: `claimableToday: boolean; streakDay: number; sceneCost: number` — frontend tidak mengarang aturan.

**Jalur penagihan** (`journeyService.ts`):
- Hapus `charge` di jalur pembuka (baris ±398).
- Pra-pemeriksaan giliran: `available >= SCENE_POINT_COST` (bukan estimasi token).
- Tagih 10 **hanya bila hasil sukses dari mesin AI** — bukan simulator, bukan `SUBMIT_FAILED`.

**Admin**: pengali kuota (`quotaMultiplier`) tetap berlaku sebagai pengali poin harian.

### 4.2 Frontend

- `UsageDTO` + tipe klaim di `src/domain/types.ts`.
- **Popup klaim harian** di Beranda: tampil bila `claimableToday` (sekali per sesi per hari), tombol "Klaim", visual streak 7 titik dengan hari ke-7 menyala "+300".
- Badge kuota Beranda & `QuotaSheet`: sisa poin, "1 adegan = 10 poin", jam reset WIB, status streak.
- Pesan kuota habis di pemain: mengarahkan ke klaim hari ini / besok.
- `useUsage` di-refresh setelah klaim.

### 4.3 Penjaga uji (wajib bukti mutasi: rusak → MERAH → pulih → HIJAU)

1. Hari belum diklaim → `available = 0`, giliran ditolak `quotaExhausted`.
2. Klaim memberi 100; klaim kedua hari sama TIDAK menambah (unik DB).
3. Streak: klaim 6 hari beruntun → hari ke-7 dapat +300; bolong satu hari → streak 1 lagi (jam terinjeksi).
4. Giliran menagih **tepat 10** (mutasi: ubah konstanta → merah).
5. Pembuka **tidak** menagih (mutasi: pasang charge di pembuka → merah).
6. Giliran simulator-cadangan & `SUBMIT_FAILED` tidak menagih.
7. Kunci tanggal WIB: 23:59 vs 00:01 WIB = dua hari berbeda (mutasi: kembali ke UTC → merah).
8. Frontend: popup muncul saat `claimableToday` dan hilang setelah klaim; badge menampilkan sisa poin.

### 4.4 Urutan kerja

1. Migrasi `022` + kunci tanggal WIB + tabel klaim.
2. Repositori kuota (klaim, saldo, tagih 10) + endpoint `/v1/usage/claim`.
3. `journeyService`: hapus tagih pembuka, pra-cek 10, tagih hanya giliran AI sukses.
4. Penjaga uji backend (butuh 1–8) + suite hijau penuh.
5. Frontend: tipe, popup klaim + streak, badge/QuotaSheet, pesan habis.
6. Penjaga uji frontend + suite hijau penuh.
7. Verifikasi live produksi (daftar akun uji → klaim → main 1 giliran → saldo berkurang 10 → klaim ulang ditolak).

### 4.5 Risiko yang disadari

- **Pemotongan jumlah giliran/hari (±16 → 10).** Itu keputusan bisnis pemilik produk; dampaknya pada retensi perlu dipantau setelah rilis.
- **Perubahan makna kolom token → poin.** `usage_days.spent_tokens` dipakai ulang; angka historis campur di hari transisi. Karena pemain aktif saat ini masih akun uji, cutover bersih diperbolehkan — sekali ada pemain nyata, jalan ini tertutup.
- **Streak & zona waktu**: semua uji streak wajib memakai jam terinjeksi, bukan `new Date()` — kalau tidak, uji hanya hijau pada jam tertentu.
