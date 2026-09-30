# 03 — Arsitektur Informasi dan Alur

> Versi 1.0 · 29 September 2026.
> Menetapkan navigasi, state layar, dan semua alur pemulihan. Detail komponen di [04](04-spesifikasi-layar.md); runtime di [06](06-runtime-visual-novel.md).

## 1. Peta navigasi

```text
Tabs
├── Home
│   ├── Search overlay/filter state
│   ├── StoryDetail(worldId)
│   │   ├── CharacterSheet(npcId, mode=public)
│   │   └── SetupPersona -> Player(journeyId)
│   └── ResumeBanner -> Player/JourneyDetail
├── Journey
│   ├── JourneyList
│   ├── JourneyDetail(journeyId)
│   │   ├── CharacterSheet(npcId, mode=seen)
│   │   ├── Player(journeyId, resume)
│   │   └── DeleteConfirm
│   └── WorldRetiredNotice bila world ditarik
└── Settings
    ├── Profile
    ├── Reading/Accessibility
    ├── LanguageUI/LanguageResponse
    ├── PlanQuotaMemory
    │   ├── PlanComparison
    │   ├── CompactionStatus Paid
    │   └── PurchasePending bila relevan
    ├── PrivacyDataHelp
    └── AboutLegal

Modal global: ErrorSheet, OfflineBar, QuotaSheet, ReportSheet, AuthGate, UpdateRequired, DeleteConfirm
Player internal: Stage, DialogueBox, ChoicesSheet, Composer, LogDrawer, NPCInspector, PauseOverlay
```

Deep-link internal diusulkan:

- `fayln://world/{worldId}`
- `fayln://journey/{journeyId}`
- `fayln://player/{journeyId}?beat={beatId}`
- `fayln://settings/plan`

Skema final: **fayln**. Link journey membutuhkan otorisasi pemilik; tamu diarahkan ke auth atau demo.

## 2. State navigasi dan param

| Layar | Param wajib | State yang dipertahankan | Kembali ke |
|---|---|---|---|
| Home | tidak ada | query, filter, scroll, banner terakhir | Tabs |
| StoryDetail | worldId, worldVersion tampil | scroll, tab info/karakter | Home + query lama |
| SetupPersona | worldId | draft nama/usia/bahasa respons | StoryDetail |
| Player | journeyId | playback, cursor, draft, Auto, overlay | pemanggil + posisi |
| JourneyDetail | journeyId | scroll, hubungan yang sudah terlihat | JourneyList |
| LogDrawer | journeyId, replayCursor | pencarian lokal/bookmark P1 | Player |
| Settings subhalaman | section | form belum disimpan/draft eksplisit | Settings root |
| Search/filter | query + selectedGenres | chip aktif dan hasil | Home |

Param opsional tidak boleh mengubah identitas journey. `beat` hanya petunjuk resume; server tetap sumber canonical state.

## 3. Alur utama

### 3.1 Penemuan sampai mulai

1. Buka Home → skeleton bila kosong → grid cerita/default editorial.
2. Cari/filter; hasil kosong menampilkan aksi reset, bukan layar mati.
3. Buka StoryDetail; pelajari sinopsis, genre, karakter publik, peringatan konten.
4. Tekan Start Journey → SetupPersona; nama default dari profil dapat disunting.
5. Konfirmasi batas kuota/konten bila relevan → journey dibuat idempotent.
6. Narasi pembuka dunia dimuat sebagai turn pertama.
7. Jika world retired, tombol Start diganti status dan alasan aman.

### 3.2 Satu decision dalam Player

1. Membaca beat yang telah tersedia.
2. Decision aktif menampilkan tepat tiga opsi dan composer custom.
3. Memilih opsi mengunci satu pilihan; mengetik membutuhkan kirim eksplisit.
4. Permintaan memiliki `clientOperationId`; retry memakai ID sama.
5. Hasil committed → beat baru ditambahkan → cursor mengikuti bila pengguna di akhir.
6. Auto berhenti sebelum decision. Tidak ada opsi default.

### 3.3 Continue dan delete

1. JourneyList menampilkan urutan terakhir dimainkan; badge “belum selesai dibaca”.
2. JourneyDetail mengambil `JourneyDetailDTO` presented-state; bukan data publik katalog.
3. Continue melanjutkan dari `lastReadBeatId` yang aman.
4. Delete membuka konfirmasi menyebut judul dunia dan tanggal mulai; aksi destruktif memakai pola tekan-dua-tahap atau ketik konfirmasi sesuai kebijakan.
5. Hasil sukses menghapus cache lokal hanya milik journey tersebut; daftar diperbarui tanpa reload penuh.
6. Kegagalan delete menampilkan state spesifik dan tidak berpura-pura terhapus.

### 3.4 Pengaturan dan akun

1. Ubah nama/usia/bahasa dengan validasi inline.
2. Bahasa UI langsung berlaku; bahasa respons berlaku untuk generasi berikutnya.
3. Upgrade/downgrade tidak menutup Player secara paksa kecuali request aktif harus dibatalkan dengan aman.
4. Logout/ganti akun memindahkan kredensial privat dan cache milik akun lama; halaman auth kosong dari data akun lama.
5. Hapus akun memakai penjelasan cakupan sebelum konfirmasi; status async dapat dipantau.

## 4. Alur gangguan

| Kondisi | Perilaku frontend |
|---|---|
| Generasi lambat | Status jujur tanpa persentase palsu; pembatalan aman sebelum commit |
| Timeout/network | Draft dan cursor dipertahankan; retry operation sama |
| Respons terlambat setelah timeout | Hasil lama diabaikan/diarsipkan; tidak menimpa turn baru |
| Kuota habis | Composer dan pilihan dinonaktifkan; Log dan pengaturan tetap terbuka |
| Context penuh | Peringatan + saran Paid/compaction; Free tidak kehilangan log |
| Conflict perangkat | Simpan lokal, tampilkan pilihan salinan aman; tidak auto-merge diam-diam |
| World retired | Journey lama read-only; journey baru diblokir |
| Asset hilang | Fallback netral + tombol laporkan; lore tidak dikarang |
| Model menolak aksi unsafe | Alasan in-character + opsi alternatif; log mencatat upaya dan penolakan |
| Maintenance/update wajib | Mode baca bila memungkinkan; generasi diblokir eksplisit |

## 5. Aksesibilitas navigasi

- Fokus modal terperangkap; Esc/back menutup dari atas ke bawah.
- Judul layar terumumkan; tab memakai label dan state aktif.
- ChoicesSheet dan LogDrawer memakai heading dan kontrol tutup bernama.
- Semua dialog destruktif memiliki nama journey, konsekuensi, dan fokus awal ke tombol aman.
- Deep link dan notifikasi tidak melewati auth/gate konten.

## 6. Telemetri navigasi

Hanya peristiwa nonteks: pembukaan layar, pencarian dilakukan, filter dipakai, mulai/continue/delete diminta dan hasilnya, decision diselesaikan, Auto/Log dibuka. Tidak ada isi cerita, draft, nama, usia mentah, atau token.
