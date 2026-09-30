# 01 — Visi, Lingkup, dan Kebutuhan

> Versi 1.0 · 29 September 2026 · Draf untuk review.
> Pemilik definisi FR/NFR. Rujukan utama: [00](00-ultraplan-frontend.md), [02](02-keputusan-asumsi-dan-risiko.md), dan [13](13-matriks-keterlacakan-dan-review.md).

## 1. Masalah dan proposisi nilai

Visual novel konvensional memiliki alur dan pilihan yang sudah ditulis. Aplikasi percakapan AI memberi kebebasan, tetapi sering kehilangan panggung visual, konsistensi karakter, kemajuan cerita, dan rasa sedang memainkan sebuah dunia.

Project2 menggabungkan:

1. **Panggung visual novel** yang membiarkan ilustrasi, ekspresi, dan dialog memimpin.
2. **Kebebasan bertindak** melalui tiga pilihan kontekstual atau teks bebas.
3. **Dunia yang memiliki batas** sehingga kebebasan tidak berubah menjadi cerita acak tanpa konsekuensi.
4. **Hubungan yang berkelanjutan**, berbeda pada setiap journey.
5. **Transparansi kapasitas AI**, bukan janji memori sempurna atau hitungan pesan yang menyesatkan.

Pemain ideal ingin mengalami cerita dan membentuk hubungan antartokoh, bukan mengelola prompt, memilih model, atau memahami JSON.

## 2. Istilah yang dibekukan untuk draf

| Istilah | Makna |
|---|---|
| World / dunia cerita | Paket premis, aturan, lokasi, karakter, serta aset yang diterbitkan admin |
| WorldVersion | Versi terbit yang dipasangkan secara tetap ke journey |
| CharacterDefinition | Identitas, backstory, kepribadian, batas perilaku, dan aset NPC dari admin |
| Journey | Satu jalur permainan milik satu akun; memiliki persona, log, keadaan, dan posisi baca sendiri |
| Turn / giliran | Satu input pemain atau permintaan pembukaan, beserta hasil generasi tervalidasi |
| Beat | Unit narasi/dialog yang dapat dibaca sebelum Next |
| Event | Perintah data terstruktur, misalnya mengganti latar atau menampilkan dialog |
| Canonical state | Keadaan hasil seluruh turn yang sudah disahkan server |
| Presented state | Keadaan yang sudah boleh dilihat sesuai posisi baca pemain |
| Log | Riwayat yang dapat dibaca; tidak identik dengan konteks aktif model |
| Context window | Batas token input dan output yang dapat ditampung dalam satu pemanggilan model |
| Daily allowance | Kuota akumulasi token yang dibebankan kepada akun per periode |
| Compaction | Peringkasan terstruktur dengan sumber bukti untuk mempertahankan kesinambungan naratif |
| Memory artifact | Berkas memori hasil compaction yang terversi dan disimpan persisten |

Gunakan **Journey** sebagai nama tab agar tidak disalahartikan sebagai daftar pesan. Label tombol dapat dilokalkan: `Start Journey` / `Mulai Perjalanan`, `Continue` / `Lanjutkan`. Ejaan `Journey` digunakan konsisten, bukan `Jurney`.

## 3. Aktor dan batas tanggung jawab

| Aktor | Dapat melakukan | Tidak berhak melakukan |
|---|---|---|
| Pengunjung | Menjelajah katalog, melihat detail publik, mencoba demo yang jelas berlabel | Mengakses journey akun lain atau mengaku memiliki kuota produksi |
| Pemain Free | Membuat/melanjutkan journey, memberi pilihan/input, membaca log, memakai pengaturan inti | Memakai compaction naratif otomatis |
| Pemain Paid | Semua kemampuan inti ditambah konteks/kuota lebih besar dan compaction | Memaksa NPC mencintai pemain, mengabaikan keselamatan, atau memperoleh memori tanpa batas |
| Admin kurator | Menulis dan menerbitkan world, karakter, aset, rating, versi | Mengubah diam-diam canon journey aktif tanpa kebijakan migrasi |
| Layanan AI | Mengusulkan narasi, dialog, pilihan, dan efek yang diizinkan | Mengubah tier, menjalankan kode, membaca data journey lain, atau mengotorisasi tagihan |
| Backend kelak | Menegakkan identitas, budget, state, kontrak, isolasi, penyimpanan | Mempercayai nilai kuota/hubungan yang dikirim frontend tanpa validasi |

