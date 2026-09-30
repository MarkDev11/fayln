# 04 — Spesifikasi Layar

> Versi 1.0 · 29 September 2026.
> 24 layar/overlay. Setiap layar memiliki tujuan, konten, interaksi, state, validasi, microcopy, dan kriteria selesai.
> Sistem visual di [05](05-sistem-desain-dan-aset.md); runtime di [06](06-runtime-visual-novel.md).

Konvensi umum:

- Seluruh string lewat i18n ID/EN. Tidak ada teks produk hardcoded.
- Microcopy Indonesia adalah sumber; Inggris setara.
- Tombol utama satu per konteks; ikon hapus selalu di zona aman dan tidak berdampingan dengan Continue.
- Skeleton untuk loading awal; spinner inline untuk aksi; empty/error/tanpa-koneksi memiliki aksi berikutnya.
- Safe area atas/bawah dihormati; konten terakhir tidak tertutup action bar.
- Keyboard tidak menutupi composer; overlay menjeda Auto.

## SC-01 Home

Tujuan: menemukan cerita dengan cepat dan melanjutkan yang relevan.

Konten: search field; filter genre; banner lanjutkan terakhir bila ada; grid kartu sampul/judul/genre/status; tombol favorit P1.

State: loading, empty query, empty filter, error retry, offline cache, akhir pagination.

Interaksi: debounce pencarian; filter multi-genre; pull-to-refresh; kartu membuka StoryDetail dengan query/scroll dipertahankan; tekan lama menampilkan info ringkas bila tersedia.

Kriteria: query kembali tetap sama; tidak ada banner promosi memotong katalog; 100 item tetap halus secara virtualized.

## SC-02 Setup dan Gerbang Akun

Tujuan: onboarding progresif dan pembuatan akun sebelum biaya AI.

Konten: manfaat singkat; field nama dan usia; dua pilihan bahasa; status konektivitas; penjelasan tamu versus akun.

Validasi: nama 1–30 karakter; usia angka wajar; di bawah ambang rilis tidak dapat lanjut ke generasi; error inline dan aksesibel.

Kriteria: tamu masih dapat menjelajah; tidak ada journey produksi sebelum identitas dan persetujuan usia; kredensial tidak disimpan sebelum login sukses.

## SC-03 StoryDetail

Tujuan: memahami dunia dan tokoh sebelum berkomitmen.

Konten: sampul; judul; genre; sinopsis nonspoiler; status dunia; kartu karakter publik; peringatan konten; tombol Mulai di bawah; tombol favorit P1.

State: versi dunia tampil; retired/revoked berbeda; aset gagal memakai fallback.

Kriteria: hubungan awal admin terlihat tetapi jelas bukan hubungan save; tombol tidak menutup baris terakhir; versi tercatat untuk setup berikutnya.

## SC-04 CharacterSheet

Tujuan: profil sesuai hak baca.

Mode publik: identitas, peran, trait, backstory yang diizinkan, relasi awal yang diizinkan.

Mode seen: ditambah hubungan journey saat ini, momen penting yang sudah dibaca, dan status memori ringkas.

Larangan: tidak ada rahasia admin, prompt internal, atau efek dari beat yang belum dibaca.

Kriteria: spoiler tidak bocor; label hubungan memakai teks, bukan angka persahabatan yang menyesatkan.

## SC-05 SetupPersona

Tujuan: menetapkan identitas protagonis untuk journey baru.

**Kapan muncul:** hanya bila profil di Pengaturan belum lengkap (nama atau usia belum sah).
Bila profil sudah lengkap, Mulai Perjalanan langsung membuat journey memakai nilai profil,
tanpa menampilkan lembar ini. Nilai awal pada lembar diambil dari profil sehingga pemain
tidak mengetik ulang.

Konten: nama default; usia persona; bahasa respons untuk journey; ringkasan dunia; catatan
bahwa nama dan usia akan disimpan ke Pengaturan; tombol Buat & Mulai.

Validasi: nama wajib; usia persona tidak boleh dipakai menurunkan batas akun; custom persona visual P1 perlu persetujuan konten.

Kriteria: request idempotent; tap ganda tidak membuat journey ganda; konflik satu-aktif per world ditangani tanpa overwrite diam-diam; bila pembuatan gagal, lembar dibuka kembali agar pemain punya jalan keluar.

## SC-06 JourneyList

Tujuan: mengelola semua save dengan jelas.

Konten: kartu cover, judul dunia, pembaruan terakhir, status belum selesai dibaca, tier/versi ringkas.

State: kosong pertama; kosong karena arsip; error; login diperlukan.

