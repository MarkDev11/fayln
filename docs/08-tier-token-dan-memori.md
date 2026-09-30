# 08 — Tier, Token, dan Memori

> Versi 1.0 · 29 September 2026.
> Pemilik angka Free/Paid. Rujukan layar di [04](04-spesifikasi-layar.md); pengujian di [11](11-demo-dan-skenario-uji.md).

## 1. Definisi yang tidak boleh dicampur

- **Context window:** kapasitas token maksimum untuk satu request model, termasuk instruksi, world, memori, riwayat yang dipilih, input pemain, dan ruang output.
- **Daily allowance:** total token input+output yang dibebankan ke akun selama satu periode.
- **Log pemain:** arsip beat committed yang tetap dapat dibaca.
- **Canonical state:** flags, lokasi, relasi, dan fakta mekanis yang tetap persisten.
- **Memory artifact:** ringkasan terstruktur Paid yang dibuat melalui compaction sukses.
- **Estimasi:** angka bantu UI; bukan tagihan final.

Konsekuensi penting: cerita 2.000 token yang dibaca setelah konteks penuh tetap tersimpan sebagai Log, tetapi model tidak otomatis melihat seluruh 2.000 token itu pada request berikutnya.

## 2. Paket yang diminta dan usulan periode

| Ketentuan | Free | Paid kerja “Pro” |
|---|---|---|
| Context window | 64.000 token desimal | 256.000 token desimal |
| Allowance | 100.000 token/hari | 1.000.000 token/hari sebagai usulan |
| Reset | 00.00 UTC; tampilkan waktu lokal | Sama; berlaku untuk request baru |
| Compaction | Tidak | Ya; setiap sukses membuat artefak baru |
| Log dan canonical state | Tetap disimpan | Tetap disimpan |

Status O-04 sampai O-06 tetap terbuka. Sampai dikonfirmasi, UI, kontrak, dan test memakai default di atas dan menandainya sebagai asumsi.

## 2a. Kandidat model — usulan pengguna, belum terverifikasi

- Free: kemungkinan besar Gemma 4 E4B uncensored (pernyataan pengguna 29 Sep 2026; tetap kandidat, belum terverifikasi).
- Paid: mistral-medium-latest (pernyataan pengguna 29 Sep 2026; tetap kandidat, belum terverifikasi).
- Status: kandidat, bukan keputusan final. Wajib verifikasi sebelum janji 64k/256k dijual: konteks efektif nyata, kualitas VN Indonesia/Inggris, throughput dan concurrency, biaya per 1 juta token atau biaya hosting/inferensi sendiri, lisensi redistribusi/komersial, serta perilaku keamanan (penolakan yang masuk akal, anti-jailbreak dasar, kepatuhan gate usia).
- Uncensored tidak menghapus batas produk: tidak ada konten seksual eksplisit, karakter dewasa saja untuk romansa, consent dan agensi NPC tetap dijaga (FR-57), serta moderasi/pelaporan tetap ada (FR-59, FR-74).
- Frontend tidak memilih model; ia hanya menampilkan `modelId`/versi dari envelope untuk transparansi dan audit.

## 3a. Rate limit dan abuse detection — kontrak untuk frontend

- Enforcement 100% di server; frontend tidak menghitung kuota resmi dan tidak memblokir berdasarkan hitungan lokal.
- Kode yang wajib dipetakan UI: `RATE_LIMITED` (429 + `retryAfterSec`), `ABUSE_WARN` (peringatan + jeda Auto), `ABUSE_BLOCKED` (blokir sementara + alasan aman + jalur banding).
- Retry rate-limit memakai operation ID sama; tidak ada auto-retry agresif yang memperparah blokir.
- Blokir abuse tidak menghapus Log/state; pemain tetap bisa membaca arsip dan pengaturan.
- Skor/aturan deteksi tidak dikirim ke klien; hanya status, alasan aman, dan durasi.

## 3b. Kerangka hitung biaya per turn — tanpa mengarang harga

```text
chargedTurn = promptTokens + completionTokens
promptTokens ≈ instruksi + world + state + memori + jendela riwayat + input pemain
biayaTurn ≈ chargedTurn × tarifPerToken(model, provider/hosting)
biayaHarian ≈ Σ chargedTurn + Σ compactionSukses
```

