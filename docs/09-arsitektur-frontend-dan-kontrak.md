# 09 — Arsitektur Frontend dan Kontrak

> Versi 1.0 · 29 September 2026.
> Rekomendasi teknis yang dapat ditinjau; bukan perintah membeli layanan atau memilih provider AI.
> Runtime di [06](06-runtime-visual-novel.md); pengaturan di [10](10-pengaturan-privasi-dan-aksesibilitas.md).

## 1. Keputusan arsitektur yang diusulkan

### ADR-01 React Native + Expo + TypeScript

Usulan karena target adalah aplikasi mobile native portrait dengan pengembangan Android-first dan kesiapan iOS. Expo Router memberi navigasi file-based dan deep-link; modul native Expo mencakup storage, secure item, notifikasi, dan update.

Alternatif yang dipertimbangkan:

- Flutter: performa baik, tetapi tim/ekosistem yang diasumsikan di sini lebih dekat ke TypeScript.
- Native Kotlin/Swift terpisah: kualitas maksimum, biaya ganda.
- PWA/web wrapper: tidak memenuhi ekspektasi aplikasi mobile imersif dan distribusi toko aplikasi.
- Unity: berlebihan untuk novel visual berbasis teks/gambar 2D.

Keputusan final menunggu O-02/O-03. Versi SDK, bahasa, dan tool build dipilih saat implementasi dimulai, bukan dibekukan dari dokumen.

### ADR-02 State terpisah per domain

- UI state: React Query/RTK Query untuk server state; Zustand/Redux Toolkit untuk playback lokal bila diperlukan.
- Playback: reducer murni untuk canonical/presented/replay cursor.
- Form: state lokal per layar; draft composer persisten per journey/decision.
- Tidak ada singleton global yang menyimpan teks cerita di luar store yang dapat dibersihkan per akun.

### ADR-03 Baseline polling di balik adapter

Baseline memakai HTTP command untuk memulai operation lalu polling status. Alasan: dokumentasi React Native yang dirujuk hanya memastikan Fetch, XMLHttpRequest, dan WebSocket; EventSource tidak tercantum eksplisit di halaman Networking tersebut. Adapter `Transport` memungkinkan SSE/WebSocket diuji kemudian tanpa mengubah runtime.

## 2. Struktur frontend yang diusulkan

```text
frontend/
├── app/
│   ├── (tabs)/index
│   ├── (tabs)/journey
│   ├── (tabs)/settings
│   ├── world/[worldId]
│   ├── journey/[journeyId]
│   ├── player/[journeyId]
│   └── settings/...
├── src/
│   ├── components/
│   ├── features/catalog/
│   ├── features/player/
│   ├── features/journeys/
│   ├── features/settings/
│   ├── state/
│   ├── data/
│   ├── i18n/
│   ├── transport/
│   ├── storage/
│   ├── telemetry/
│   └── testing/fixtures/
└── docs-link -> ../docs
```

Layar tidak memanggil Fetch langsung; semua melalui gateway/adapter. Renderer scene tidak mengetahui nama provider AI.

## 3. Lapisan data

| Lapisan | Isi | Contoh teknologi yang diusulkan |
|---|---|---|
| Server cache | World, journey, turn, usage, entitlement | React Query + cache persisten terbatas |
| Playback lokal | Beat, cursor, Auto, draft | Reducer + MMKV/AsyncStorage sesuai kebutuhan |
| Media cache | Gambar/audio | Expo FileSystem/Image dengan kuota |
| Secret kecil | Token sesi | SecureStore; bukan untuk transkrip |
| Database lokal | Cursor/log/draft penting | SQLite bila relasi lokal kompleks; jika tidak, key-value cukup |

Tidak ada klaim enkripsi penuh sebelum keputusan D-26. Data privat dibatasi per akun dan dibersihkan saat logout/ganti akun.

## 4. Kontrak minimum

### WorldCatalogItem

```json
{
  "worldId": "w_bosku-mantan",
  "title": "Bosku Adalah Mantan Pacarku di Kampus Dulu",
  "synopsis": "Hari pertama kerja mempertemukanmu kembali dengan masa lalu.",
  "genres": ["romance", "drama", "office"],
  "coverAssetId": "a_cover_kantor",
  "worldVersion": 7,
  "status": "published",
  "contentRating": "18_plus",
  "supportedResponseLocales": ["id-ID", "en-US"]
}
```

### WorldDetailDTO

Berisi katalog + premis publik, lokasi, NPC publik, relasi awal yang diizinkan, manifest aset, aturan konten ringkas, dan status versi.

### NPCPublicDTO

ID, nama, peran, trait publik, backstory publik, relasi awal yang diizinkan, daftar expression, dan portrait default. Tidak ada rahasia, prompt, atau skor internal.

### JourneySession

Ditambahkan pada F2 untuk memulai atau melanjutkan permainan (FR-23, FR-25).

```json
{
  "journeyId": "j_001",
  "world": { "worldId": "w_bosku-mantan", "worldVersion": 7, "characters": [] },
  "beats": [],
  "relationsBaseline": [],
  "memory": {"activeVersion": null, "source": "none"},
  "committedCursor": 42,
  "simulator": true
}
```

