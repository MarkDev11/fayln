# 02 — Keputusan, Asumsi, dan Risiko

> Pemilik status keputusan. Versi 1.0 · 29 September 2026.
> Rujukan: [00](00-ultraplan-frontend.md), [01](01-visi-lingkup-dan-kebutuhan.md), [12](12-roadmap-backlog-dan-gate.md).

## 1. Cara membaca dokumen ini

- **K — pengguna:** permintaan eksplisit atau angka yang diberikan pengguna.
- **U — usulan:** rancangan agar alur dapat dibangun; butuh persetujuan eksplisit sebelum implementasi.
- **T — ditunda:** belum boleh dikunci atau dibangun.
- Nomor keputusan bersifat stabil: `D-01...`, pertanyaan terbuka `O-01...`, risiko `R-01...`.
- Setiap keputusan U wajib memiliki daftar wujud di dokumen pemiliknya; jika tidak ada wujud, statusnya belum matang.

## 2. Register keputusan

| ID | Status | Keputusan | Rasional | Dokumen/wujud terkait |
|---|---|---|---|---|
| D-01 | K | Tahap ini hanya docs + folder kosong; tidak ada app, AI, pembelian, atau cloud | Permintaan eksplisit; backend gampang nanti | 00 §2, 12 F0 |
| D-02 | K | Tiga tab: Home, Journey ikon chat, Pengaturan; UI bersih fokus sampul/judul | Permintaan eksplisit | FR-01–09; 03, 04 |
| D-03 | K | AI sebagai narator dan NPC; 3 pilihan AI + input custom; latar/ekspresi dinamis dari tool | Permintaan eksplisit, dikoreksi menjadi visual novel | FR-13–18; 06, 07, 09 |
| D-04 | K | Hubungan NPC per journey aktif, dapat berubah; default admin, Normal bila tidak diatur | Permintaan eksplisit | FR-22,27; 06, 07 |
| D-05 | K | Auto dan Log/Riwayat seperti LN; Continue dan hapus berkonfirmasi | Permintaan eksplisit | FR-19–20,25–28; 06 |
| D-06 | K | Free 64k context, 100rb token/hari, tanpa compaction; Paid 256k context, compaction, 1jt token | Angka pengguna | FR-42–43; 08 |
| D-07 | U | Paid 1.000.000 token/hari; 1k=1.000 desimal; reset 00.00 UTC; tampilkan zona lokal | Menyamakan periode dengan Free agar UI konsisten | FR-43–44; 08 §3, test |
| D-08 | U | Mobile native portrait-first, Android-first, iOS-ready; kandidat React Native + Expo + TypeScript | Spesifikasi pengalaman mobile yang diminta | 09 ADR-01–03 |
| D-09 | U | Persona snapshot; nama akun global tidak menimpa persona journey aktif tanpa konfirmasi | Mencegah rewrite diam-diam | FR-10,31; 06, 10 |
| D-10 | U | Usia aktual wajib dan divalidasi; usulan rilis awal 18+; tidak merancang fitur eksplisit | Demo romantis dewasa + distribusi aman | FR-32,08; 10, 12 |
| D-11 | U | Browse tamu; akun diperlukan sebelum generasi produksi dan cloud save; demo/mock terpisah | Menyeimbangkan funnel dan kuota | FR-39–40; 03 |
| D-12 | U | Satu journey aktif per world per akun pada MVP; multi-slot P1 | Cegah overwrite dan konflik cursor | FR-11–12; 06, 12 |
| D-13 | U | Satu portrait fokus per beat; pemeran lain di state, bukan teks terpotong | Keterbacaan mobile | 04 scene, 06 event |
| D-14 | U | Turn divalidasi dan committed dulu sebelum diputar, bukan stream teks mentah | Integritas state/kuota | FR-24,55; 06,09 |
| D-15 | U | Auto tidak pernah memilih/mengirim/mengeluarkan token baru; berhenti di decision/overlay/gangguan | Keselamatan dan biaya | FR-19; 06 §6 |
| D-16 | U | Pisahkan canonical state, presented state, dan replay cursor | Cegah spoiler dan double-apply | 06 §2, 09 DTO |
| D-17 | U | MVP tanpa edit turn, regenerate, atau rewind | Fokus save integrity; masuk P2 | FR-29–30; 12 |
| D-18 | U | Semua tier menyimpan log/beat; Free context hanya recent raw + state ringkas mekanis | Log ≠ konteks | FR-46; 08 §4 |
| D-19 | U | State mekanis terstruktur selalu persisten; compaction Paid menambah memori naratif | Compaction ≠ pengganti flags | FR-47–48; 07 |
| D-20 | U | Compaction checkpoint immutable + active memory berversi; tidak klaim ingatan sempurna | Kejujuran produk | FR-47–48; 08 §6 |
| D-21 | U | Hanya request generation/compaction sukses yang memakan allowance; retry teknis platform tidak ditagih ulang | Keadilan biaya | FR-44,50; 08 §5 |
| D-22 | U | Bahasa UI dan bahasa respons terpisah; tidak ada terjemahan retroaktif otomatis | Cegah LLM cost tersembunyi | FR-33–34; 10 |
| D-23 | U | World version pinning; aset invalid difallback dengan jelas | Perjalanan lama tidak rusak | FR-54,60; 07, 09 |
| D-24 | U | Baseline HTTP command + polling job status; transport lain di balik adapter | React Native tidak berasumsi EventSource | 09 §6; NFR-15 |
| D-25 | K | Nama produk final: **fayLN**. Deep-link scheme `fayln://`. Bundle ID usulan `id.fayln.app`. Harga, login, dan jalur pembelian tetap ditunda | Dikunci pengguna 30 Sep 2026 | 00 §0, 03 §1, 09 §2 |
| D-26 | T | Retensi, rating final, enkripsi cache/backup, dan pemulihan bencana belum diputuskan | Butuh review hukum/infra | 10, 12 gate |
| D-27 | U | Kandidat model Free: Gemma 4 E4B uncensored — status usulan pengguna, belum terverifikasi | Usulan pengguna 29 Sep 2026; wajib uji konteks/biaya/lisensi/keamanan | 08 §2a, 09 §4, O-08 |
| D-27b | U | Kandidat model Paid: mistral-medium-latest — status usulan pengguna, belum terverifikasi | Usulan pengguna 29 Sep 2026; wajib uji konteks/biaya/lisensi/keamanan | 08 §2a, O-08 |
| D-28 | K | Rate limit dan abuse detection disetujui; enforcement di server, frontend menangani UX 429/blokir | Permintaan pengguna 29 Sep 2026 | FR-73–74; 08 §3a; 09 §6 |
| D-29 | K | Fokus frontend saja; backend ditunda; aset gambar dibuat manual mengikuti manifest | Permintaan pengguna 29 Sep 2026 | 05 §5; 09 §4; 12 |

