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

## SC-01 Home (Beranda)

> Revisi **HOME-UX-01**. Bagian ini menggantikan spesifikasi Beranda versi 1.0 (search field + grid 2 kolom + bottom-sheet filter). Spesifikasi layar lain tidak berubah.

Tujuan: menjadikan Beranda dua hal sekaligus — **pintu kembali** ke cerita yang sedang berjalan, dan **etalase penemuan** yang dapat dipindai dalam satu layar tanpa membuka menu.

Prinsip yang mengikat revisi ini:

- **Tidak ada metrik yang diada-adakan.** fayLN tidak memiliki data jumlah pembaca, peringkat, maupun lapisan sosial. Tidak satu pun elemen Beranda menampilkan angka yang bukan milik pemain sendiri. Yang boleh tampil: beat, jumlah keputusan, dan waktu — semuanya milik pemain itu sendiri atau berasal dari data dunia.
- **Mesin cerita masih simulator deterministik yang mengabaikan dunia.** Karena itu seluruh teks Beranda hanya memakai field yang benar-benar ada (`title`, `genres`, `updatedAt`) dan tidak menjanjikan bahwa cerita akan mengikuti dunia tersebut. Tidak ada kutipan editorial, tidak ada janji "AI akan mengingat duniamu".
- **Disiplin tiga tab.** Beranda / Perjalanan / Pengaturan. Tidak ada tab keempat, tidak ada enam tombol kategori melingkar, tidak ada hero belah dua.

### SC-01.1 Urutan vertikal dan alasan urutannya

| # | Blok | Sumber data | Kondisi tampil | Alasan posisi |
|---|---|---|---|---|
| 1 | Header: judul layar + `SearchField` | lokal (state) | selalu | Pencarian adalah niat paling kuat; diletakkan paling atas agar tidak tergeser oleh konten editorial. |
| 2 | `SimulatorNotice` | konstanta `gateway.isSimulator` | selalu (mode simulator) | Penanda ini memenuhi syarat seluruh isi di bawahnya, jadi harus terbaca sebelum konten apa pun. |
| 3 | **Hero** — dunia unggulan | `useCatalog().items` → `featured` | hanya saat **tidak ada** pencarian/genre aktif **dan** `featured.length >= 1` | Satu keputusan, satu ketukan. Menjawab "aku harus baca apa?" sebelum pemain menggulir. |
| 4 | **Chip genre** (mendatar) | konstanta `GENRES` | selalu | Satu ketukan. Menggantikan bottom-sheet (buka → pilih → terapkan). |
| 5 | **Lanjutkan Bermain** (kartu mendatar) | `useJourneys()` | hanya saat **tidak ada** pencarian/genre aktif **dan** `journeys.length >= 1` (lihat SC-01.6 untuk galat) | Nilai tertinggi: mengubah katalog pasif menjadi kebiasaan kembali. Diletakkan di atas penemuan karena niat kembali lebih kuat daripada niat mencari. |
| 6 | **Baru Diperbarui** (kartu mendatar) | `useCatalog().items` **berstatus `published`** dikurangi `featured[0]`, diurutkan `updatedAt` menurun | hanya saat **tidak ada** pencarian/genre aktif **dan** sisa item >= 2 | Menjembatani hero dan katalog penuh: menunjukkan bahwa katalog hidup. Hanya dunia yang benar-benar dapat dimulai — menawarkan dunia `retired` berarti mengantar pemain ke jalan buntu. Ambang 2 (bukan 1) karena satu kartu sendirian terbaca seperti baris rusak. Dunia arsip tetap terlihat di blok 7 beserta label statusnya. |
| 7 | **Semua Cerita** (grid 2 kolom) | `useCatalog().items` | selalu | Tujuan akhir guliran; tempat pemain memindai semuanya. |

