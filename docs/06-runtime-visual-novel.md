# 06 — Runtime Visual Novel

> Versi 1.0 · 29 September 2026.
> Pemilik state machine, event, cursor, penyimpanan, dan perilaku Auto/Log.
> Kontrak data di [09](09-arsitektur-frontend-dan-kontrak.md); world di [07](07-world-karakter-dan-relasi.md).

## 1. Model mental tiga lapis

1. **Canonical:** semua turn committed milik journey; otoritas server/backend pada produksi.
2. **Presented:** hasil penerapan event sampai beat terakhir yang sudah dibaca. Inilah dasar JourneyDetail dan kartu hubungan.
3. **Replay:** posisi baca ulang di Log; tidak mengubah presented maupun canonical.

Pemisahan ini mencegah JourneyDetail membocorkan hubungan dari beat yang sudah diunduh tetapi belum dibaca.

## 2. Struktur turn dan beat

```text
Journey
└── Turn(t001, input pemain/pembuka)
    ├── Beat b001: setBackground(bg_gedung_luar)
    ├── Beat b002: narrator: "Kamu mulai bekerja..."
    ├── Beat b003: setBackground(bg_kantor_dalam)
    ├── Beat b004: showCharacter(npc_elysia, kesal) + dialogue
    ├── Decision d001
    │   ├── option opt1
    │   ├── option opt2
    │   └── option opt3
    └── Commit metadata: usage, model, memoryVersions, revision
```

Aturan:

- Beat memiliki ID stabil dan urutan monoton.
- Decision hanya satu yang aktif pada satu waktu.
- Pilihan memiliki ID stabil; teks dapat dilokalkan untuk UI tetapi makna tidak berubah diam-diam.
- Efek hubungan diterapkan setelah beat penyebabnya dibaca, bukan saat payload tiba.
- Composer custom selalu membuat input baru; bukan mengedit opsi yang ada.

## 3. Event yang diizinkan

| Event | Fungsi | Validasi frontend |
|---|---|---|
| `setBackground` | Mengganti latar | assetId ada di manifest versi journey |
| `showCharacter` | Menampilkan portrait fokus | npc aktif, expression tersedia |
| `hideCharacter` | Menyembunyikan karakter | tidak menyembunyikan pembicara aktif |
| `say` | Dialog NPC | speaker valid, teks nonkosong, batas panjang |
| `narrate` | Narasi | teks nonkosong, batas panjang |
| `presentChoices` | Menampilkan tiga opsi | tepat tiga opsi berbeda ID |
| `relationshipDelta` | Mengusulkan perubahan hubungan | NPC valid, status dalam enum, alasan tersedia |
| `setFlag` | Flag mekanis kecil | key allowlist, tipe konsisten |
| `memoryWrite` | Usulan memori Paid | hanya bila compaction aktif dan sukses |
| `endArc` | Mengakhiri arc/journey | hanya pada posisi sah dan alasan naratif |

Frontend menolak event tak dikenal, aset lintas-world, perubahan tier/kuota, dan perintah navigasi/file/kode.

## 4. State machine Player

```text
BOOT -> LOADING_SCENE -> READY
READY -> TYPING -> READY -> ADVANCING
READY -> DECISION
DECISION -> SUBMITTING -> COMMITTED -> READY
READY <-> AUTO_PLAYING
READY <-> LOG_OPEN
READY <-> NPC_INSPECTOR
* -> OFFLINE_READ
* -> QUOTA_BLOCKED
* -> CONFLICT
* -> WORLD_RETIRED
SUBMITTING -> FAILED_RETRYABLE -> SUBMITTING
SUBMITTING -> CANCELLED_BEFORE_COMMIT -> READY
```

Invariant:

- Tidak ada dua submission aktif untuk decision yang sama.
- Batal hanya aman sebelum commit; sesudah commit tidak ada undo MVP.
- Retry memakai operation ID sama.
- Hasil terlambat tidak menimpa turn yang lebih baru.
- Meninggalkan Player tidak membatalkan commit yang sudah sukses.

## 5. Cursor dan penyimpanan baca

- `lastCommittedTurnId`: turn resmi terakhir.
- `lastReadBeatId`: beat terakhir yang benar-benar ditampilkan penuh.
- `pendingBeats`: antrean beat committed yang belum dibaca.
- `replayCursor`: posisi Log read-only.
- `presentedRelationship`: hasil event sampai `lastReadBeatId`.
- Cursor ditulis setiap beat selesai, bukan setiap karakter typewriter.
- Continue memakai `lastReadBeatId`, bukan turn terakhir server.
- Crash setelah commit tetapi sebelum flush cursor harus pulih tanpa duplikasi efek.

## 6. Auto

- Hanya memajukan `pendingBeats`.
- Tidak meminta turn baru, tidak memilih opsi, tidak mengirim teks.
- Interval default 2,2 detik setelah teks selesai; dapat diatur 1–5 detik.
- Berhenti pada decision, modal, konflik, offline-write, quota, retired, akhir arc, atau laporan dibuka.
- Auto tidak berjalan saat aplikasi background.
- Status Auto selalu terlihat dan penyebab berhentinya dijelaskan.

## 7. Log dan bookmark

- Log berisi teks final committed, input pemain, baris sistem hubungan, dan pemisah sesi/compaction.
- Log bukan sumber konteks; ia adalah arsip baca.
- Bookmark P1 menandai beat tanpa mengubah cerita.
- Pencarian log P1 hanya lokal pada journey aktif.
- Ekspor P1 memakai versi aman tanpa secret/rahasia yang belum terungkap.

## 8. Contoh urutan demo

```text
Turn t001 pembuka
b001 setBackground(bg_gedung_luar)
b002 narrate: hari pertama
b003 setBackground(bg_kantor_dalam)
b004 show Elysia/kesal + dialog keterlambatan
d001: tiga opsi AI + composer
Pemain memilih custom kabedon
Turn t002 committed
b005 narrate konsekuensi
b006 Elysia tetap kesal + teguran
b007 relationshipDelta Elysia Normal -> Waspada
b008 show Leo/senang + dialog
b009 Elysia tercengang + balasan
```

Hubungan Waspada muncul setelah b007 dibaca. Sebelum itu, JourneyDetail tetap menampilkan Normal.

## 9. Kriteria selesai runtime

- Semua event tak valid ditolak dengan pesan aman.
- Tidak ada hubungan yang berubah sebelum beat penyebabnya dibaca.
- Tidak ada generasi baru dari Auto, replay, atau rotasi layar.
- Crash/internet putus tidak menggandakan turn atau menghapus draft.
- Continue selalu kembali ke posisi baca yang benar.
