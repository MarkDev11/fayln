# 05 — Sistem Desain dan Aset

> Versi 1.1 · 29 September 2026. Bagian 8 ditambahkan: spesifikasi visual Beranda (HOME-VIS-01).
> Menetapkan bahasa visual, komponen, wireframe teks, dan kebijakan aset.
> Semua token di bawah adalah usulan; implementasi menunggu persetujuan dan uji kontras.

## 1. Prinsip visual

1. **Karya dulu, chrome kemudian.** Sampul mendapat ruang terbesar; kontrol memakai permukaan netral.
2. **Satu aksi primer per layar.** Home fokus eksplorasi; detail fokus mulai; Player fokus baca/pilih; JourneyDetail fokus lanjut/hapus.
3. **Kedalaman lewat garis dan jarak, bukan bayangan berat.** Cocok untuk ilustrasi berwarna.
4. **Teks tidak pernah dikorbankan untuk estetika.** Kontras dan skala teks diuji pada kedua tema.
5. **Gerakan bermakna dan dapat dimatikan.** Typewriter, crossfade latar, dan sheet memakai durasi singkat; mode hemat mematikan semuanya kecuali perubahan konten yang esensial.
6. **Status tidak berteriak.** Auto, menyimpan, offline, dan kuota memakai indikator kecil; hanya error/destruktif yang memakai warna kuat.

## 2. Token desain

### Warna terang

```text
--bg-app: #F6F3EC
--bg-surface: #FFFFFF
--bg-muted: #ECE7DA
--ink-primary: #1D1B16
--ink-secondary: #5C574B
--ink-inverse: #FFFFFF
--accent: #7C3F2C
--accent-strong: #5E2E20
--success: #2E6B4F
--warning: #9A6A00
--danger: #A83232
--line: #D8D2C2
--focus: #1F6FEB
```

### Warna gelap

```text
--bg-app: #12110D
--bg-surface: #1C1B16
--bg-muted: #26241D
--ink-primary: #F5F1E6
--ink-secondary: #C7C0AE
--ink-inverse: #171511
--accent: #D9977B
--accent-strong: #E8B79C
--success: #7CC79E
--warning: #E3B341
--danger: #E58E8E
--line: #38352A
--focus: #7FB3FF
```

Rasio harus diukur ulang pada implementasi. Bila gagal, ubah token dulu, bukan menurunkan standar.

### Tipografi dan jarak

- Font sistem dahulu agar konsisten dengan perangkat: Android Roboto, iOS San Francisco.
- Skala teks: judul layar 22; judul kartu 16; isi 15–16; caption 12–13; dialog VN 17 default.
- Line-height isi minimal 1,5; dialog VN 1,6.
- Radius: kartu 14; tombol 12; sheet 18 atas; chip 999.
- Spasi dasar 4; padding layar 16; jarak kartu 12.
- Target sentuh minimal 48 unit logis untuk kontrol inti.

## 3. Komponen inti

- `AppTabs`: tiga tab dengan label dan ikon bernama; state aktif bukan hanya warna.
- `StoryCard`: rasio sampul 3:4; judul dua baris; genre satu baris; status dunia.
- `NPCRelationChip`: teks Normal, Hangat, Waspada, Tegang, Renggang, Dekat, Sayang, Cinta, atau status admin; tidak ada angka.
- `StickyActionBar`: tombol primer penuh lebar + aksi sekunder aman.
- `DialogueBox`: nama pembicara, isi, status mengetik/selesai, tombol lanjut.
- `ChoiceCard`: judul niat, deskripsi satu baris, status terkunci setelah dipilih.
- `Composer`: multiline autosize, counter, kirim eksplisit.
- `StateViews`: skeleton, empty, error, offline, retired, quota.
- `NoticeToast`: hubungan, autosave, compaction; durasi singkat dan dapat diabaikan.
- `ConfirmDialog`: nama target, konsekuensi, tombol aman sebagai fokus awal.
- `LogRow`: pembicara/teks/waktu; perubahan hubungan sebagai baris sistem.
- `QuotaMeter`: spent/reserved/available dan reset; estimasi diberi label estimasi.

## 4. Wireframe teks

### Home