- Tarif diisi saat O-08 lolos; dokumen tidak mengarang tarif Gemma/varian hosting.
- Estimasi UI memakai tokenisasi resmi model yang dipakai; estimasi bukan tagihan final.
- Compaction dan retry sukses ikut dihitung; gagal teknis platform tidak ditagih ulang (D-21).

## 3. Formula allowance

```text
available = max(0, allowanceLimit - spentConfirmed - reservedActive)
spentConfirmed = total usage request sukses
reservedActive = taksiran request yang sedang berjalan
```

- Semua hitung resmi memakai tokenisasi provider/model yang dipakai; frontend tidak menghitung sendiri.
- Input dan output dijumlahkan sesuai permintaan.
- Compaction sukses dihitung; validasi/gagal teknis platform tidak ditagih ulang.
- Retry teknis memakai operation ID sama dan tidak membuat settlement kedua.
- Hasil terlambat setelah timeout tidak boleh menambah spent baru bila request pengganti sudah sukses.
- UI menampilkan `spent`, `reserved`, `available`, limit, reset, dan label estimasi.

Contoh aritmetika, bukan janji model:

- Free memakai 68.420 token: sisa estimasi 31.580.
- Estimasi satu decision berikutnya 3.500 token: tombol tetap aktif dengan peringatan.
- Estimasi melewati sisa: composer dinonaktifkan sebelum request dikirim.

## 4. Strategi konteks

### Free

- Konteks berisi instruksi sistem, world ringkas, canonical state mekanis, memori aktif kosong, jendela riwayat mentah terbaru, input saat ini, dan ruang output.
- Tidak ada ringkasan naratif otomatis.
- Ketika riwayat melebihi ruang, potong dari yang terlama; jangan menghapus Log atau relasi.
- Tampilkan peringatan kontinuitas yang jujur, bukan pesan “cerita rusak”.

### Paid

- Konteks berisi instruksi, world, canonical state, active memory terbaru, jendela riwayat yang lebih besar, input, dan ruang output.
- Active memory berasal dari checkpoint immutable dan artefak terbaru.
- Bila artefak hilang/rusak, fallback ke mode Free sementara dan tandai status memori.
- UI tidak boleh menyatakan Paid mustahil lupa.

## 5. Compaction Paid

Pemicu yang diusulkan:

- Otomatis saat pemakaian konteks melewati 75% dari 256.000.
- Tombol manual bila tersedia dan allowance cukup.
- Tidak dipicu saat decision aktif belum selesai atau saat offline.

Alur aman:

1. Pilih cakupan turn yang belum terkompaksi.
2. Minta ringkasan terstruktur dengan referensi turn.
3. Validasi fakta, karakter, dan ID; tolak bila ada halusinasi identitas baru.
4. Simpan checkpoint immutable dan active memory baru.
5. Tandai cakupan sebagai terkompaksi; sumber Log tidak dihapus.
6. Tampilkan versi, cakupan, biaya, dan fakta yang kini terlihat.

Kegagalan berarti status gagal + retry; bukan penghapusan sumber atau klaim memori baru.

## 6. Upgrade, downgrade, dan expiry

- Berlaku untuk request baru; request berjalan memakai entitlement saat dimulai.
- Upgrade tidak membuat memori masa lalu Free secara retroaktif; compaction berikutnya mulai dari Log tersimpan.
- Downgrade tidak menghapus Log/state; konteks berikutnya memakai aturan Free.
- Memori Paid tetap tersimpan sebagai data, tetapi tidak dipakai sebagai konteks aktif selama akun Free bila kebijakan itu dipilih; pilihan final harus eksplisit sebelum rilis.
- Pembelian menunggu integrasi; simulator tidak boleh mengubah entitlement berbayar sungguhan.

## 7. Layar dan pesan yang wajib ada

- Perbandingan paket tanpa harga karangan.
- Meter spent/reserved/available dan waktu reset lokal.
- Status compaction Paid dan riwayat artefak.
- Pesan kuota habis yang membuka Log/pengaturan.
- Pesan konteks penuh yang berbeda untuk Free dan Paid.
- Penjelasan bahwa membaca ulang tidak memakai kuota.

## 8. Kriteria selesai

- Tidak ada layar yang menyebut konteks sebagai penyimpanan atau kuota sebagai jumlah pesan.
- Tidak ada klaim anti-pikun absolut.
- Tidak ada generasi yang dikirim setelah estimasi melebihi sisa.
- Semua settlement ganda ditolak oleh test idempotency.
- Downgrade/upgrade tidak menghapus journey.
