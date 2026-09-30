# ULTRAPLAN FRONTEND — Project2

> **Konsep:** aplikasi mobile visual novel dinamis berbasis AI, dengan dunia dan karakter yang dikurasi admin.
> **Tanggal:** 29 September 2026 · **Versi:** 1.0 · **Status:** draf komprehensif untuk ditinjau, belum disetujui untuk implementasi.
> **Bahasa dokumen:** Bahasa Indonesia. **Nama produk: fayLN** (dikunci 30 September 2026). `project2` tetap nama direktori internal.

## 1. Inti produk dalam satu kalimat

Pemain memilih sebuah dunia cerita, masuk sebagai tokoh dengan identitasnya sendiri, lalu menjalani visual novel yang narasi, percakapan, pilihan, dan konsekuensinya dihasilkan AI secara dinamis—sementara gambar, karakter, aturan dunia, dan kesinambungan keadaan tetap terkendali.

Ini **bukan aplikasi chat biasa yang diberi gambar**. Bentuk utama saat bermain adalah panggung visual novel: latar, karakter yang sedang tampil, ekspresi, kotak narasi/dialog, tombol lanjut, tiga pilihan, dan kolom tindakan bebas.

## 2. Apa yang dibuat pada pekerjaan ini

```text
project2/
├── docs/       <- seluruh perencanaan frontend dan kontrak pendukung
├── backend/    <- disiapkan, sengaja kosong
└── frontend/   <- disiapkan, sengaja kosong sampai gate persetujuan
```

Tidak ada aplikasi, server, database, pemanggilan AI, pembelian, akun cloud, atau aset gambar yang dibuat pada tahap ini. Contoh JSON dan struktur kode di dalam dokumen adalah **spesifikasi**, bukan implementasi. Backend dibahas hanya sejauh diperlukan agar frontend tidak dibangun di atas asumsi yang salah.

Rencana ini berdiri sendiri. Stack Laravel, aturan HTML tanpa framework, dan metode kerja khusus `project1` tidak otomatis diwariskan ke `project2`.

## 3. Pemahaman terhadap permintaan

### Home

- Daftar cerita berbagai genre; gambar sampul dan judul menjadi fokus.
- Pencarian dan filter genre berada di area atas.
- Navigasi bawah memiliki tepat tiga tujuan utama: **Home**, **Journey** dengan ikon percakapan, dan **Pengaturan**.
- Membuka kartu membawa pemain ke detail cerita: judul, sinopsis, genre, karakter, serta **Start Journey** yang menetap di bawah saat konten digulir.

### Bermain

- AI bertindak sebagai narator dan memainkan NPC sesuai world building, riwayat, dan kepribadian mereka.
- Perintah terstruktur memilih latar dan ekspresi karakter dari aset yang tersedia; frontend tidak mengeksekusi teks AI sebagai kode.
- Setiap titik keputusan memiliki tiga pilihan hasil AI dan alternatif input bebas.
- Tindakan pemain memengaruhi hubungan NPC. Hubungan tersimpan **per journey**, bukan berubah secara global pada seluruh pemain.
- Tersedia **Auto**, **Log/Riwayat**, lanjut manual, penyimpanan otomatis, dan pemulihan setelah aplikasi ditutup.

### Journey

- Ikon percakapan membuka koleksi perjalanan, **bukan inbox atau chat satu-lawan-satu**.
- Detail journey memakai struktur detail cerita, tetapi menampilkan keadaan dan hubungan NPC pada perjalanan tersebut.
- **Continue** dan ikon hapus berada pada area bawah yang menetap. Penghapusan selalu memerlukan konfirmasi yang menyebut perjalanan yang akan dihapus.

### Pengaturan

- Nama, usia, bahasa UI, dan bahasa respons adalah fitur inti.
- Pelengkap yang diusulkan: kenyamanan membaca, tema, gerakan, penggunaan token, paket, privasi, dan bantuan.
- Bahasa UI dan bahasa respons AI terpisah. Mengganti bahasa UI tidak menerjemahkan log lama dan tidak memanggil AI.

### Paket

| Aspek | Free | Paid |
|---|---|---|
| Batas konteks yang diminta | 64k | 256k |
| Kuota token yang diminta | 100.000 per hari | 1.000.000; **periode harian masih asumsi** |
| Perhitungan | Input + output | Input + output; usulan mencakup compaction |
| Compaction naratif | Tidak ada | Ada; menghasilkan artefak memori |
| Log yang dapat dibaca pemain | Tetap disimpan | Tetap disimpan |
| Keadaan mekanis: hubungan, lokasi, flag | Tetap disimpan | Tetap disimpan |

**Perbedaan penting:** riwayat tersimpan tidak sama dengan riwayat yang sedang dimasukkan ke model. Free dapat kehilangan akses model terhadap kejadian lama tanpa menghapus log pemain. Paid meningkatkan kesinambungan melalui memori terstruktur, tetapi tidak boleh dipasarkan sebagai “mustahil lupa”.