**Mode hasil.** Begitu `search` tidak kosong **atau** ada genre terpilih, Beranda menjadi tampilan hasil: blok 3, 5, dan 6 **disembunyikan**, blok 7 tetap tampil dengan judul `home.resultsTitle`. Alasan: hero dan rail adalah etalase editorial; membiarkannya tampil di bawah filter membuat "Baru Diperbarui" menampilkan dunia yang sudah disaring dengan cara yang tidak dapat dijelaskan pemain, dan menambah noise saat pemain sedang mencari sesuatu yang spesifik. Chip (blok 4) tetap tampil karena ia adalah kontrolnya.

### SC-01.2 Blok 3 — Hero

Tujuan: satu dunia, satu ketukan, tanpa keputusan tambahan.

Isi (hanya ini — tidak ada elemen lain):

| Elemen | Field sumber | Aturan |
|---|---|---|
| Latar sampul | `WorldCatalogItem.coverAssetId` → `asset://<id>` | Rasio aspek lebar (16:9), mengisi lebar layar dikurangi padding. Teks ditumpuk di atas scrim gradien agar kontras terpenuhi (NFR-01). |
| Judul | `WorldCatalogItem.title` | Maksimal 2 baris, potong dengan elipsis. |
| Genre | `WorldCatalogItem.genres[]` → `genreLabelKey()` | Seluruh genre ditampilkan, dipisah " • ". Data saat ini maksimal 3. |
| Tombol "Mulai" | `home.heroStart` | Satu aksi primer per konteks (NFR-16). Bukan tombol kedua, bukan ikon. |
| Indikator titik | `featured.length` | Diatur di SC-01.7. |

Penentuan dunia unggulan (aturan, bukan hardcode):

```text
featured = catalog.items
  .filter(item => item.status === 'published')
  .sort(desc by updatedAt, tie-break: worldId naik)
  .slice(0, 4)
```

- **Hanya `published`.** Dunia `retired`/`revoked`/`draft` tidak boleh menjadi hero karena tombol "Mulai" akan berbohong (dok 03 §3.1 langkah 7). Konsekuensi: dengan katalog saat ini (4 dunia, 1 di antaranya `retired`) hero menampilkan **3 titik, bukan 4** — lihat SC-01.9 keputusan terbuka #1.
- **Pengurutan deterministik.** Tie-break `worldId` wajib agar urutan tidak berubah-ubah antar render (mengikuti pola `fetchJourneys` di mock gateway).
- **Tidak ada rotasi otomatis.** Carousel yang bergerak sendiri melanggar NFR-18 (animasi berhenti saat aplikasi tidak aktif) dan mengganggu pembaca layar.

Penulisan teks hero (karena mesin masih simulator):

- Hanya judul + genre + "Mulai". **Tidak ada** sinopsis, kutipan, klaim "AI akan mengingat pilihanmu", atau ajakan yang menyiratkan cerita akan mengikuti dunia ini.
- "Mulai" **bukan** janji bahwa perjalanan langsung dibuat — lihat SC-01.5.

### SC-01.3 Blok 4 — Chip genre (menggantikan bottom-sheet)

Tujuan: menyaring katalog dalam satu ketukan.

Isi: satu baris mendatar yang dapat digulir, berisi 6 chip, urutan tetap:

1. `home.filterAny` ("Semua genre") — chip reset; aktif bila `selectedGenres.length === 0`; menekan mengosongkan pilihan.
2–6. `genre.romance`, `genre.drama`, `genre.office`, `genre.fantasy`, `genre.mystery` — sesuai urutan `GENRES` di `domain/types.ts`.

Perilaku:

- Satu ketukan = satu toggle. Tidak ada tombol "Terapkan" dan tidak ada debounce pada chip (berbeda dari kolom pencarian yang tetap 250 ms).
- Multi-pilih tetap dipertahankan seperti perilaku `toggleGenre` saat ini; `selectedGenres` dikirim apa adanya ke `useCatalog({ genres })`.
- Teks ringkasan "N filter aktif" yang lama **dihapus**: chip menandai dirinya sendiri, sehingga baris itu menjadi pengulangan.

### SC-01.4 Blok 5 — Lanjutkan Bermain

Tujuan: mengembalikan pemain ke ceritanya dalam satu ketukan. Ini nilai tertinggi di Beranda.