Kriteria: urutan terakhir dimainkan; filter status/genre P1 tidak merusak default sederhana.

## SC-07 JourneyDetail

Tujuan: meninjau satu save sebelum melanjutkan atau menghapus.

Konten: sinopsis dunia; progres beat/decision; kartu NPC dengan hubungan journey itu; status memori ringkas; akses log read-only.

Action bar bawah: Continue primer; ikon hapus sekunder; arsip P1 terpisah dari hapus.

Kriteria: data berasal dari presented-state journey; tidak memakai data katalog publik untuk hubungan; tombol aman dari tap tidak sengaja.

## SC-08 Player Stage

Tujuan: pengalaman VN imersif.

Konten: background; karakter fokus; panel pemeran kecil bila relevan; dialogue box; nama pembicara; indikator mengetik; kehadiran Auto/Log/NPC/menu ringkas.

Interaksi: tap advance; tahan untuk mempercepat opsi aksesibilitas; swipe opsional nonwajib; pinch-zoom tidak wajib.

State: loading adegan; mengetik; menunggu AI; conflict; tanpa koneksi; quota-block.

Kriteria: teks lengkap selalu dapat dibaca; indikator AI tidak diklaim sebagai save; satu portrait fokus per beat.

## SC-09 Decision dan Composer

Tujuan: memilih atau menulis tindakan secara sadar.

Konten: tepat tiga kartu opsi dengan label niat; composer multiline; penghitung karakter; tombol Kirim; status kuota/context ringkas.

Aturan: opsi terkunci setelah dipilih; draft tidak hilang karena rotasi/error; kirim membutuhkan konfirmasi implisit melalui tombol; tidak ada auto-pilih.

Validasi: kosong, terlalu panjang, pola kontrol/injeksi, dan bahasa tak didukung ditangani dengan pesan aman.

Kriteria: setiap decision dapat diselesaikan oleh keyboard dan screen reader; tidak ada countdown paksa.

## SC-10 LogDrawer

Tujuan: meninjau apa yang telah terjadi.

Konten: narasi, dialog, aksi pemain, perubahan hubungan, pemisah sesi/compaction; pencarian lokal dan bookmark P1.

Aturan: read-only; membuka tidak memanggil AI; spoiler di luar replay cursor disembunyikan.

Kriteria: 1.000 entri tetap dapat discroll; teks tidak terpotong pada skala besar.

## SC-11 NPCInspector

Tujuan: memahami tokoh yang sedang tampil.

Konten: portrait, nama, trait terungkap, hubungan journey, memori relevan yang telah terlihat, tombol buka CharacterSheet.

Kriteria: tidak menampilkan karakterVersion rahasia, skrip AI, atau fakta yang belum diperkenalkan secara diegetik.

## SC-12 Auto dan Pause Overlay

Tujuan: membaca hands-free dengan aman.

Konten: status Auto Aktif; kecepatan; tombol Jeda; penyebab jeda otomatis.

Aturan: Auto mulai ulang hanya oleh pengguna; jeda saat modal/background/keyboard; berhenti di decision.

Kriteria: tidak ada token baru; tidak ada aksi otomatis; pengguna selalu tahu alasan berhenti.

## SC-13 Status Generasi dan Gangguan

Tujuan: membuat penantian dan kegagalan dapat dipahami.

Konten: status jujur; tombol Batal aman; retry operation sama; laporan masalah; detail teknis disembunyikan default.

Kriteria: tidak ada persentase palsu; hasil terlambat tidak menimpa turn baru; draft tidak hilang.

Tambahan rate limit/abuse (FR-73–FR-74):

- Kartu `RATE_LIMITED` menampilkan alasan aman, hitung mundur buka, dan tombol Coba lagi yang memakai operation ID sama.
- Kartu `ABUSE_WARN/BLOCKED` menampilkan durasi, alasan aman, tombol Banding/Lapor, dan Auto yang terjeda otomatis.
- Skor/aturan deteksi tidak ditampilkan; Log dan Pengaturan tetap dapat dibuka saat diblokir.

## SC-14 Journey Berakhir

Tujuan: membedakan akhir naratif dari error.

Konten: ringkasan nonspoiler; status hubungan akhir; aksi baca ulang, kembali, mulai dunia lain; umpan balik opsional.

Kriteria: akhir hanya berasal dari kebijakan naratif yang sah; tombol mulai ulang tidak menghapus journey lama tanpa konfirmasi.

## SC-15 Pengaturan Root

Tujuan: menemukan semua kontrol dalam satu tempat.

Konten: Profil; Bahasa; Membaca & Aksesibilitas; Paket & Penggunaan; Privasi & Data; Bantuan; Tentang.