## 3. Pertanyaan terbuka yang memblokir persetujuan implementasi

| ID | Pertanyaan | Mengapa penting | Default bila belum dijawab |
|---|---|---|---|
| O-01 | ~~Nama produk final?~~ **SELESAI 30 Sep 2026: fayLN** | Sudah dikunci; `project2` tetap nama direktori internal | — |
| O-02 | Platform pertama Android saja atau paralel iOS? | Kapasitas QA/perangkat | Android-first |
| O-03 | Stack alternatif selain RN+Expo+TS? | Rekrutmen/build | Tetap kandidat RN |
| O-04 | Paid 1jt token per hari atau per bulan? | Semua copy kuota dan test | Harian, harus dikonfirmasi |
| O-05 | Satuan 64k/256k desimal atau biner? | Ambang compaction | Desimal 64.000/256.000 |
| O-06 | Waktu reset harian dan perilisan allowance baru? | Estimasi dan sengketa | 00.00 UTC |
| O-07 | Kebijakan usia/rating katalog pertama? | Store, konten, moderasi | Usulan dewasa 18+ |
| O-08a | Verifikasi Gemma 4 E4B uncensored untuk Free: konteks efektif nyata vs klaim 64k, kualitas VN ID/EN, biaya/hosting, lisensi, keamanan? | Menentukan apakah Free layak jalan | Kandidat Free Gemma 4 E4B uncensored belum terverifikasi |
| O-08b | Pemilihan + verifikasi model Paid `mistral-medium-latest` (konteks 256k nyata, throughput, biaya, lisensi, keamanan)? | Janji Paid harus dapat dipenuhi | Kandidat Paid `mistral-medium-latest` belum terverifikasi; belum boleh menjual Paid |
| O-09 | Metode login, entitlement, dan restore pembelian? | Integrasi rilis | Akun diperlukan; detail ditunda |

## 4. Asumsi yang harus diuji

1. Pemain memahami ikon chat bawah sebagai Journey, bukan CS manusia.
2. Tiga pilihan yang berbeda niat cukup untuk kebanyakan decision; input custom tetap penting.
3. Background dan portrait katalog cukup untuk pengalaman VN; tidak butuh gambar generatif per beat pada MVP.
4. Bahasa respons yang dipilih didukung pipeline backend nanti; bila tidak, fallback dijelaskan bukan diganti diam-diam.
5. Perangkat target mampu memutar gambar <=500 KB dan log tervirtualisasi tanpa jank.
6. Reset UTC dapat diterima bila waktu lokal selalu ditampilkan.
7. Contoh demo dewasa tidak berarti seluruh katalog dewasa.
8. Pemain menerima bahwa AI dapat menolak aksi yang melanggar kepribadian/batas.
9. Pemain menerima bahwa teks lama dapat keluar dari konteks model; save tidak hilang.
10. Tap ganda dan koneksi buruk adalah kejadian normal, bukan edge case.