Sumber: `useJourneys()` → `JourneySummary[]`. Urutan: apa yang dikembalikan gateway (`updatedAt` menurun); frontend **tidak** mengurutkan ulang.

Isi kartu (mendatar, gulir horizontal, snap):

| Elemen | Field sumber | Catatan |
|---|---|---|
| Sampul | `coverAssetId` | Rasio 3:4, lebar tetap. |
| Judul dunia | `worldTitle` | Maksimal 2 baris. |
| Tokoh | `personaName` → `journey.personaLabel` | Menegaskan "ini ceritaku", bukan katalog. |
| Progres | `lastReadSequence`, `decisionCount` → `journey.progress` | Satu-satunya angka yang boleh tampil: milik pemain sendiri. |
| Waktu | `updatedAt` → `formatRelativeDay()` → `journey.lastPlayed` | |
| Lencana belum dibaca | `hasUnreadBeats === true` → `journey.unreadBadge` | `Chip` read-only + ikon centang, bukan hanya warna. |
| Status dunia | `worldId` disilangkan ke `catalog.items` → `worldStatusLabelKey()` | Hanya tampil bila status bukan `published`. Wajib teks, bukan warna. |

Larangan pada kartu ini: tidak ada tombol hapus, arsip, atau aksi sekunder apa pun — satu aksi per konteks (NFR-16). Semua itu tetap berada di JourneyDetail (SC-07).

### SC-01.5 Blok 6 — Baru Diperbarui, dan Blok 7 — Semua Cerita

**Baru Diperbarui** — `catalog.items` dikurangi dunia `featured[0]`, diurutkan menurun menurut `updatedAt` (tie-break `worldId` naik). Pengurangan `featured[0]` bersifat statis (dunia yang pertama tampil di hero, bukan dunia yang sedang terlihat) agar isi rail tidak berubah saat pemain menggeser hero. Kartu memuat sampul, judul, `home.updatedAt` (`Diperbarui {when}` dari `formatRelativeDay(updatedAt)`), dan status dunia bila bukan `published`.

**Semua Cerita** — grid 2 kolom yang sudah ada, memakai `StoryCard` tanpa perubahan, dengan urutan apa pun yang dikembalikan `useCatalog`. Tidak ada pagination bertahap: katalog berukuran sangat kecil dan `pageSize` 20 sudah menampung semuanya.

> Catatan jujur: kedua blok menampilkan himpunan data yang sama dengan penyajian berbeda — ini memang bentuk yang disetujui (rail editorial + grid penuh). Lihat SC-01.9 keputusan terbuka #5 bila kelak terasa mengulang.

### SC-01.6 Semua keadaan