Admin CMS dan backend produksi bukan hasil pekerjaan ini. Kontrak kontennya tetap dibutuhkan agar frontend bisa dibuat tanpa menebak bentuk data.

## 4. Tingkat prioritas

- **P0:** jalur inti yang harus ada sebelum beta end-to-end. Pada fase frontend, perilakunya dibuktikan melalui simulator; backend nyata baru diuji pada gate integrasi.
- **P1:** peningkatan pengalaman setelah jalur inti stabil, atau item wajib-rilis yang menunggu integrasi eksternal. Catatan `rilis` tidak boleh diartikan opsional untuk produksi.
- **P2:** ekspansi setelah validasi produk; tidak dimasukkan ke implementasi awal.
- **U:** berasal langsung dari pengguna.
- **R:** rekomendasi untuk melengkapi alur atau menghindari kerusakan pengalaman.

Prioritas bukan persetujuan. Semua rekomendasi tetap tunduk pada review dokumen 02.

## 5. Kebutuhan fungsional — 74 butir

### A. Penemuan dunia dan pembukaan journey

| ID | Asal | Prioritas | Kebutuhan dan hasil yang harus terlihat |
|---|---|---|---|
| FR-01 | U | P0 | Home menampilkan kartu sampul dan judul lintas genre, dengan pagination serta fallback gambar. |
| FR-02 | U | P0 | Pencarian judul bekerja dari area atas; query dipertahankan saat kembali dari detail. |
| FR-03 | U | P0 | Filter genre dari area atas mendukung pilihan jamak, Apply, Reset, jumlah filter aktif, dan hasil kosong yang jelas. |
| FR-04 | R | P0 | Home memiliki akses ringkas untuk melanjutkan journey terakhir tanpa mengalahkan katalog. |
| FR-05 | R | P1 | Pemain dapat menandai cerita favorit; favorit bukan save perjalanan. |
| FR-06 | U | P0 | Detail world menampilkan judul, sinopsis, genre, serta informasi dunia yang publik. |
| FR-07 | U | P0 | Detail menampilkan kartu karakter dengan identitas/backstory publik dan hubungan awal dari admin. |
| FR-08 | R | P0 | Tema sensitif dan kelayakan usia terlihat sebelum memulai, dengan detail yang tidak membeberkan spoiler. |
| FR-09 | U | P0 | Start Journey menetap di bawah detail, menghormati safe area dan tidak menutupi baris konten terakhir. |
| FR-10 | R | P0 | Journey baru mengambil snapshot persona: nama, usia tokoh yang layak, serta preferensi relevan. |
| FR-11 | R | P0 | Pembuatan journey idempotent; tap ganda atau retry tidak membuat save ganda. |
| FR-12 | R | P0 | Journey baru terisolasi dari journey lain, termasuk yang berasal dari world yang sama; tidak menimpa tanpa persetujuan. |

### B. Mesin baca dan interaksi