Kriteria: tidak ada pengaturan yang mengubah hubungan/kuota secara lokal; badge menunjukkan item perlu perhatian tanpa teks sensitif.

## SC-16 Profil dan Persona

Tujuan: mengelola identitas akun dan persona.

Konten: nama akun dan usia akun (dapat disunting, dengan validasi inline dan tombol simpan);
bahasa respons cerita; catatan bahwa nilai ini dipakai sebagai awalan cerita baru; penanda
bila profil belum lengkap; catatan penyimpanan bila perangkat tidak menyimpan permanen;
daftar persona per journey P1.

Aturan: persona journey aktif hanya berubah lewat konfirmasi eksplisit; perubahan usia memicu evaluasi konten; **perjalanan yang sudah berjalan tidak ikut berubah** karena persona di-snapshot saat journey dibuat (D-09).

Kriteria: tidak ada rewrite diam-diam pada log lama; validasi nama dan usia memakai aturan yang sama dengan SC-05; bahasa respons berlaku untuk cerita berikutnya, bukan riwayat lama.

## SC-17 Bahasa

Tujuan: mengelola dua bahasa independen.

Konten: Bahasa UI ID/EN; Bahasa respons; daftar bahasa respons didukung; fallback dijelaskan.

Kriteria: ganti UI tidak memanggil AI; ganti respons hanya memengaruhi request berikutnya; log lama tidak diterjemahkan otomatis.

## SC-18 Paket dan Penggunaan

Tujuan: transparansi kapasitas.

Konten: tier aktif; spent/reserved/available; reset lokal; konteks dan status compaction; CTA upgrade; riwayat pemakaian ringkas.

Aturan: angka estimasi dibedakan dari tagihan final; harga tidak dikarang; pembelian menunggu integrasi rilis.

Kriteria: pemain dapat menjelaskan batas harian versus konteks; kuota habis tidak mengunci Log/pengaturan.

## SC-19 CompactionStatus Paid

Tujuan: membuat memori dapat diaudit.

Konten: versi memori; cakupan turn; waktu; biaya; fakta terlihat; sumber bukti; tombol lihat detail aman.

Kriteria: sumber tidak dihapus sebelum sukses; gagal memiliki retry; Free melihat penjelasan tanpa tombol yang menipu.

## SC-20 Memori dan Fakta Terlihat

Tujuan: menampilkan yang diingat model tanpa membocorkan rahasia.

Konten: fakta journey yang sudah terlihat; asal turn/compaction; tombol laporkan ketidakakuratan.

Kriteria: tidak ada prompt internal, secret admin, atau fakta dari beat belum dibaca.

## SC-21 Cache Aset dan Koneksi

Tujuan: mengelola penyimpanan lokal dan menjelaskan kebutuhan koneksi.

Konten: ukuran cache aset dan draft; tombol bersihkan per kategori; penjelasan bahwa bermain
memerlukan koneksi karena cerita dihasilkan AI; status kehilangan koneksi di tengah sesi.

Aturan: **tidak ada mode baca offline.** Cache hanya mempercepat tampilan. Kehilangan koneksi
di tengah sesi tidak menghapus draft maupun posisi baca; pemain dapat mencoba lagi setelah
tersambung.

Kriteria: hapus cache tidak menghapus save atau draft aktif tanpa konfirmasi; tidak ada klaim enkripsi yang belum diputuskan; pesan tanpa koneksi berbeda dari kuota habis dan world ditarik.

## SC-22 Privasi, Bantuan, dan Pelaporan

Tujuan: kendali dan bantuan.

Konten: kebijakan ringkas; kontrol telemetri; ekspor aman P1; hapus akun P1-rilis; FAQ AI/kuota; formulir lapor dengan konteks yang dipilih pengguna.

Kriteria: pelaporan menjeda Auto; tidak ada isi cerita mentah dalam analytics default.

## SC-23 Konfirmasi Hapus

Tujuan: mencegah kehilangan permanen.

Konten: judul dunia, tanggal mulai, jumlah beat/decision, peringatan tidak dapat dibatalkan; input/two-step sesuai kebijakan; hasil sukses/gagal eksplisit.

Kriteria: journey lain tidak terpengaruh; analytics hanya mencatat ID dan hasil.

## SC-24 Auth, Sesi, dan Update

Tujuan: menangani identitas dan versi.

Konten: login; sesi kedaluwarsa; konflik perangkat; update wajib; maintenance.

Kriteria: save akun lama tidak tampil setelah ganti akun; update tidak menghapus cursor/draft; konflik tidak melakukan merge diam-diam.
