# 16 — Usulan Fitur Beranda

> Versi 0.1 · dokumen **usulan**, belum disetujui.
> Lingkup: layar Beranda (SC-01) saja. Tidak mengubah kode.
> Rujukan: [04](04-spesifikasi-layar.md) SC-01 · [01](01-visi-lingkup-dan-kebutuhan.md) FR/NFR · [08](08-tier-token-dan-memori.md) · [02](02-keputusan-asumsi-dan-risiko.md) D/R.
>
> **Cara membaca.** Tiap ide menyebut (a) masalah perilaku yang konkret, (b) bentuknya di Beranda dan komponen mana, (c) bidang data nyata dari `gateway.ts`, (d) biaya + apa yang harus dibangun di backend, (e) kapan ide ini berubah menjadi slop. Ide yang butuh data yang belum ada **dinyatakan terus terang**.

## 0. Berkas yang dibaca

- `project2/frontend/app/(tabs)/index.tsx` — seluruh Beranda (SC-01).
- `project2/frontend/src/components/StoryCard.tsx` — kartu katalog; prop hanya `item`, `onPress`, `note`, `coverRadius`, `testID`; **tidak ada indikator kemajuan**.
- `project2/frontend/src/features/journeys/JourneyCard.tsx` — kartu "Lanjutkan Bermain" (`mode="resume"`).
- `project2/frontend/src/data/gateway.ts` + `src/domain/types.ts` — bentuk data yang benar-benar tersedia.
- `project2/frontend/src/data/queries.ts` — hook yang dipakai Beranda.
- `project2/frontend/src/data/mock/MockStoryGateway.ts` — perilaku nyata `fetchCatalog`, `fetchTopWorlds`, `fetchUsage`.
- `project2/docs/01`, `02`, `03`, `04` (SC-01), `08`, `12`.
- `project2/.workbuddy-ai/memory/MEMORY.md` — **tidak ada berkas ini** di repo.

## 1. Prinsip yang mengikat usulan ini

1. **Tidak mengarang metrik.** fayLN tidak punya jumlah pembaca, peringkat bintang, atau lapisan sosial. Angka yang boleh tampil hanya milik pemain sendiri (beat, keputusan) atau berasal dari data dunia (`startCount`, waktu).
2. **Token itu nyata.** Free = konteks 64k, 100.000 token/hari, tanpa compaction. Lencana token di tajuk (`home-token-balance`) sekarang hanya pajangan.
3. **Mesin cerita masih simulator deterministik.** Semua dunia memberi pilihan identik; isi cerita belum nyata. **Karena itu nilai terbesar Beranda saat ini ada di navigasi dan informasi — dua hal itu bisa dibangun dan diuji sekarang tanpa menunggu kualitas cerita.** Usulan di bawah sengaja condong ke sana.
4. Bahasa antarmuka Indonesia (dwibahasa ID/EN); tiap teks baru punya padanan.
5. Rupa: gradien diizinkan, garis tegas dilarang; pemisahan lewat jarak/warna permukaan.
6. Tidak menambah tab keempat (NFR-16).

---

## 2. Ide menurut pekerjaan pemain

### Pekerjaan A — Melanjutkan yang sedang berjalan

#### A1 · "Lanjutkan Bermain" naik ke atas hero saat ada adegan belum dibaca

| | |
|---|---|
| **Masalah** | Blok hero (etalase) selalu menempati posisi pertama. Pemain yang punya adegan belum dibaca hanya ingin kembali, tetapi harus menggulir melewati hero + chip dulu. Nilai tertinggi di Beranda (SC-01: "niat kembali lebih kuat daripada niat mencari") justru terkubur. |
| **Bentuk di Beranda** | Pindahkan blok `home-section-resume` (`JourneyCard mode="resume"`) ke **atas `home-hero`** hanya ketika perjalanan teratas punya `hasUnreadBeats === true`. Sisanya tetap. Urutan jadi: tajuk → Lanjutkan (bila ada adegan baru) → hero → chip → rail lain. |
| **Data** | `JourneySummary.hasUnreadBeats`, `updatedAt` — **sudah ada**. |
| **Biaya** | **Kecil.** Murni frontend (susunan JSX), tanpa perubahan kontrak/backend. |
| **Risiko slop** | Urutan yang berubah-ubah tiap peluncuran tanpa alasan yang terbaca membuat layar terasa tidak stabil. Mitigasi: naik **hanya** saat ada adegan belum dibaca, judul blok tetap sama, dan jangan pernah menaikkan saat pencarian/filter aktif. |