```text
[Search: Cari judul...] [Filter: Genre]
[Lanjutkan: Dunia A • Beat 24 • Lanjutkan]
[Cover] Judul Cerita A      [Cover] Judul Cerita B
Genre • Status              Genre • Status
[Cover] Judul Cerita C      [Cover] Judul Cerita D
```

### StoryDetail

```text
< Kembali        [Cover besar]
Judul Dunia
Genre • Versi • Peringatan konten
Sinopsis...
Karakter: [Elysia] [Leo]
[Mulai Perjalanan — sticky bawah]
```

### Player

```text
[Background Winery Interior]
        [Portrait Elysia: kesal]

Elysia
"Dialog tampil di sini dengan typewriter..."

[Auto: Mati] [Log] [Tokoh] [...]
[Tiga pilihan muncul sebagai sheet saat decision]
```

### JourneyDetail

```text
< Kembali
[Cover kecil] Judul Dunia
Terakhir dimainkan • Beat 24 • Versi 7
Sinopsis...
Elysia — Waspada
Leo — Normal
[Lihat Log]
[Lanjutkan] [Hapus]
```

### Pengaturan

```text
Profil: Nama • Usia
Bahasa UI: Indonesia
Bahasa Respons: Indonesia
Membaca: Ukuran, Kecepatan, Gerakan
Paket: Free • 68.420/100.000 • Reset 19.00
Privasi • Bantuan • Tentang
```

## 5. Aset dan gambar

### Katalog aset

Setiap world memiliki manifest berisi:

- `cover`: satu gambar utama.
- `backgrounds`: ID latar yang boleh dipakai AI.
- `portraits`: ID karakter + ekspresi.
- `audio`: opsional P1.
- Metadata ukuran, hash, dan lisensi internal.

AI hanya boleh memilih ID dari manifest versi journey. Tidak ada URL bebas, path lokal sembarang, atau prompt generatif pada MVP.

### Target ukuran awal

- Thumbnail kartu: WebP/AVIF, sisi panjang 600, target <=150 KB.
- Background scene: sisi panjang 1600 landscape / 1200 portrait, target <=500 KB.
- Portrait: transparan bila memungkinkan, sisi panjang 1024, target <=400 KB.
- Cover detail: sisi panjang 1200, target <=350 KB.

Angka di atas target uji kualitas/kinerja; bukan batas validasi yang sudah final.

### Fallback berlapis

1. Cache lokal.
2. CDN produksi.
3. Placeholder netral berlabel dunia/karakter.
4. Mode teks tetap memungkinkan cerita dibaca.

Placeholder tidak boleh memakai wajah/identitas karakter lain.

### Contoh manifest

```json
{
  "worldId": "w_bosku-mantan",
  "worldVersion": 7,
  "cover": {"assetId": "a_cover_kantor", "uri": "cdn://worlds/w_bosku-mantan/cover.webp"},
  "backgrounds": [
    {"assetId": "bg_gedung_luar", "label": "Luar Gedung AAA"},
    {"assetId": "bg_kantor_dalam", "label": "Interior Kantor"}
  ],
  "portraits": [
    {"assetId": "p_elysia_netral", "npcId": "npc_elysia", "expression": "netral"},
    {"assetId": "p_elysia_kesal", "npcId": "npc_elysia", "expression": "kesal"},
    {"assetId": "p_leo_senang", "npcId": "npc_leo", "expression": "senang"}
  ]
}
```

## 6. Aksesibilitas visual

- Semua gambar informatif memiliki teks alternatif: sampul memakai judul; background memakai label lokasi; portrait memakai nama dan ekspresi.
- Status hubungan tidak hanya warna; selalu ada teks.
- Fokus terlihat; urutan fokus mengikuti urutan baca.
- Reduced motion mematikan typewriter cepat menjadi teks langsung, crossfade menjadi potong langsung, dan parallax dimatikan.
- Kontras diuji setelah gambar latar ditambah scrim; teks dialog tidak diletakkan di atas area gambar yang ramai tanpa pelindung.

## 7. Kriteria selesai sistem desain

- Token terang/gelap lolos audit kontras.
- Semua state layar memiliki contoh visual.
- Semua komponen inti memiliki varian loading/disabled/error.
- Wireframe dapat dipetakan satu-ke-satu ke SC-01 sampai SC-24.
- Tidak ada komponen yang membutuhkan aset di luar manifest.

---

## 8. Spesifikasi visual Beranda (HOME-VIS-01)