| ID | Asal | Prioritas | Kebutuhan dan hasil yang harus terlihat |
|---|---|---|---|
| FR-13 | U | P0 | Player menampilkan dan mengganti background berdasarkan event scene tervalidasi. |
| FR-14 | U | P0 | Karakter fokus dan ekspresi berubah sesuai event serta aset yang tersedia. |
| FR-15 | U | P0 | Narasi dan dialog dibedakan dengan jelas, termasuk nama pembicara dan alternatif teks aksesibel. |
| FR-16 | R | P0 | Tap pertama menyelesaikan typewriter; tap berikutnya melanjutkan beat. Satu tap tidak melakukan keduanya. |
| FR-17 | U | P0 | Titik keputusan memiliki tepat tiga opsi AI yang berbeda niat dan memiliki identitas pilihan stabil. |
| FR-18 | U | P0 | Pemain dapat mengetik tindakan/dialog sendiri, meninjau draft, lalu mengirimnya secara eksplisit. |
| FR-19 | U | P0 | Auto hanya memajukan beat yang sudah tersedia dan selalu berhenti pada keputusan atau interupsi. |
| FR-20 | U | P0 | Log menampilkan narasi, percakapan, input pemain, dan perubahan yang telah dibaca; tidak memanggil model. |
| FR-21 | R | P0 | Membuka modal, aplikasi masuk background, atau panggilan sistem menjeda Auto dan playback dengan aman. |
| FR-22 | U | P0 | Perubahan hubungan tampil sebagai notifikasi singkat dan memperbarui keadaan NPC pada journey terkait. |
| FR-23 | R | P0 | Inspector NPC saat bermain menampilkan profil yang telah terungkap serta hubungan saat ini tanpa spoiler. |
| FR-24 | R | P0 | Setiap turn committed dan kemajuan baca disimpan tanpa mengharuskan tombol Save manual. |
| FR-25 | U | P0 | Continue kembali ke posisi baca aman, termasuk adanya adegan tersimpan yang belum selesai dibaca. |
| FR-26 | U | P0 | Tab Journey menampilkan perjalanan yang pernah dibuat, cover, judul, serta penanda terakhir dimainkan. |
| FR-27 | U | P0 | Detail journey menampilkan sinopsis dan kartu NPC dengan hubungan yang sudah terlihat pada journey itu. |
| FR-28 | U | P0 | Continue dan ikon hapus berada pada action bar bawah; hapus selalu melalui konfirmasi spesifik journey. |
| FR-29 | R | P1 | Bookmark menandai beat untuk dibaca ulang, tidak mengubah jalur cerita atau konsumsi token. |
| FR-30 | R | P0 | Membaca ulang log bersifat read-only; tidak menerapkan efek hubungan atau tagihan dua kali. |

### C. Profil, preferensi, dan identitas

| ID | Asal | Prioritas | Kebutuhan dan hasil yang harus terlihat |
|---|---|---|---|
| FR-31 | U | P0 | Pemain dapat mengubah nama tampilan akun; dampak pada journey baru versus aktif dijelaskan. |
| FR-32 | U | P0 | Usia diisi dan divalidasi; persona tidak dapat digunakan untuk melewati batas kelayakan akun. |
| FR-33 | U | P0 | Bahasa UI dapat diubah tanpa mengubah bahasa respons AI atau menerjemahkan riwayat. |
| FR-34 | U | P0 | Bahasa respons dipilih terpisah; perubahan pada journey aktif berlaku pada generasi berikutnya. |
| FR-35 | R | P0 | Kecepatan teks, ukuran teks, dan jeda Auto dapat diatur serta memiliki preview tanpa biaya AI. |
| FR-36 | R | P0 | Pemain dapat mengurangi gerakan dan menonaktifkan haptik; preferensi sistem dihormati. |
| FR-37 | R | P0 | Tema Sistem, Gelap, dan Terang tersedia tanpa mengubah ilustrasi cerita secara destruktif. |
| FR-38 | R | P0 | Pengaturan menyediakan penjelasan privasi, kontrol kenyamanan tema, dan pintu ke pelaporan. |
| FR-39 | R | P0 | Pengunjung dapat menjelajah; generasi produksi memerlukan identitas akun yang dapat diberi kuota. |
| FR-40 | R | P1-rilis | Login, logout, kedaluwarsa sesi, dan sinkronisasi lintas perangkat memiliki UI dan integrasi terverifikasi sebelum rilis. |

### D. Tier, token, dan kesinambungan