#### A2 · CTA "Mulai" berubah menjadi "Lanjutkan" untuk dunia yang sudah punya perjalanan

| | |
|---|---|
| **Masalah** | Tombol hero dan kartu katalog selalu berbunyi "Mulai". Padahal D-12 menetapkan **satu perjalanan aktif per dunia per akun**. Menekan "Mulai" pada dunia yang sudah dimainkan mengarahkan pemain ke jalur yang berpotensi konflik, dan label "Mulai" secara harfiah berbohong. |
| **Bentuk di Beranda** | Silangkan `journeys[].worldId` ke kartu hero (`HeroCard`) dan kartu katalog (`StoryCard`). Bila ada perjalanan: label pil jadi "Lanjutkan", dan ketukan membuka `/player/[journeyId]` (perilaku sama dengan kartu resume, SC-01.7) alih-alih `/world/[worldId]`. Kartu katalog di rail/grid juga diberi penanda teks kecil "Sedang dimainkan". |
| **Data** | `JourneySummary.worldId` + `journeyId` — **sudah ada**; join dilakukan di klien (Beranda sudah memanggil `useJourneys()`). |
| **Biaya** | **Kecil.** Frontend saja. Perlu satu keputusan produk soal tujuan ketukan (lihat §5). |
| **Risiko slop** | Bila kelak multi-slot per dunia (P1) diaktifkan, "Lanjutkan" menjadi ambigu. Untuk MVP, D-12 menjamin satu perjalanan, jadi aman. Jangan menampilkan penanda ini di dunia tanpa perjalanan. |

### Pekerjaan B — Menemukan yang baru

#### B1 · Saring menurut bahasa cerita (bahasa respons)

| | |
|---|---|
| **Masalah** | `supportedResponseLocales[]` ada di tiap dunia tetapi **tidak dipakai di mana pun** di UI. Bahasa UI dan bahasa respons sengaja dipisah (D-22). Pemain yang ingin cerita berbahasa Indonesia tidak punya cara menyaringnya sebelum membuka dunia. |
| **Bentuk di Beranda** | Tambah satu chip/segment di `home-chips`: "Bahasa cerita: ID / EN" (default "Semua"). Bukan baris baru yang besar — cukup satu kontrol di ujung baris chip yang sudah ada. |
| **Data** | `WorldCatalogItem.supportedResponseLocales` — **ada**. Namun `CatalogQuery` saat ini hanya punya `search, genres, page, pageSize`, jadi filter bahasa belum bisa dikirim ke server. |
| **Biaya** | **Sedang.** Perlu menambah parameter `responseLocale` di `CatalogQuery` + `fetchCatalog` (mock & HTTP) + dukungan filter di backend. Menyaring di klien atas satu halaman (pageSize 20) akan salah pada katalog besar — jangan tempuh jalan itu. |
| **Risiko slop** | Bila seluruh katalog kebetulan mendukung ID, kontrol ini menjadi chip mati yang hanya menambah kebisingan. Tampilkan hanya jika katalog benar-benar memuat dua bahasa berbeda. |

#### B2 · Pencarian juga mencocokkan sinopsis

| | |
|---|---|
| **Masalah** | `MockStoryGateway.fetchCatalog` (baris 522) hanya mencocokkan `item.title.toLowerCase()`. Pemain yang mencari tema ("detektif", "kantor", "pulau") tidak menemukan apa pun meski sinopsis dunia memuatnya. |
| **Bentuk di Beranda** | Perilaku `SearchField` tetap sama; yang berubah hanya cakupan pencocokan di gateway. Tidak ada elemen baru di layar. |
| **Data** | `WorldCatalogItem.synopsis` — **ada** dan sudah dimuat. |
| **Biaya** | **Sedang.** Perubahan di gateway (mock + HTTP) dan backend. Di klien tidak ada perubahan. |
| **Risiko slop** | Mencocokkan sinopsis membuat hasil terasa "ajaib" bila tidak ada penyorotan alasan cocok. Mitigasi: pertahankan urutan judul-dulu, dan jangan tampilkan potongan sinopsis yang bisa membocorkan isi (SC-01.2 melarang sinopsis di Beranda). |