Bagian ini **menambahkan**, bukan mengganti, Bagian 1–7. Ia menerjemahkan konsep Beranda yang sudah disetujui menjadi spesifikasi yang dapat diimplementasikan tanpa keputusan desain tambahan. Semua nilai memakai token yang sudah ada, kecuali dua token baru di §8.11. Tidak ada palet baru, tidak ada gradien, tidak ada bayangan, tidak ada emoji.

### 8.1 Kanvas dan ritme spasi

Kanvas acuan: lebar logis **390** (kelas iPhone 14/15). Gutter halaman 16 → lebar kolom konten **358**.

| Peran | Nilai | Token |
| --- | --- | --- |
| Gutter halaman | 16 | `space.lg` |
| Jarak pencarian → hero | 16 | `space.lg` |
| Jarak antarbagian (di atas pemisah) | 24 | `space.xl` |
| Pemisah bagian | garis 1px | `line` |
| Pemisah → tajuk | 16 | `space.lg` |
| Tajuk → isi | 12 | `space.md` |
| Jarak chip | 8 | `space.sm` |
| Padding dalam kartu | 12 | `space.md` |
| Jarak sampul → teks (kartu mendatar) | 12 | `space.md` |
| Gutter grid | 12 | `space.md` |
| Jarak baris grid | 16 | `space.lg` |
| Padding bawah daftar | 32 | `space.xxl` |
| Radius permukaan baru | 8 | `radius.tile` (baru) |
| Ketebalan garis | 1 px (bukan `hairlineWidth`) | — |

Urutan vertikal: (1) tajuk layar + pencarian — pertahankan, wajib SC-01; (2) Hero; (3) chip genre; (4) Lanjutkan Bermain; (5) Baru Diperbarui; (6) Semua Cerita.

Wireframe Beranda (versi ini menggantikan blok Home di §4 untuk implementasi; blok lama dibiarkan sebagai arsip):

```text
Judul Beranda
[Cari judul...]

[HERO 358x201 · scrim datar]
  Genre • Genre
  Judul Dunia Unggulan
  [Mulai]                    • ◦ ◦ ◦

[Semua] [Romansa] [Misteri] [Aksi] →

────────────── 1px ──────────────
Lanjutkan Bermain
[Cv 84] Judul Dunia
        Giliran 24 • 2 jam lalu
        [Belum dibaca]
[Cv 84] Judul Dunia
        Giliran 7 • kemarin

────────────── 1px ──────────────
Baru Diperbarui
[Cv 132] [Cv 132] [Cv 132] →
Judul      Judul    Judul
Genre      Genre    Genre

────────────── 1px ──────────────
Semua Cerita
[Cv 173] Judul Cerita   [Cv 173] Judul Cerita
Genre                   Genre
```

### 8.2 Hero dunia unggulan

Bentuk: satu kartu penuh lebar kolom konten, **358 × 201 minimum** (rasio 16:9), radius 8, `overflow: hidden`, latar `placeholder` saat aset belum tersedia, border 1px `line` pada kedua tema.

Struktur berlapis, berurutan dari belakang:

1. **Gambar** — `AssetImage` dengan `aspectRatio: 16/9`, `contentFit: "cover"`, `accessibilityLabel` = judul dunia. Memakai aset `cover` yang sudah ada; tidak ada aset baru (§8.10).
2. **Panel teks** — permukaan solid `bgSurface` di bawah gambar, `padding: 16`, radius mengikuti kartu.
3. **Isi panel** — genre → judul → pil "Mulai" (lebar penuh) → titik indikator (tengah).

**Tidak ada scrim.** Versi pertama memakai scrim datar 0,72 menutupi seluruh kartu. Hasilnya
gambar praktis terbuang: 86% area hero berada di bawah luminansi 0,05, sehingga kartu bisa
diganti kotak polos tanpa ada yang berubah. Keterbacaan kini dijamin oleh **panel solid**,
bukan dengan meredupkan gambar — cara ini memberi jaminan kontras yang lebih kuat sekaligus
mempertahankan gambarnya. Scrim tetap dipakai di pemutar (`player/components/Stage`).

Keterbacaan:

- Tinggi kartu mengikuti gambar (16:9) ditambah tinggi panel, sehingga pada skala teks besar
  panel dapat menumbuhkan kartu sementara gambar tetap utuh.