| Keadaan | Perilaku | Aksi berikutnya |
|---|---|---|
| **Muat awal** (`isLoading && !data`) | Struktur lengkap dirender sebagai skeleton: blok hero penuh lebar, 2 kerangka kartu rail, 4–6 sel grid. Chip genre **tidak** ikut memuat (konstanta lokal) dan langsung dapat diketuk. | Tidak ada. Pengumuman `common.loading` pada wadah. |
| **Muat ulang** (punya data, `isRefetching`) | Konten lama dipertahankan (`placeholderData`), tidak berkedip kosong. | Pull-to-refresh menyegarkan `catalog` **dan** `journeys` bersamaan. |
| **Galat katalog, tanpa cache** | `StateView kind="error"` penuh layar: `state.errorTitle` + `state.errorBody`. | Tombol `common.retry` → `catalog.refetch()`. |
| **Galat katalog, dengan cache** | Konten cache tetap tampil; banner ringkas non-blocking di bawah chip. | `common.retry`. Pemain tidak kehilangan akses ke katalog. |
| **Offline** | Dikenali dari kode galat `NETWORK`; memakai `state.offlineTitle` + `state.offlineBody`, **berbeda** dari galat generik (NFR-20). Tidak ada tombol yang mengklaim bisa memulai cerita. | `common.retry`. Catatan: tidak dapat diuji pada mock gateway — butuh adapter HTTP. |
| **Katalog kosong, tanpa filter** | `home.emptyCatalogTitle` + `home.emptyCatalogBody`. | Tanpa aksi (kurator yang menambah dunia). |
| **Hasil kosong karena pencarian/genre** | `home.emptySearchTitle` + `home.emptySearchBody`. | `common.reset` → kosongkan `search` dan `selectedGenres`. |
| **`journeys` masih memuat** | Blok 5 **tidak dirender** dan **tidak menyimpan ruang**. Tidak ada kerangka kosong yang muncul lalu hilang. | Tidak ada. |
| **Pemain punya 0 perjalanan** (`journeys.data.length === 0`) | **Blok 5 tidak dirender sama sekali** — judul bagian pun tidak muncul. Beranda tetap utuh: hero → chip → Baru Diperbarui → Semua Cerita. Alasan: pesan "belum ada perjalanan" sudah menjadi keadaan kosong tab Perjalanan (SC-06); mengulangnya di Beranda mengubah layanan utama menjadi teguran permanen bagi pemain baru. | Penemuan tetap berjalan lewat hero dan grid. |
| **Galat `journeys`** | Baris ringkas di dalam posisi blok 5: `home.sectionErrorTitle` + `home.sectionErrorBody`; seluruh Beranda lain tetap berfungsi. | `common.retry` → `journeys.refetch()`. |
| **`journeys` offline** | Baris ringkas memakai `state.offlineTitle` + `state.offlineBody`. | `common.retry`. |
| **Tamu / `UNAUTHORIZED` pada `journeys`** | Blok 5 disembunyikan, **tanpa** baris galat. Menjelajah tanpa identitas adalah keadaan sah (SC-02), bukan kegagalan. | Tidak ada. |
| **0 dunia dapat diunggulkan** (semua `retired`/`draft`) | Blok 3 tidak dirender. Blok 6 tetap tampil (ia tidak mensyaratkan `published`). | Tidak ada. |
| **Aset gagal dimuat** | `AssetImage` memakai placeholder netral; judul dan genre tetap terbaca (NFR-20). Lore tidak dikarang untuk menutupi sampul yang hilang. | Tidak ada di Beranda; pelaporan ada di SC-22. |

### SC-01.7 Alur interaksi

| Pemicu | Target | Catatan |
|---|---|---|
| Ketuk Hero (kartu atau tombol "Mulai") | `/world/[worldId]` (SC-03) | **Tidak membuat perjalanan.** Satu target ketuk untuk seluruh kartu; pil "Mulai" adalah penanda visual, bukan kontrol terpisah, agar pembaca layar tidak melewati dua target yang identik. Alasan mengalihkan: `StoryDetail` memuat sinopsis, peringatan konten (`contentRating`), gerbang persona (SC-05), dan konfirmasi kuota — semua wajib sebelum perjalanan dibuat (dok 03 §3.1 langkah 4–5). Lihat keputusan terbuka #2. |
| Geser Hero | Halaman hero berikutnya | `pagingEnabled`. Indikator titik mengikuti. Tidak ada rotasi otomatis. |
| Indikator titik | — | Bukan kontrol (lihat SC-01.8). |
| Ketuk chip genre | Toggle `selectedGenres` → `useCatalog` menyegarkan | Telemetry `catalog_filter_apply` dengan jumlah saja; tanpa teks (NFR-10). |
| Ketuk chip "Semua genre" | Kosongkan `selectedGenres` | Juga merupakan aksi `common.reset` untuk keadaan hasil kosong. |
| Ketuk kartu Lanjutkan Bermain | `/player/[journeyId]` (SC-08) | Pengecualian yang disengaja terhadap tab Perjalanan (yang membuka detail). Beranda = melanjutkan; Perjalanan = mengelola. Bila dunia `retired`, pemutar membuka dan menampilkan statusnya — kartu sudah memberitahu lewat teks status, bukan warna. |
| Ketuk kartu Baru Diperbarui / Semua Cerita | `/world/[worldId]` (SC-03) | Sama dengan perilaku grid yang sudah ada. |
| Kembali dari `StoryDetail` | Beranda | Query pencarian, chip terpilih, dan posisi gulir dipertahankan (dok 03 §2). |
| Pull-to-refresh | Segarkan katalog + perjalanan | |