#### B3 · "Semua Cerita" memuat lebih banyak saat digulir (pagination)

| | |
|---|---|
| **Masalah** | `CatalogPage.hasMore` dan `total` ada, tetapi Beranda mengabaikannya (komentar di `index.tsx`: pageSize 20 "sudah menampung semuanya"). Begitu katalog melampaui 20 dunia, sisa dunia menjadi tidak terjangkau dari Beranda — padahal FR-01 menetapkan pagination sebagai P0. |
| **Bentuk di Beranda** | Di ujung `home-grid`, tombol "Muat lebih banyak" (atau pemicu saat mendekati bawah). Bukan kontrol baru di atas; taruh di tempat pemain sudah selesai memindai. |
| **Data** | `CatalogPage.hasMore`, `CatalogPage.total`, `CatalogPage.page` — **ada**. |
| **Biaya** | **Kecil–sedang.** Frontend (`useInfiniteQuery` atau `page` bertambah) + memastikan `queryKeys.catalog` menangani halaman. Backend sudah mendukung `page`/`pageSize`. |
| **Risiko slop** | Menambah tombol yang jarang berguna pada katalog kecil. Tampilkan tombol **hanya** bila `hasMore === true`; sembunyikan totalnya pada katalog yang muat satu halaman. |

### Pekerjaan C — Memahami batas pemakaian

#### C1 · Lencana token di tajuk dapat diketuk → lembar pemakaian ringkas

| | |
|---|---|
| **Masalah** | `home-token-balance` hanya `View` (bukan kontrol). Angka token tampil tetapi tidak dapat dijelaskan: pemain tidak tahu artinya "sisa hari ini", kapan reset, dan apa bedanya membaca ulang. R-01 (konteks dimaknai sebagai penyimpanan) lahir persis dari ketidakjelasan ini. |
| **Bentuk di Beranda** | Bungkus lencana dengan `Pressable` (`accessibilityRole="button"`). Ketukan membuka **lembar ringkas** (bukan layar penuh): `available` / `allowanceLimit`, `resetAt` sebagai waktu lokal, tier, dan satu baris "Membaca ulang tidak memakai token". Perilaku **kuota habis** ditangani di sini: saat `available === 0`, tawaran "Mulai" pada hero diberi catatan jujur dan diarahkan ke baca-lanjutan, bukan dibiarkan gagal saat diketuk. |
| **Data** | `UsageDTO.tier, spent, reserved, available, allowanceLimit, resetAt, isEstimate` — **ada** (`useUsage()` sudah dipanggil Beranda). |
| **Biaya** | **Kecil–sedang.** Frontend + komponen lembar. Bila diarahkan ke layar SC-18 (Paket & Penggunaan) yang sudah ada, biayanya kecil. |
| **Risiko slop** | Menjadi salinan mini layar Pengaturan → slop. Mitigasi: lembar ini **hanya** menjawab "hari ini" + reset + beda baca-ulang, dan menyediakan tautan ke SC-18 untuk detail. Jangan menampilkan `reserved`/`spent` terpisah bila tidak menjelaskan apa pun bagi pemain Free. |

#### C2 · Baris peringatan kuota rendah yang jujur (tanpa nagging)

| | |
|---|---|
| **Masalah** | Pemain tidak punya sinyal apa pun sebelum kuota habis di tengah adegan. Batas 100.000 token/hari itu nyata tetapi tak terlihat sampai terlambat. |
| **Bentuk di Beranda** | Satu baris tenang di bawah tajuk (bukan modal, bukan banner mencolok) yang muncul **hanya** di ambang jelas: "Sisa token hari ini tinggal {available} · reset {waktu lokal}". Memakai jarak + warna permukaan, bukan garis (batas rupa). |
| **Data** | `UsageDTO.available`, `allowanceLimit`, `resetAt` — **ada**. |
| **Biaya** | **Kecil.** Frontend + ambang yang disetel. |
| **Risiko slop** | Muncul terlalu sering → alarm fatigue dan mengganggu penemuan. Mitigasi: hanya di ambang rendah (mis. < 15% dari limit), dapat ditutup, dan tidak pernah memblokir. Jangan pernah menyebut token sebagai "pesan" (kriteria SC-18 / dok 08 §8). |

