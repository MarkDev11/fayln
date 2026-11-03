# 18 — Rencana Perbaikan Hasil Audit Keamanan dan Integritas

> Versi 1.0 · 3 November 2026 · Status: **dikerjakan**. Pemilik topik: backend.
> Sumber: audit kode backend/frontend. Setiap butir ditandai **terverifikasi di kode**,
> **terverifikasi di produksi** (probe baca-saja ke backend online), atau **tidak terbukti**.

## Cara verifikasi

- Tanpa Docker. Pengujian otomatis memakai `pg-mem` (`npm run test` di `backend/`).
- Probe produksi hanya membaca (`/health`), tidak mendaftar akun, tidak menagih poin.
- `pg-mem` tidak menjalankan kunci baris dan konkurensi PostgreSQL sungguhan. Uji balapan
  di sini membuktikan **logika** (reservasi, penjaga revisi), bukan perilaku kunci
  PostgreSQL. Verifikasi akhirnya ada di produksi setelah deploy.

## Daftar butir

| # | Masalah | Status bukti | Perbaikan |
|---|---|---|---|
| 1 | Rate limit memakai token apa adanya sebagai kunci; token palsu = bucket baru | **produksi** | Kunci global = IP. Batas per akun dipasang SETELAH token terbukti (`createRateLimit`). Batas ketat terpisah untuk login/daftar dan untuk giliran AI. |
| 2 | Pembatas login hanya per email, hanya memori, tak pernah dibersihkan | kode | Kunci `email|ip` + batas gagal per IP. Peta dipangkas agar tidak tumbuh tanpa batas. Tetap di memori (satu instance); lihat catatan. |
| 3 | Poin: cek lalu panggil AI lalu tagih; paralel lolos semua; simpan beat dan tagih beda transaksi | kode | Reservasi poin atomik sebelum AI; settle/lepas reservasi; `appendTurn` + settle satu transaksi. Anggaran global harian opsional. |
| 4 | `revision = COUNT+1` tanpa kunci; cek keputusan di luar transaksi | kode | `appendTurn` mengunci baris journey dan memeriksa `expectedTurnCount`; bentrok = 409. Tanpa migrasi baru (menghindari risiko migrasi gagal di produksi). |
| 5 | Akun massal menguras biaya AI | desain | Batas pendaftaran per IP per jam + anggaran harian global (`GLOBAL_DAILY_POINT_CAP`). Verifikasi email butuh penyedia email: **di luar lingkup**. |
| 6 | `trustProxy: true` bisa dipalsukan | **tidak terbukti** (produksi) | Tidak diubah. Header `X-Forwarded-For` palsu tidak mengganti bucket. |
| 7 | Rating konten tidak ditegakkan | kode | Server menolak `18_plus` bila umur persona/akun < 18, `13_plus` bila < 13. |
| 8 | Prompt injection lewat teks bebas | kode | Teks pemain disanitasi (baris baru, kutip, penanda) dan ditandai sebagai DATA. Nama persona menolak karakter kontrol. |
| 9 | `baseUrl` provider rawan SSRF | kode | Tolak IP privat/link-local/metadata. Loopback dan `http` hanya di luar produksi. |
| 10 | Kunci enkripsi bentuk frasa lemah | kode | **Tidak ditolak** (menolak berarti semua kunci tersimpan tak terbaca). Peringatan keras saat start. |
| 11 | Token 30 hari di `localStorage` (web) | kode | Batas idle 14 hari di server. Perbaikan penuh (cookie HttpOnly) = perubahan besar, ditunda. |
| 12 | `touchSession` menulis di setiap request | kode | Tulis paling sering tiap 5 menit. |
| 13 | Sesi kedaluwarsa dibersihkan hanya saat login | kode | Dibersihkan juga saat daftar. |
| 14 | Model aktif dicari ulang tiap giliran; impor ganda `visionClient` | kode | Cache 15 detik; impor digabung. |
| 15 | CI tanpa audit dependensi dan build Docker | kode | Tambah `npm audit` (informatif) dan job build image. |
| 16 | Dok 00 dan 14 usang | kode | Diperbarui. |

## Catatan keterbatasan yang sengaja diterima

- Pembatas login tetap di memori. Cukup untuk satu instance; bila skala menjadi beberapa
  instance, pindahkan ke Redis (Valkey tersedia di blitz.cloud).
- Reservasi yang tertinggal karena proses mati di tengah giliran bertahan sampai hari WIB
  berganti (baris `usage_days` baru). Dampaknya paling banyak satu hari poin, bukan kebocoran.
- Penolakan SSRF memeriksa alamat yang diketik, bukan hasil DNS. Penyerang dengan akses admin
  masih bisa memakai nama host yang diarahkan ke IP privat.

## Hasil verifikasi (3 November 2026)

- Probe produksi (baca-saja, `/health`): token palsu berbeda masing-masing mendapat sisa jatah
  penuh (butir 1 terbukti). Header `X-Forwarded-For` berbeda memakai bucket yang sama (butir 6
  tidak terbukti, platform menimpa header itu).
- `npm run test` backend: 709 lulus. Dua yang gagal sudah gagal SEBELUM perbaikan ini dan tidak
  terkait: `tests/schema.test.ts` belum memuat `025_dunia_pemain.sql` di `EXPECTED_MIGRATIONS`.
- Tiga mutasi (kembalikan keyGenerator lama, hapus pemeriksaan `expectedTurnCount`, longgarkan
  syarat reservasi) masing-masing membuat uji yang dimaksud memerah, lalu dikembalikan.

## Yang TIDAK dapat dibuktikan di `pg-mem` (harus dicek setelah deploy)

- `ROLLBACK` tidak dijalankan `pg-mem`; uji hanya membuktikan bahwa penagihan berjalan di dalam
  transaksi penyimpanan beat dan galatnya tidak ditelan.
- Kunci baris (`UPDATE journeys ...` sebagai mutex) hanya berefek di PostgreSQL sungguhan.
  Uji balapan memakai penahan di mesin untuk mengatur urutan, bukan transaksi yang benar-benar
  tumpang-tindih.
- Dua kejanggalan `pg-mem` yang ditemukan: `kolom - $param` tak bertipe salah hitung (diatasi
  dengan `$3::bigint`), dan penolakan `FOR UPDATE` tidak diuji.

## Urutan pengerjaan

1. Sesi dan login (1, 2, 11, 12, 13)
2. Poin dan revisi (3, 4, 5)
3. Konten dan prompt (7, 8)
4. Provider dan rahasia (9, 10)
5. Kebersihan (14, 15, 16)