### SC-01.8 Aksesibilitas per elemen

| Elemen | Aturan |
|---|---|
| Header & judul bagian | Judul bagian (`home.sectionResume`, `home.sectionUpdated`, `home.sectionAll`, `home.resultsTitle`) adalah heading nyata, bukan sekadar teks tebal, agar pembaca layar dapat melompat antarbagian (NFR-19). |
| Hero | `accessibilityRole="button"`; label = `{judul}. {genre}. {home.heroDotsLabel}`; hint = `home.openWorldHint`. Pil "Mulai" **tidak** difokuskan terpisah. |
| Indikator titik | Tidak dapat difokuskan (penting untuk aksesibilitas = tidak). Posisi diumumkan lewat label kartu. Keadaan aktif ditandai **bentuk** (titik terisi dan lebih lebar vs cincin berongga), bukan warna saja (NFR-01). |
| Geser hero | `home.heroSwipeHint` diumumkan sekali saat hero pertama kali difokuskan. Mitigasi keterjangkauan: seluruh dunia unggulan juga tercantum di blok 6 dan 7, sehingga tidak ada konten yang **hanya** bisa dicapai dengan menggeser. |
| Chip genre | `accessibilityState={{ selected }}` (sudah ada di `Chip`) **dan** tanda visual non-warna: teks tebal + latar terisi + tepi + **ikon centang** pada chip aktif. Urutan chip statis; tidak pernah diurutkan ulang berdasarkan hasil. |
| Lencana "belum selesai dibaca" | Teks `journey.unreadBadge` + ikon centang. Warna hanya pelengkap. |
| Status dunia | Selalu teks dari `worldStatusLabelKey()` (NFR-12: tidak ada enum mentah). |
| Kartu Lanjutkan | `accessibilityRole="button"`; label = `{worldTitle}. {journey.progress}. {journey.lastPlayed}`; hint = `journey.continueAction` (`Lanjutkan perjalanan {world}`). |
| Target sentuh | Seluruh kartu dan chip memenuhi 48 unit logis (NFR-03). Ini alasan titik hero dibuat sebagai indikator, bukan kontrol. |
| Skala teks 200% | Judul hero dan judul bagian boleh membungkus ke lebih banyak baris; tidak ada teks yang dipotong paksa dengan tinggi tetap (NFR-02). |
| Kontras | Teks hero di atas scrim gradien wajib diukur pada kedua tema; teks normal ≥4,5:1, komponen nonteks penting ≥3:1 (NFR-01). |
| Pengumuman | Perubahan hasil filter diumumkan melalui pergantian judul bagian (`home.resultsTitle`); tidak ada elemen yang bergerak sendiri. |

### SC-01.9 Keputusan terbuka yang perlu dikonfirmasi

1. **Jumlah titik hero adalah 3, bukan 4.** Dunia keempat (`w_arsip-lama`, "Musim Panas yang Tertunda") berstatus `retired` dan tidak dapat dimulai, sehingga tidak boleh memakai tombol "Mulai". Aturan di SC-01.2 menghasilkan 3 titik. Bila 4 titik diwajibkan, dunia `retired` harus masuk dengan CTA berbeda (`Lihat`, bukan `Mulai`) dan statusnya ditampilkan — satu kunci i18n tambahan.
2. **"Mulai" di hero membuka `StoryDetail`, bukan langsung membuat perjalanan.** Alternatifnya (langsung membuka `StartJourneySheet` / `SetupPersona`) menghemat satu ketukan tetapi melewati sinopsis dan peringatan konten — bermasalah karena dunia unggulan saat ini berating 18+. Direkomendasikan: tetap lewat `StoryDetail`.
3. **Titik hero hanya indikator.** Bila pengujian pembaca layar menemukan carousel tidak terjangkau, jadikan titik kontrol berukuran 48 dengan kunci `home.heroDotOpen` (cadangan, lihat SC-01.10).
4. **Mode hasil menyembunyikan blok 3, 5, dan 6.** Alternatifnya: pertahankan "Lanjutkan Bermain" di atas hasil karena ia tidak bergantung pada filter. Direkomendasikan: sembunyikan, demi satu fokus per layar.
5. **Duplikasi "Baru Diperbarui" vs "Semua Cerita".** Keduanya memakai himpunan data sama. Bila kelak terasa mengulang, aturan yang disarankan: sembunyikan rail bila jumlah dunia terbit ≤ 3.
6. **`SimulatorNotice` dipindah** menjadi elemen pertama konten gulir (di atas hero), bukan lagi `ListHeaderComponent` grid. Perubahan kecil di luar konsep yang disetujui — diminta karena penanda itu memenuhi syarat seluruh isi layar.
7. **Kunci lama yang dapat dihapus** setelah implementasi: `home.filterOpen`, `home.filterTitle`, `home.filterActiveCount` (bersama komponen `GenreFilterSheet`). Pengujian paritas ID/EN (`missingKeys`/`extraKeys`) mewajibkan kedua kamus diedit bersamaan.