#### C3 · Tampilkan pemakaian konteks per perjalanan (Free, tanpa compaction)

| | |
|---|---|
| **Masalah** | Free berkonteks 64k dan **tanpa compaction**. Perjalanan panjang akan mencapai `CONTEXT_FULL`, dan model mulai memotong riwayat terlama (dok 08 §4). Pemain tidak melihat ini datang, dan Beranda tidak memberi isyarat apa pun. |
| **Bentuk di Beranda** | Penanda pada kartu "Lanjutkan Bermain": "Konteks hampir penuh" dengan penjelasan jujur bahwa bagian awal cerita bisa keluar dari konteks model (bukan hilang dari Log). |
| **Data** | **Belum ada.** `UsageDTO` tidak punya pemakaian konteks per perjalanan, dan `TurnResultEnvelope` hanya memuat `usage.promptTokens/completionTokens` per giliran — tidak ada akumulasi atau persentase terhadap 64k. `EntitlementDTO.contextWindow` ada di tipe tetapi **tidak pernah diambil** (tidak ada hook/endpoint). |
| **Biaya** | **Besar.** Butuh bidang kontrak baru (mis. `contextUsed` / `contextLimit` per journey) dan perhitungan di server. Tidak bisa dibangun sekarang. |
| **Risiko slop** | Menampilkan bilah "konteks terpakai" yang dihitung klien dari jumlah token = angka karangan. Jangan lakukan sebelum server menyediakannya. |

---

## 3. Yang SEBAIKNYA TIDAK dibuat

Ini sama pentingnya dengan daftar usulan. Proyek ini anti-slop.

1. **Jumlah pembaca, peringkat bintang, "populer", "trending", atau "X pemain" di mana pun.** Datanya tidak ada dan tidak akan ada di `gateway.ts`. Menampilkannya bukan sekadar sulit — itu berbohong. Satu-satunya angka sosial yang sah adalah `startCount` pada "Top 10 Minggu Ini", dan itu pun sudah dijaga server.
2. **Bilah/persen kemajuan pada `StoryCard`.** `JourneySummary` hanya punya `lastReadSequence` tanpa total beat, jadi penyebutnya harus dikarang. Angka absolut (beat + keputusan) sudah ditampilkan dan itu jujur; bar persen akan menipu.
3. **Sapaan personal yang mengklaim AI mengingat** ("Selamat datang kembali", "Aku merindukanmu", "AI akan mengingat duniamu"). Mesin masih simulator deterministik (D-20, R-02). Ini janji memori yang belum bisa ditepati.
4. **Rekomendasi "Untukmu" berbasis AI/kolaboratif.** Tidak ada data preferensi maupun perilaku pemain lain. Hasilnya akan terasa acak yang dibungkus percaya diri — persis bentuk slop yang dilarang.
5. **Streak harian, "NPC menunggu kamu", notifikasi tekanan emosional.** Dilarang eksplisit oleh FR-72 dan 12 §3 (gacha/streak menghukum tidak masuk lingkup).
6. **Harga atau paket di Beranda.** Harga belum diputuskan (D-25, O-08). Menampilkannya = mengarang.
7. **Mode baca offline / "lanjutkan tanpa koneksi".** Sudah dihapus dari lingkup (12 F3); cerita dihasilkan AI sehingga bermain selalu butuh koneksi.
8. **Kutipan editorial, sinopsis panjang, atau ajakan di hero.** SC-01.2 membatasi hero pada judul + genre + "Mulai" justru karena cerita belum nyata. Menambah teks akan menjanjikan isi yang belum ada.

---

## 4. Tiga rekomendasi teratas