| ID | Asal | Prioritas | Kebutuhan dan hasil yang harus terlihat |
|---|---|---|---|
| FR-41 | U | P0 | Perbandingan Free/Paid menjelaskan konteks, token, dan memori; harga tidak dikarang. |
| FR-42 | U | P0 | Free memperoleh 100.000 token input+output per hari serta batas konteks 64k. |
| FR-43 | U | P0 | Paid memiliki batas konteks 256k dan kuota 1.000.000 token; periode harus dikonfirmasi. |
| FR-44 | R | P0 | Pemakaian menampilkan spent, reserved, available, waktu reset, dan estimasi yang dibedakan dari tagihan final. |
| FR-45 | R | P1-rilis | Pembelian, pending, pembatalan, pemulihan pembelian, dan gagal verifikasi tidak memberi entitlement hanya dari state UI. |
| FR-46 | U/R | P0 | Free menggunakan jendela riwayat bergeser tanpa ringkasan naratif otomatis; log dan keadaan mekanis tetap tersimpan. |
| FR-47 | U | P0 | Paid membuat artefak memori persisten pada compaction; sumber, versi, dan cakupan turn tercatat. |
| FR-48 | R | P0 | Compaction memiliki status, estimasi biaya, gagal/retry, dan fallback aman tanpa menghapus sumber sebelum sukses. |
| FR-49 | R | P0 | Upgrade/downgrade berlaku jelas pada request baru, tidak menghapus journey, dan tidak menjanjikan pemulihan memori instan. |
| FR-50 | R | P0 | Saat budget tidak mencukupi, generasi berhenti sebelum dikirim, tetapi log, pengaturan, dan adegan tersimpan tetap terbuka. |

### E. Keandalan, world, dan batas kepercayaan

| ID | Asal | Prioritas | Kebutuhan dan hasil yang harus terlihat |
|---|---|---|---|
| FR-51 | R | P0 | Bermain memerlukan koneksi karena cerita dihasilkan AI. Kehilangan koneksi di tengah sesi ditangani jelas: draft dan posisi baca tidak hilang, dan pemain dapat mencoba lagi saat tersambung. |
| FR-52 | R | P0 | Retry memulihkan operation yang sama; tidak membuat giliran baru atau biaya ganda. |
| FR-53 | R | P0 | Cache aset dipakai untuk mempercepat tampilan, bukan untuk mode offline. Pemain dapat membersihkannya tanpa menghapus save atau draft. |
| FR-54 | R | P0 | Journey mengikat worldVersion; perubahan katalog tidak diam-diam mengubah canon journey aktif. |
| FR-55 | R | P0 | Event AI divalidasi terhadap schema, world, karakter, aset, urutan, dan batas ukuran sebelum frontend memutarnya. |
| FR-56 | R | P0 | Secret admin, NPC belum ditemukan, serta efek dari beat yang belum dibaca tidak muncul di UI publik/log. |
| FR-57 | R | P0 | NPC menjaga batas dan agensi; input pemain adalah upaya, bukan otoritas untuk memaksa relasi atau mengubah aturan. |
| FR-58 | R | P0 | Pemain hanya dapat membaca dan mengubah journey sendiri; cache dibatasi per identitas. |
| FR-59 | R | P0 | Pemain dapat melaporkan respons/scene dengan memilih konteks yang dikirim; pelaporan menjeda Auto. |
| FR-60 | R | P0 | World retired/revoked dan aset hilang memiliki state terpisah beserta alasan yang aman ditampilkan. |
| FR-61 | R | P0 | Paid memiliki panel status memori dan fakta yang sudah boleh dilihat; tidak mengekspos prompt atau rahasia world. |
| FR-62 | R | P1 | Archive journey menyembunyikan dari daftar utama tanpa menghapus log; berbeda dari Delete. |
| FR-63 | R | P0 | Onboarding singkat mengatur preferensi penting secara progresif, bukan formulir panjang sebelum melihat katalog. |
| FR-64 | R | P0 | Pilihan tidak memakai hitung mundur wajib, tidak dipilih otomatis, dan tidak disamarkan sebagai keputusan gratis bila memicu generasi. |
| FR-65 | R | P0 | Input mendukung Unicode, keyboard/IME, batas jelas, screen reader, serta draft yang tidak hilang saat validasi gagal. |
| FR-66 | R | P0 | Pemain dapat memilih respons ringkas untuk request berikutnya dengan penjelasan bahwa input historis tetap memakai kuota. |
| FR-67 | R | P1 | Ekspor log/memori milik sendiri menghasilkan versi aman tanpa secret admin, token akun, atau data journey lain. |
| FR-68 | R | P0 | Logout dan ganti akun menghapus kredensial/cache privat sesuai kebijakan; tidak menampilkan save akun lama. |
| FR-69 | R | P1-rilis | Permintaan hapus akun menjelaskan cakupan, status proses, dan retensi yang benar-benar berlaku sebelum rilis publik. |
| FR-70 | R | P0 | Bantuan menjelaskan AI dapat keliru, perbedaan log/memori/konteks, arti kuota, dan cara melanjutkan setelah error. |
| FR-71 | R | P0 | Akhir arc/journey dibedakan dari kegagalan sistem; world berakhir hanya sesuai kebijakan naratif yang diizinkan. |
| FR-72 | R | P2 | Notifikasi pengingat bersifat opt-in dan tidak mengklaim NPC membutuhkan pemain atau memakai tekanan emosional. |
| FR-73 | K | P0 | Rate limit server tercermin di UI: status 429/dingin, estimasi buka kembali, retry aman satu operation ID, dan draft/cursor tidak hilang. |
| FR-74 | K | P0 | Abuse detection server tercermin di UI: peringatan, blokir sementara dengan alasan aman, jeda Auto, jalur banding/lapor, tanpa menampilkan skor internal. |