- Judul memakai `tone="primary"` dan genre `tone="secondary"` di atas `bgSurface` — bukan
  `onMedia`, karena tidak lagi berada di atas gambar.
- Alasan panel lebih baik daripada scrim: sampul paling terang sekalipun tidak dapat
  menurunkan kontras teks, karena teks tidak lagi menyentuh gambar sama sekali.

Isi blok teks (kiri bawah, lebar kolom 326):

- **Genre** di atas judul sebagai kicker: `small` 13/18, `tone="secondary"`, satu baris. Ditampilkan **genre pertama + "+N"** bila ada sisanya, bukan dua genre yang digabung lalu dipotong — penggabungan membuat teks terputus di tengah kata (`"Misteri • Kehidupan Ka…"`). Daftar genre utuh tetap diberikan ke pembaca layar lewat `accessibilityLabel`.
- **Judul dunia**: `display` 28/34, weight 700, warna `onMedia`, `numberOfLines={2}`.
- **Tombol "Mulai"**: `Button` varian `primary` — latar `accent`, teks `inkInverse`, `label` 13/18, tinggi 48, lebar mengikuti isi dengan `minWidth: 112`, `paddingHorizontal: 16`, radius 8. Ini satu-satunya tombol berisi di Beranda (prinsip 2: satu aksi primer per layar).
- **Indikator titik**: **3 titik**, bukan 4 — hanya dunia berstatus `published` yang masuk hero, karena dunia `retired` tidak boleh memakai tombol "Mulai" (lihat SC-01.9 butir 1). Diameter 6, jarak 8, di sisi kanan baris yang sama dengan tombol Mulai, sejajar vertikal dengan tombol. Aktif `onMedia` solid; tidak aktif `onMedia` dengan `opacity 0.4`. Dekoratif → disembunyikan dari pembaca layar; posisi diumumkan lewat label hero.

Paging: carousel mendatar `pagingEnabled`, `showsHorizontalScrollIndicator={false}`; geser mengubah titik aktif. **Tanpa auto-advance** — aman untuk reduced motion dan tidak mengejutkan. Bila produk meminta auto: interval 6 detik, wajib mati saat reduced motion.

### 8.3 Chip genre

Memakai komponen `Chip` yang ada dengan penyesuaian berikut.

| Properti | Tidak terpilih | Terpilih |
| --- | --- | --- |
| Latar | transparent | `bgMuted` |
| Garis | 1px `line` | 1px `accent` |
| Teks | `caption` 12/16, weight 500, `inkSecondary` | `caption` 12/16, weight 700, `accent` |
| Radius | 8 (`radius.tile`) | 8 (`radius.tile`) |

- Tinggi visual 32, `minWidth: 48`, `paddingHorizontal: 12`.
- **Target sentuh minimum 48**: `hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}`. `hitSlop` horizontal sengaja 0 agar tidak tumpang tindih dengan chip sebelah (jarak antarchip 8).
- Keadaan terpilih **tidak hanya warna**: ketebalan huruf + garis aksen + latar (NFR-01).
- Baris: ScrollView mendatar, `paddingHorizontal: 16` (konten ikut gutter halaman), jarak 8, `paddingRight: 16` di ujung, tanpa indikator scroll.
- `accessibilityRole="button"`, `accessibilityState={{ selected }}`, label = nama genre.
- Opsi di ujung kiri: chip "Semua" yang terpilih saat belum ada genre dipilih; menekannya menghapus semua pilihan (lihat D2).

### 8.4 Bagian "Lanjutkan Bermain"

Kartu mendatar, memakai `JourneyCard` yang ada dengan penyesuaian isi.

- **Sampul**: 84 × 112 (rasio 3:4), radius 8.
- **Kartu**: latar `bgSurface`, border 1px `line`, radius 8, padding 12, jarak sampul–teks 12.
- **Judul dunia**: `title` 16/22, `inkPrimary`, `numberOfLines={2}`.
- **Baris meta**: `caption` 12/16, `inkSecondary`, satu baris: `Giliran {n} • {waktu relatif}`. Waktu relatif memakai `formatRelativeDay` yang sudah ada.
- Baris persona **dihilangkan** di Beranda — itu milik detail perjalanan.
- **Lencana belum dibaca**: tinggi 20, `paddingHorizontal: 8`, radius 8, latar transparent, garis 1px `accent`, teks `caption` 12/16 weight 700 warna `accent`, berlabel "Belum dibaca". Bukan `danger` — ini penanda status, bukan galat. Tidak mengandalkan warna saja karena berlabel teks.
- Jumlah: **maksimal 3 kartu**, urut dari terakhir dimainkan. Bila tidak ada perjalanan, bagian ini **tidak ditampilkan** (bukan empty state).
- Tekan: `opacity 0.9`.