| # | Ide | Alasan |
|---|---|---|
| 1 | **A2 — "Mulai" → "Lanjutkan"** | Memperbaiki label yang secara harfiah berbohong, mencegah jalur konflik per-journey (D-12), memakai data yang sudah ada, dan biayanya kecil. Rasio nilai/biaya tertinggi, dan **bisa dibangun sekarang**. |
| 2 | **C1 — Lencana token dapat diketuk** | Mengubah elemen pajangan menjadi penjelasan batas yang nyata; langsung melayani pekerjaan "memahami batas pemakaian" dan memitigasi R-01. Data tersedia, bisa dibangun sekarang. |
| 3 | **A1 — Lanjutkan naik saat ada adegan belum dibaca** | Menempatkan aksi bernilai tertinggi (SC-01) di posisi pertama tepat saat pemain membutuhkannya. Frontend saja, tanpa kontrak baru. |

**Runner-up kuat:** B2 (pencarian mencocokkan sinopsis) — celah nyata yang terverifikasi, tetapi butuh kerja backend sehingga lebih lambat.

---

## 5. Satu pertanyaan yang perlu dijawab pemilik produk

**Untuk dunia yang sudah punya perjalanan, apakah ketukan "Lanjutkan" pada hero dan kartu katalog harus langsung membuka pemutar (`/player/[journeyId]`, seperti kartu Lanjutkan Bermain), atau tetap lewat halaman dunia (StoryDetail) untuk menampilkan status dunia?**

Ini menentukan bentuk akhir A2: opsi pertama menghemat satu ketukan tetapi melewati status dunia `retired` dan peringatan konten; opsi kedua lebih konservatif tetapi menambah satu langkah bagi pemain yang hanya ingin melanjutkan.

---

## Lampiran A — Kunci i18n baru yang diusulkan (ID / EN)

Wajib ditambahkan ke `frontend/src/i18n/id.ts` **dan** `en.ts` (NFR-12). Paritas ID/EN diuji.

| Kunci | Bahasa Indonesia (sumber) | English |
|---|---|---|
| `home.continueCta` | Lanjutkan | Continue |
| `home.playingBadge` | Sedang dimainkan | Currently playing |
| `home.resumeUnreadHint` | Ada adegan baru menunggu | New scenes are waiting |
| `home.filterLanguageAny` | Semua bahasa | All languages |
| `home.filterLanguageId` | Bahasa Indonesia | Indonesian |
| `home.filterLanguageEn` | Bahasa Inggris | English |
| `home.loadMore` | Muat lebih banyak | Load more |
| `home.quotaOpen` | Lihat pemakaian token | View token usage |
| `home.quotaSheetTitle` | Pemakaian hari ini | Today's usage |
| `home.quotaRemaining` | Sisa {available} dari {limit} token | {available} of {limit} tokens left |
| `home.quotaResetAt` | Reset {when} (waktu lokal) | Resets {when} (local time) |
| `home.quotaRereadFree` | Membaca ulang tidak memakai token | Re-reading does not use tokens |
| `home.quotaLow` | Sisa token hari ini tinggal {available}. | Only {available} tokens left today. |
| `home.quotaExhausted` | Kuota token hari ini habis. Cerita yang sudah ada tetap bisa dibaca. | Today's token quota is used up. Stories you already have stay readable. |
| `home.contextNearlyFull` *(menunggu data C3)* | Konteks hampir penuh | Context nearly full |

## Lampiran B — Data yang belum ada (jangan dikarang)

| Kebutuhan | Status di `gateway.ts` | Catatan |
|---|---|---|
| Pemakaian konteks per perjalanan | **Tidak ada** | `TurnResultEnvelope` hanya punya token per giliran; tidak ada akumulasi/limit. `EntitlementDTO.contextWindow` bertipe ada tetapi tidak diambil siapa pun. |
| Estimasi biaya satu giliran berikutnya | **Tidak ada** | Dok 08 menyebut contoh angka, bukan bidang kontrak. |
| Total beat per dunia (untuk persen) | **Tidak ada** | `WorldCatalogItem` tidak memuat jumlah beat/arc. |
| Jumlah adegan belum dibaca | **Tidak ada** | `hasUnreadBeats` hanya boolean, bukan jumlah. |
| Jumlah pembaca / rating / sosial | **Tidak ada, dan tidak akan ditampilkan** | Lihat §3 butir 1. |
| Harga / paket | **Belum diputuskan** | D-25, O-08. |