## 6. Kebutuhan nonfungsional — 20 butir

Seluruh angka berikut adalah **target desain yang harus diukur**, bukan hasil benchmark yang sudah tercapai.

| ID | Sasaran | Kriteria penerimaan |
|---|---|---|
| NFR-01 | Kontras | Teks normal minimal 4,5:1; teks besar dan komponen nonteks penting minimal 3:1. Verifikasi kedua tema. |
| NFR-02 | Pembesaran teks | Semua alur inti dapat diselesaikan pada skala teks 200%, tanpa menyembunyikan tombol atau memaksa teks kecil. |
| NFR-03 | Sentuhan | Target kontrol inti minimal 48 unit logis dengan jarak aman; ikon hapus tidak berdesakan dengan Continue. |
| NFR-04 | Kelancaran | Target animasi/scroll 60 fps pada perangkat acuan yang disepakati; uji daftar 100 cerita dan 1.000 entri log secara virtualized. |
| NFR-05 | Respons lokal | Target umpan balik tap <100 ms; perpindahan antar-screen cache-ready <300 ms; cold start interaktif <3 detik pada perangkat acuan. |
| NFR-06 | Aset | Thumbnail katalog diusulkan <=150 KB, scene background <=500 KB, sprite <=400 KB; ukur kualitas versus memori sebelum dibekukan. |
| NFR-07 | Idempotensi | Skenario 10 retry/duplikasi tidak menghasilkan lebih dari satu commit dan satu settlement untuk operation yang sama. |
| NFR-08 | Keamanan kontrak | Payload tak dikenal/terlalu besar/asset lintas-world ditolak; tidak ada eval, HTML AI aktif, atau secret model dalam bundle. |
| NFR-09 | Konsistensi | Head state, presented state, log, dan biaya tetap konsisten setelah crash pada setiap batas event/commit. |
| NFR-10 | Telemetri | Event analitik tidak memuat isi dialog, draft, nama, usia mentah, token autentikasi, atau secret world. |
| NFR-11 | Data lokal | Storage privat tidak disalahklaim terenkripsi; pilihan enkripsi/backup ditentukan dan diuji sebelum beta publik. |
| NFR-12 | Lokalisasi | ID/EN mencakup semua string inti, plural, angka, tanggal, dan accessibility label; raw enum tidak tampil ke pemain. |
| NFR-13 | Pemulihan | Putus jaringan, proses dimatikan, sesi habis, dan konflik perangkat tidak menghapus last committed turn atau mengirim ulang otomatis. |
| NFR-14 | Pengujian | Invariant budget, turn, cursor, dan relasi memiliki unit/property tests; seluruh jalur P0 memiliki acceptance scenario. |
| NFR-15 | Modularitas | Layar tidak mengetahui provider AI atau isi tool prompt; mengganti mock ke backend tidak menulis ulang scene renderer. |
| NFR-16 | Identitas visual | Tepat tiga tab utama; satu aksi primer per konteks; tidak ada elemen promosi yang memotong panggung. |
| NFR-17 | Kuota adil | Perhitungan server, periode jelas, reservation terlihat, tidak ada double charge karena retry teknis. |
| NFR-18 | Lifecycle | Auto, polling foreground, haptik, dan animasi berhenti saat app tidak aktif; tidak ada background generation otomatis. |
| NFR-19 | Pembaca layar | VoiceOver/TalkBack dapat membaca pembicara, teks lengkap, pilihan, status hubungan, error, dan fokus modal secara benar. |
| NFR-20 | Degradasi | Aset gagal atau fitur tambahan tak tersedia tidak menghalangi teks; keadaan tanpa koneksi, kuota habis, dan world ditarik memiliki pesan yang berbeda. |

