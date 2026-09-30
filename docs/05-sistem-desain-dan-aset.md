# 05 — Sistem Desain dan Aset

> Versi 1.0 · 29 September 2026.
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