**Aturan penting:** `relationsBaseline` berisi hubungan **sebelum beat mana pun**, bukan
hubungan kanonik terkini. Frontend menurunkan hubungan yang boleh dilihat dengan menerapkan
hanya beat yang sudah dibaca pemain. Bila server mengirim hubungan kanonik di sini,
perubahan dari beat yang belum dibaca akan bocor ke UI (R-04, AC-12). Hubungan kanonik
tetap tersedia lewat `JourneyDetailDTO` untuk tab Perjalanan.

### JourneyCreateRequest

```json
{
  "clientOperationId": "op_01J...",
  "worldId": "w_bosku-mantan",
  "persona": {"name": "Arfan", "age": 24},
  "responseLocale": "id-ID",
  "idempotencyKey": "op_01J..."
}
```

Respons mengembalikan journeyId, worldVersion yang dikunci, turn pembuka, dan cursor awal.

### JourneyDetailDTO

Berisi journeyId, worldId/version, persona snapshot, progres, relasi presented, status memori ringkas, entitlement/tier tampilan, dan URL log yang boleh diakses.

### TurnSubmitRequest

```json
{
  "clientOperationId": "op_02K...",
  "journeyId": "j_123",
  "decisionId": "d001",
  "selection": {"optionId": "opt2"},
  "customText": null,
  "responseLocale": "id-ID"
}
```

Hanya satu dari `selection` atau `customText` yang terisi. Custom text adalah upaya pemain, bukan perintah sistem.

### TurnResultEnvelope

```json
{
  "operationId": "op_02K...",
  "journeyId": "j_123",
  "turnId": "t002",
  "revision": 3,
  "beats": [],
  "usage": {"promptTokens": 18240, "completionTokens": 640, "chargedTotal": 18880},
  "memory": {"activeVersion": 4, "source": "checkpoint"},
  "budget": {"availableAfter": 81120, "resetAt": "2026-09-30T00:00:00Z"}
}
```

Frontend menerapkan beats hanya setelah validasi skema dan manifest.

### UsageDTO dan EntitlementDTO

Usage berisi spent, reserved, available, limit, reset, dan status estimasi/final. Entitlement berisi tier, status langganan, hak compaction, dan masa berlaku; nilai resmi berasal dari server, bukan UI.

## 5. Validasi frontend

Tolak payload bila:

- Schema tidak cocok atau ukuran melebihi batas.
- worldId/version tidak sama dengan journey.
- npcId/expression/background tidak ada di manifest.
- relationship memakai enum tak dikenal tanpa fallback netral.
- Event mencoba mengubah tier, kuota, file, navigasi, atau kode.
- Teks melebihi batas baca atau mengandung kontrol berbahaya.
- Decision tidak tepat tiga opsi atau ID duplikat.
- Turn duplikat dengan operation ID sama diperlakukan sebagai hasil yang sama, bukan turn baru.

Semua penolakan memiliki pesan aman dan tombol laporkan; tidak ada stack trace mentah ke pemain.

## 6. Transport dan error mapping

Operation lifecycle:

```text
CREATED -> RUNNING -> SUCCEEDED
RUNNING -> FAILED_RETRYABLE
RUNNING -> FAILED_FATAL
RUNNING -> CANCELLED_BEFORE_COMMIT
SUCCEEDED -> LATE_RESULT_IGNORED bila cursor sudah maju
```

Polling hanya foreground; berhenti saat background. Backoff dibatasi; tidak ada polling tanpa henti. Kesalahan jaringan, auth, validasi, konflik, kuota, konteks, rate limit, abuse, dan maintenance dipetakan ke pesan berbeda.

| Kode server | Arti | Perilaku frontend |
|---|---|---|
| `RATE_LIMITED` | Kena rate limit; ada `retryAfterSec` | Nonaktifkan kirim sementara; tampilkan hitung mundur; retry operation sama |
| `ABUSE_WARN` | Aktivitas mencurigakan, peringatan | Jeda Auto; tampilkan peringatan + panduan; izinkan banding/lapor |
| `ABUSE_BLOCKED` | Blokir sementara + `blockedUntil` | Blokir kirim; Log/pengaturan tetap buka; tampilkan alasan aman + jalur banding |
| `QUOTA_EXHAUSTED` | Allowance habis | Sama seperti kuota habis; tidak ada auto-retry |
| `MODEL_UNAVAILABLE` | Kandidat model down/tidak memenuhi kontrak | Tampilkan status jujur; tawarkan baca Log; jangan klaim ganti model diam-diam |

Envelope turn wajib memuat `modelId` dan `modelVersion` untuk transparansi (bukan untuk memilih model dari klien). Nilai resmi kuota/entitlement tetap dari server.

## 7. Mock adapter

`MockStoryGateway` menyediakan:

- Katalog tiga dunia dan fixture Elysia–Leo.
- Turn pembuka deterministik dari seed.
- Tiga opsi berbeda niat dan respons custom yang masuk akal.
- Perubahan hubungan sesuai aturan demo.
- Simulasi lambat/timeout/kuota habis/conflict/asset hilang.
- Label “SIMULATOR” pada setiap respons.

Mock tidak boleh dikira backend produksi. Integrasi nyata menunggu kontrak backend dan gate 12.

## 8. Kriteria selesai arsitektur

- Semua layar memakai DTO di atas; tidak ada field rahasia di publik.
- Pergantian mock ke gateway nyata tidak menulis ulang renderer.
- Semua mutation memiliki operation ID dan error mapping.
- Tidak ada secret di bundle atau fixture produksi.