## 4. Rekomendasi produk utama

1. **Native mobile, portrait-first, Android lebih dahulu**, dengan desain yang tidak menghalangi iOS. Ini usulan, bukan keputusan pengguna yang telah disahkan.
2. **React Native + Expo + TypeScript** sebagai kandidat utama. Alasan dan alternatif ada di dokumen 09; versi baru dipilih saat implementasi dimulai.
3. **Art-led, chrome minimal.** Tidak ada hero promosi besar, lima tab, feed sosial, statistik berlebihan, atau paywall yang memotong dialog.
4. **Satu giliran AI = satu paket adegan tervalidasi.** Pemain membaca beberapa beat; bukan satu request AI pada setiap tap Next.
5. **Keadaan cerita dan posisi baca dipisahkan.** Adegan yang sudah dihasilkan tetapi belum dibaca tidak membocorkan perubahan hubungan melalui layar Journey.
6. **Auto hanya membaca.** Auto berhenti pada pilihan dan tidak pernah memilih, mengirim input, atau menghabiskan token baru dengan sendirinya.
7. **Free tetap layak dimainkan.** Batas konteks tidak digunakan untuk sengaja merusak hubungan NPC, menghapus save, atau mengunci aksesibilitas.
8. **Pembuatan frontend dimulai dengan simulator deterministik.** Label demo harus jelas; respons fixture tidak boleh diklaim sebagai AI dinamis sungguhan.

## 5. Daftar dokumen dan urutan membaca

| Dokumen | Pertanyaan yang dijawab |
|---|---|
| [01 — Visi, lingkup, dan kebutuhan](01-visi-lingkup-dan-kebutuhan.md) | Apa yang wajib, tambahan yang berguna, dan yang ditunda? |
| [02 — Keputusan, asumsi, dan risiko](02-keputusan-asumsi-dan-risiko.md) | Mana permintaan pengguna, usulan desain, dan hal yang belum diputuskan? |
| [03 — Arsitektur informasi dan alur](03-arsitektur-informasi-dan-alur.md) | Bagaimana pemain berpindah layar dan pulih dari interupsi? |
| [04 — Spesifikasi layar](04-spesifikasi-layar.md) | Apa isi, interaksi, state, dan kriteria selesai setiap layar? |
| [05 — Sistem desain dan aset](05-sistem-desain-dan-aset.md) | Bagaimana tampil bersih, nyaman, dan konsisten di ponsel? |
| [06 — Runtime visual novel](06-runtime-visual-novel.md) | Bagaimana scene, dialog, pilihan, Auto, dan penyimpanan bekerja? |
| [07 — World, karakter, dan relasi](07-world-karakter-dan-relasi.md) | Apa yang ditulis admin dan apa yang boleh berubah saat bermain? |
| [08 — Tier, token, dan memori](08-tier-token-dan-memori.md) | Bagaimana batas konteks, kuota, compaction, dan perpindahan paket bekerja? |
| [09 — Arsitektur frontend dan kontrak](09-arsitektur-frontend-dan-kontrak.md) | Bagaimana frontend disusun dan kontrak minimum apa yang diperlukan? |
| [10 — Pengaturan, privasi, dan aksesibilitas](10-pengaturan-privasi-dan-aksesibilitas.md) | Bagaimana identitas, bahasa, keselamatan, dan kendali pemain ditangani? |
| [11 — Demo dan skenario uji](11-demo-dan-skenario-uji.md) | Seperti apa contoh cerita dan bagaimana perilakunya dibuktikan? |
| [12 — Roadmap, backlog, dan gate](12-roadmap-backlog-dan-gate.md) | Dalam urutan apa frontend dibangun tanpa melompati validasi? |
| [13 — Keterlacakan dan review](13-matriks-keterlacakan-dan-review.md) | Apakah setiap kebutuhan punya wujud dan pengujian? |

**Baca cepat:** 00 → 02 → 04 → 08 → 12.

**Untuk implementasi frontend:** 03 → 05 → 06 → 07 → 09 → 10 → 11 → 13.

**Untuk backend nanti:** 06 → 07 → 08 → 09. Dokumen tersebut tidak menentukan framework backend.

## 6. Arsitektur konseptual

```text
Admin menyusun WorldVersion + CharacterDefinition + AssetManifest
                              |
                              v
Home -> Detail cerita -> Persona -> Journey baru
                                      |
                                      v
                  Input pemain / pilihan dari adegan sebelumnya
                                      |
                  [NANTI: otorisasi + budget + AI + validasi]
                                      |
                    Paket giliran yang sudah di-commit
                                      |
                                      v
            Visual Novel Player -> posisi baca -> Journey detail
                    |                    |
                    +-> Log              +-> hubungan yang telah terlihat
                    +-> Auto
                    +-> inspector NPC

Pengaturan -> preferensi lokal + profil + bahasa respons + paket/kuota
```