## 7. Batas MVP dan pengendalian tambahan fitur

### Masuk inti

Katalog, detail world, persona, player VN, tiga pilihan + input, Auto, Log, relasi, Journey, Continue/Delete, profil dan bahasa, pengaturan baca, status paket/kuota/memori, cache baca, adapter mock, kontrak backend, dan pengujian.

### Tambahan yang membantu tetapi ditunda

Favorit, bookmark, archive, ekspor, musik/suara, download paket aset penuh, restore chapter visual, pencarian log lintas journey, dan rangkuman khusus berbayar yang dipicu pemain. Rangkuman tambahan memerlukan persetujuan budget dan tidak diam-diam tersedia untuk Free.

### Tidak masuk saat ini

- Marketplace world buatan pemain; admin CMS lengkap.
- Multiplayer dan chat antarpemain.
- Live2D, 3D, VR, animasi kompleks, voice cloning.
- Generasi gambar/voice real-time setiap adegan.
- Inventory/RPG combat system global yang tidak diminta.
- Leaderboard, streak menghukum, gacha, mata uang premium.
- Regenerate tanpa batas, undo yang menyembunyikan biaya, atau edit ulang masa lalu.
- Model lokal offline dengan kualitas yang belum dibuktikan.
- **Mode baca offline sebagai fitur.** Cerita dihasilkan AI, jadi bermain selalu memerlukan
  koneksi. Yang tetap dijaga hanyalah penanganan kehilangan koneksi di tengah sesi (FR-51).
- Migrasi otomatis seluruh canon ketika admin menerbitkan versi baru.

## 8. Definisi pengalaman yang berhasil

1. Orang baru memahami bahwa memilih cerita akan memulai VN, bukan membuka chat.
2. Sampul dan judul tetap menjadi elemen paling dominan di Home.
3. Pemain tahu siapa sedang berbicara, di mana scene terjadi, dan kapan ia harus memilih.
4. Respons terhadap tindakan bebas terasa masuk akal, termasuk kemungkinan ditolak NPC.
5. Keluar di tengah scene lalu Continue tidak melompati dialog atau membeberkan hubungan yang belum dibaca.
6. Kuota habis tidak membuat pemain kehilangan cerita yang sudah diperoleh.
7. Pemain dapat menjelaskan perbedaan Free/Paid tanpa menyimpulkan Paid tidak mungkin lupa.
8. Pemain dapat menghapus satu journey dengan yakin tanpa takut menghapus world atau akun.

Target numerik usability ditentukan setelah pilot kecil dan bukan dikarang sebagai hasil riset. Ukuran yang disarankan: keberhasilan menyelesaikan tugas, jumlah tap salah, pemahaman kuota, dan waktu menemukan Continue—bukan semata durasi bermain.