### 8.5 Bagian "Baru Diperbarui"

- Baris mendatar menggulir, memakai kembali `StoryCard` dengan **lebar sel 132** → sampul 132 × 176 (3:4), radius 8.
- Judul `title` 16/22 `numberOfLines={2}`; genre `caption` 12/16 `inkSecondary` satu baris.
- Jarak antarkartu 12, `paddingHorizontal: 16`, tanpa indikator scroll.
- Bila kosong, bagian disembunyikan.

### 8.6 Bagian "Semua Cerita"

- Grid 2 kolom yang sudah ada (`FlatList numColumns={2}`), gutter 12, jarak baris 16, padding bawah 32.
- Sel tetap `StoryCard` tanpa permukaan: sampul **173 × 231** (3:4), radius 8 pada sampul.
- Tidak ada peringkat, jumlah pembaca, atau badge tambahan pada kartu.

### 8.7 Tajuk bagian dan pemisah

- **Tajuk bagian**: `small` 13/18, weight 700, `inkSecondary`, tanpa huruf kapital semua, tanpa ikon, tanpa tombol aksi.
- **Pemisah**: garis 1px `line` selebar kolom konten; 24 di atas, 16 di bawah, lalu tajuk, lalu 12 ke isi.
- Bagian pertama (Hero) tanpa pemisah atas; jarak dari pencarian 16. Hero tidak diberi tajuk.

### 8.8 Matriks tema terang dan gelap

| Elemen | Terang | Gelap |
| --- | --- | --- |
| Latar beranda | `bgApp` sand50 #F6F3EC | ink900 #12110D |
| Permukaan kartu | `bgSurface` white #FFFFFF | ink800 #1C1B16 |
| Garis pemisah dan tepian | `line` sand200 #D8D2C2 | ink300 #38352A |
| Teks utama | `inkPrimary` sand900 #1D1B16 | ink100 #F5F1E6 |
| Teks sekunder, tajuk bagian | `inkSecondary` sand700 #5C574B | ink200 #C7C0AE |
| Scrim hero | `scrim` rgba(29,27,22,0.72) | rgba(0,0,0,0.72) |
| Teks dan titik di atas media | `onMedia` #FFFFFF | #FFFFFF |
| Tombol Mulai | latar `accent` clay600 #7C3F2C · teks `inkInverse` #FFFFFF | latar `accent` clay400 #D9977B · teks `inkInverse` #171511 |
| Chip tidak terpilih | transparent · garis sand200 · teks sand700 | transparent · garis ink300 · teks ink200 |
| Chip terpilih | latar sand100 · garis clay600 · teks clay600 | latar ink700 · garis clay400 · teks clay400 |
| Lencana belum dibaca | garis clay600 · teks clay600 | garis clay400 · teks clay400 |
| Placeholder aset | `placeholder` sand100 #ECE7DA | ink700 #26241D |
| Fokus terlihat | `focus` blue600 #1F6FEB | blue300 #7FB3FF |

### 8.9 Keadaan interaksi dan aksesibilitas