## 5. Risiko utama

| ID | Risiko | Dampak | Mitigasi dalam rencana |
|---|---|---|---|
| R-01 | Context dimaknai sebagai penyimpanan permanen | Klaim menyesatkan | 08 menjelaskan beda log/konteks/allowance |
| R-02 | Compaction disebut anti-pikun sempurna | Kepercayaan rusak | Bukti sumber, versi, fallback, larangan klaim |
| R-03 | Custom input dianggap perintah absolut | NPC terasa rusak / unsafe | Semantik upaya + penolakan beralasan |
| R-04 | Spoiler hubungan dari beat belum dibaca | Kejutan cerita bocor | Canonical vs presented vs replay cursor |
| R-05 | Retry membuat turn/kuota ganda | Saldo dan cerita rusak | Operation id, ownership, settlement sekali |
| R-06 | Aset invalid menyebabkan identitas palsu | Canon rusak | Validasi manifest + fallback netral |
| R-07 | Ikon chat disangka chat manusia | Ekspektasi salah | Label Journey + onboarding + empty state |
| R-08 | Paid 256k tidak didukung provider | Pelanggaran janji paket | Gate provider sebelum menjual Paid |
| R-09 | Auto menghabiskan token diam-diam | Biaya dan kepercayaan | Auto hanya membaca cache |
| R-10 | Anak mengakses katalog dewasa | Hukum/distribusi | Usia wajib + gate rating sebelum rilis |
| R-11 | Input sensitif masuk log/telemetri | Privasi bocor | Redaksi, ekspor aman, audit payload |
| R-12 | Dua perangkat menulis journey sama | Duplikasi/konflik | Sesi penulis tunggal + konflik eksplisit |
| R-13 | Tanpa koneksi disalahartikan bisa bermain | Frustrasi | Pesan tanpa koneksi berbeda dari kuota habis; draft dan posisi baca tetap utuh |
| R-14 | Hapus salah journey | Kehilangan permanen | Konfirmasi spesifik + hasil server + undo window bila didukung |
| R-15 | Telemetri merekam teks cerita | Pelanggaran privasi | Hanya event nonteks + inspeksi payload |
| R-16 | Mock dianggap AI nyata | Demo menipu | Label simulator + NFR-16 |

## 6. Keputusan yang sengaja tidak diambil sekarang

Harga dan pajak, provider/hosting final, login sosial/email, gateway pembayaran, CMS admin, moderasi operasional, SLA/latency, retensi hukum. Kandidat model Free Gemma 4 E4B uncensored dan Paid `mistral-medium-latest` belum menjadi keputusan final sampai O-08a/O-08b lolos. Dokumen tidak mengarang harga, versi model, atau angka benchmark.

## 6a. Penguncian gate F0 — 30 September 2026

Status: **F0 LOLOS (kondisional)**. Nama produk dikunci; sisa pertanyaan memakai default yang disetujui pemilik produk.

| ID | Keputusan final |
|---|---|
| O-01 | Nama produk: **fayLN** |
| O-02 | Android-first, iOS-ready |
| O-03 | React Native + Expo + TypeScript |
| O-04 | Kuota Paid harian |
| O-05 | Satuan konteks desimal (64.000 / 256.000) |
| O-06 | Reset 00.00 UTC, ditampilkan dalam waktu lokal |
| O-07 | Usulan rilis awal 18+; keputusan rating final menyusul |
| O-08a/O-08b | Kandidat model terdaftar tetapi **belum terverifikasi**; Paid belum boleh dijual |

Konsekuensi: F1 (fondasi frontend) boleh dimulai. F4 (backend nyata) tetap terkunci sampai O-08a/O-08b dan O-09 selesai.

## 7. Catatan penguncian 29 September 2026

- Frontend-only dikonfirmasi; backend dan aset final menyusul. Aset gambar dibuat manual mengikuti manifest; AI tidak menciptakan aset baru pada MVP.
- Rate limit + abuse detection disetujui. Keduanya ditegakkan di server; frontend hanya menampilkan status, retry aman, dan jalur banding/lapor.
- Uncensored tidak berarti tanpa batas: gate usia, consent, larangan konten seksual eksplisit, dan isolasi data tetap berlaku. Lihat FR-57, FR-59, FR-73–FR-74.