Frontend memegang presentasi dan cache; server kelak menjadi otoritas akun, token, entitlement, hasil generasi, dan perubahan keadaan. Model adalah **pengusul narasi dan efek**, bukan otoritas pembayaran, file sistem, atau hak akses.

## 7. Perbaikan yang sengaja ditambahkan

- Pemisahan profil akun dan persona per perjalanan agar perubahan nama tidak mengubah cerita lama secara diam-diam.
- Tiga pilihan yang berbeda niat, bukan tiga parafrasa jawaban yang sama.
- Tindakan bebas dianggap **upaya pemain**, bukan perintah yang pasti sukses atau menghapus kehendak NPC.
- Pengembalian ke posisi baca, bukan hanya ke dialog terbaru di server.
- Peringatan kontinuitas yang jujur dan indikator pemakaian token tanpa menutupi panggung.
- Sesi tunggal penulis per journey untuk mencegah dua perangkat menggandakan adegan.
- Aset fallback, mode tanpa gerakan, font besar, dan log ramah pembaca layar.
- Riwayat tetap dapat dibaca saat offline, tetapi input tidak dikirim otomatis setelah jaringan kembali.
- Katalog world terversi agar admin memperbarui cerita tanpa merusak journey lama.
- Penghapusan journey, keluar akun, serta penghapusan akun dibedakan dengan jelas.

Fitur seperti voice AI, gambar real-time, multiplayer, creator marketplace, leaderboard, dan infinite regenerate sengaja tidak masuk MVP. Memanjakan pemain tidak berarti menambah gangguan atau biaya tak terlihat.

## 8. Hal yang harus dipahami sebelum menyetujui rencana

- **64k/256k bukan kuota harian.** Konteks adalah kapasitas satu request; token harian adalah akumulasi seluruh request yang dikenakan kuota.
- Prompt lama yang dikirim ulang kembali menghitung token input. Kuota 100.000 tidak berarti 100.000 token cerita baru yang dapat dibaca.
- Paid 256k hanya dapat dipenuhi dengan provider/model yang benar-benar mendukung kontrak tersebut. Belum ada provider yang dipilih atau diuji.
- Compaction memakai token dan dapat kehilangan detail. Dokumen 08 menentukan bukti sumber, validasi, dan pemulihan untuk mengurangi dampaknya.
- “100% dinamis” berlaku untuk kelanjutan cerita dalam batas world dan keselamatan; bukan hak model menciptakan aset tak tersedia, mengganti aturan, atau memaksa tindakan pemain.
- Runtime demo menggunakan contoh kantor dengan tokoh dewasa. Usulan batas usia katalog awal perlu disetujui sebelum implementasi.
- Tidak ada harga, janji latency, kapasitas server, atau tanggal rilis yang sudah dikonfirmasi.

## 9. Sumber kebenaran dan perubahan

| Topik | Dokumen pemilik |
|---|---|
| Definisi kebutuhan FR/NFR | 01 |
| Status keputusan dan pertanyaan terbuka | 02 |
| Isi dan perilaku layar | 04 |
| Token visual dan komponen | 05 |
| Event, state machine, dan posisi baca | 06 |
| Canon world dan hubungan | 07 |
| Kuota, tier, dan compaction | 08 |
| DTO, endpoint, dan ownership data | 09 |
| Pengaturan dan privasi | 10 |
| Acceptance test | 11 |
| Gate dan urutan pelaksanaan | 12 |
| Bukti cakupan lintas dokumen | 13 |

Bila ada konflik, jangan mengambil keputusan diam-diam berdasarkan dokumen yang terakhir dibaca. Perbaiki dokumen pemilik, identifikasi seluruh layar/kontrak/uji terdampak, kemudian perbarui matriks 13. Status draf tidak berubah menjadi “approved” hanya karena dokumennya lengkap.

## 10. Gate berikutnya

**Status gate F0: LOLOS (kondisional), 30 September 2026.** Nama produk **fayLN** dikunci; O-02 sampai O-07 memakai default yang disetujui; O-08a/O-08b (verifikasi model) dan O-09 (login/entitlement) tetap terbuka tetapi hanya memblokir F4, bukan F1.

Yang boleh dimulai sekarang: **F1 — fondasi frontend** (struktur Expo + TypeScript, routing, i18n ID/EN, token tema, komponen dasar, mock gateway, fixture demo). Yang tetap terkunci: backend nyata, pembayaran, dan integrasi model produksi.

Rincian gate dan urutan pekerjaan ada di dokumen 12. **Memulai F1 tetap menunggu perintah eksplisit pengguna.**