- **Hero**: SELURUH kartu adalah satu `Pressable` → StoryDetail, sehingga area judul pun dapat ditekan dan tidak ada zona mati. Pil "Mulai" adalah penanda **visual**, bukan kontrol tersendiri: karena kartunya sudah punya `accessibilityLabel` eksplisit, isi di dalam kartu tidak diumumkan terpisah sehingga tujuan yang sama tidak terucap dua kali. Cara ini juga menghindari tombol bersarang tanpa menambah target ketuk kedua (SC-01.8). Label kartu: `{judul}. {genre}. {home.heroDotsLabel}`. Hint: `home.openWorldHint`.
- Setiap kartu: `accessibilityRole="button"`; label memuat judul + meta; keberadaan lencana "Belum dibaca" ikut disebut dalam label kartu, bukan hanya warna.
- Chip: peran tombol + `accessibilityState.selected`.
- Titik hero: `importantForAccessibility="no"` (dekoratif).
- Urutan fokus mengikuti urutan baca: pencarian → hero → chip → Lanjutkan → Baru Diperbarui → grid.
- Reduced motion: tanpa auto-advance hero; transisi gambar 120 ms menjadi potong langsung.
- Semua teks melewati komponen `Text`, sehingga preferensi skala pemain (0.9–2.0) tetap berlaku; hero tumbuh mengikuti teks berkat `minHeight`.
- Kontras diukur ulang setelah sampul nyata tersedia. Bila gagal, ubah `scrim` dulu, bukan menurunkan standar.

### 8.10 Kebutuhan aset

- **Hero: tidak memerlukan ukuran sampul baru.** Bingkai 358 × 201 → kebutuhan perangkat sekitar 716 × 402 px; aset `cover` yang ada (sisi panjang 1200, ≤350 KB) sudah lebih dari cukup. Pemotongan 3:4 → 16:9 dilakukan dengan `contentFit="cover"`.
- **Risiko yang harus diaudit**: 3:4 → 16:9 membuang sekitar 64% tinggi gambar dan dapat memotong subjek. Lakukan audit pada keempat dunia unggulan. Bila subjek terpotong, tambahkan field opsional `coverWide` pada manifest dunia: 16:9, 1600 × 900, WebP, target ≤500 KB, dengan fallback ke `cover`. Ini menyentuh pipeline (manifest + batasan AI), jadi hanya dilakukan bila audit gagal.
- Kartu lanjut: 84 × 112 → 168 × 224 px perangkat; thumbnail 600 sudah cukup.
- Baru Diperbarui: 132 × 176 → 264 × 352 px perangkat; thumbnail 600 sudah cukup.
- Placeholder: tidak ada aset baru; memakai `colors.placeholder` + ikon `book` yang sudah ada.

### 8.11 Token baru (seminimal mungkin)

| Token | Nilai | Alasan |
| --- | --- | --- |
| `onMedia` | `#FFFFFF` pada kedua tema | Satu-satunya alias untuk teks dan titik di atas scrim. `inkInverse` tidak dapat dipakai karena bernilai gelap (#171511) pada tema gelap. |
| `radius.tile` | `8` | Permukaan baru Beranda mengikuti aturan radius 4–8. `radius.card` 14, `radius.button` 12, dan `radius.chip` 999 (menjadi 16 pada tinggi 32) berada di luar aturan itu — lihat D1. |

Hanya dua penambahan: satu alias warna dan satu radius. Tidak ada warna baru, gradien, atau bayangan.

### 8.12 Yang dikecualikan

Tidak disertakan dan tidak boleh muncul kembali di Beranda: peringkat, jumlah pembaca, enam tombol melingkar, hero belah dua dengan kutipan, tab keempat.

### 8.13 Keputusan terbuka

- **D1 — Radius.** Dokumen menetapkan kartu 14, tombol 12, chip 999; aturan anti-slop menetapkan 4–8. Spesifikasi ini memakai 8 untuk semua permukaan Beranda. Catatan implementasi: `AssetImage` mengunci `borderRadius: radius.card` (14), jadi sampul perlu override `style` bila tidak ikut diturunkan. Rekomendasi: turunkan `radius.card` 14 → 8, `radius.button` 12 → 8, `radius.chip` 999 → 8 pada pass tersendiri agar seragam se-aplikasi. Butuh persetujuan karena menyentuh komponen di luar Beranda.
- **D2 — Cakupan filter chip.** Rekomendasi: chip menyaring "Baru Diperbarui" dan "Semua Cerita"; "Lanjutkan Bermain" tetap tampil tanpa filter, karena kartu lanjut tidak boleh hilang akibat filter. Bila disetujui, tombol filter dan `GenreFilterSheet` tidak lagi dipakai di Beranda. Keberadaan chip "Semua" mengikuti keputusan ini.
- **D3 — `hairlineWidth` vs 1px.** Komponen yang ada memakai `hairlineWidth`; spesifikasi Beranda memakai 1px sesuai aturan anti-slop. Rekomendasi: samakan ke 1px pada pass yang sama dengan D1.