### SC-01.10 Kunci i18n baru

Semua kunci wajib ditambahkan ke `frontend/src/i18n/id.ts` **dan** `en.ts` (NFR-12). Kunci yang dipakai ulang, sehingga tidak perlu ditambahkan: `home.title`, `home.searchLabel`, `home.searchPlaceholder`, `home.searchClear`, `home.filterAny`, `home.emptySearchTitle/Body`, `home.emptyCatalogTitle/Body`, `state.errorTitle/Body`, `state.offlineTitle/Body`, `common.retry`, `common.reset`, `common.loading`, `journey.lastPlayed`, `journey.progress`, `journey.personaLabel`, `journey.unreadBadge`, `journey.continueAction`, `genre.*`, `world.status.*`, `sim.notice`.

| Kunci | Bahasa Indonesia (sumber) | English |
|---|---|---|
| `home.sectionResume` | Lanjutkan Bermain | Continue Playing |
| `home.sectionUpdated` | Baru Diperbarui | Recently Updated |
| `home.sectionAll` | Semua Cerita | All Stories |
| `home.resultsTitle` | Hasil | Results |
| `home.heroStart` | Mulai | Start |
| `home.heroDotsLabel` | Dunia {index} dari {total} | World {index} of {total} |
| `home.heroSwipeHint` | Geser untuk melihat dunia unggulan lain | Swipe to see other featured worlds |
| `home.openWorldHint` | Membuka halaman dunia | Opens the world page |
| `home.updatedAt` | Diperbarui {when} | Updated {when} |
| `home.sectionErrorTitle` | Gagal memuat bagian ini | Could not load this section |
| `home.sectionErrorBody` | Bagian lain di halaman ini tetap bisa dipakai. | The rest of this page still works. |
| `home.heroDotOpen` *(cadangan — hanya bila keputusan #3 memilih opsi B)* | Tampilkan dunia {index} | Show world {index} |

### SC-01.11 Kriteria selesai

- Pemain dengan perjalanan aktif melihat "Lanjutkan Bermain" di layar pertama tanpa menggulir, dan satu ketukan membuka pemutar.
- Pemain dengan 0 perjalanan melihat Beranda tanpa bagian "Lanjutkan Bermain" dan tanpa pesan kosong apa pun.
- Menyaring genre memakan satu ketukan dari Beranda; tidak ada bottom-sheet yang tersisa.
- Tidak ada elemen Beranda yang menampilkan angka yang bukan milik pemain sendiri atau bukan bagian dari data dunia.
- Tiga tab tetap tiga; tidak ada tab keempat.
- Seluruh teks baru memiliki padanan ID/EN dan lulus pengujian paritas (NFR-12).
- Setiap keadaan aktif (chip, titik, lencana) masih dapat dikenali tanpa warna (NFR-01).
- Keadaan tanpa koneksi berbeda secara tertulis dari keadaan galat generik (NFR-20).
- Query, chip, dan posisi gulir tetap sama setelah kembali dari `StoryDetail`.

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
