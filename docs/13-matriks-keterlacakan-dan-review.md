# 13 — Matriks Keterlacakan dan Review

> Versi 1.0 · 29 September 2026.
> Bukti bahwa setiap kebutuhan memiliki wujud dan pengujian.
> Sumber kebutuhan [01](01-visi-lingkup-dan-kebutuhan.md); uji [11](11-demo-dan-skenario-uji.md).

## 1. Keterlacakan FR → layar → kontrak → uji

| FR | Layar | Kontrak/state | Uji |
|---|---|---|---|
| FR-01–04 | SC-01 | WorldCatalogItem | AC-01–02 |
| FR-05 | SC-06 | JourneyListDTO | AC-18 |
| FR-06–09 | SC-03–05 | WorldDetailDTO, NPCPublicDTO | AC-03–04 |
| FR-10–12 | SC-02,05 | JourneyCreateRequest | AC-19,21 |
| FR-13–16 | SC-08 | Beats setBackground/show/say/narrate | AC-05 |
| FR-17–18 | SC-09 | Decision/options/custom | AC-06–08 |
| FR-19,21 | SC-12,10 | AUTO/LOG state | AC-15–16 |
| FR-20,30 | SC-10 | Log read-only | AC-16 |
| FR-22–23 | SC-08,11 | relationshipDelta + inspector | AC-11–14 |
| FR-24–25 | SC-08,07 | Cursor canonical/presented | AC-09,17 |
| FR-26–28 | SC-06,07,23 | JourneyDetailDTO/Delete | AC-18–20 |
| FR-29–30 | SC-10 P1 | Bookmark/replay | F5 |
| FR-31–34 | SC-02,16,17 | Profile/Locale | AC-21–22 |
| FR-35–38 | SC-15 | Reading/theme/motion | AC-23 |
| FR-39–40 | SC-02,24 | Auth/session | F4 |
| FR-41–45 | SC-18 | Usage/Entitlement simulator | AC-24–25 |
| FR-46–49 | SC-18,19,20 | Context/compaction/memory | AC-26–28 |
| FR-50 | SC-13,18 | Budget precheck | AC-24–25 |
| FR-51–53 | SC-21,13 | Cache/offline/retry | AC-29 |
| FR-54,60 | SC-03,07 | WorldVersion/status | AC-04 |
| FR-55–59 | SC-08,13 | Event validation/ownership | AC-10,30–31 |
| FR-61 | SC-20 | Memory visible | AC-26 |
| FR-62–63 | SC-07,02 P1 | Archive/onboarding | F5 |
| FR-64–66 | SC-09 | Decision/composer/ringkas | AC-06–07 |
| FR-67–72 | SC-21,22,24,14 | Ekspor/lapor/auth/akhir/notif | F4/F5 |
| FR-73–74 | SC-13,09 | RateLimit/Abuse contract + UX | AC-33–34 |

## 2. Keterlacakan NFR

| NFR | Bukti |
|---|---|
| NFR-01–03 | Audit kontras, skala teks, target sentuh |
| NFR-04–06 | Profiling daftar/log, target respons, budget aset |
| NFR-07–09 | Test retry, payload invalid, crash boundary |
| NFR-10–12 | Inspeksi telemetry, storage, parity ID/EN |
| NFR-13–16 | Fault injection, acceptance P0, modularitas adapter, disiplin tiga tab |
| NFR-17–20 | Formula allowance, lifecycle Auto, screen reader, degradasi |

## 3. Review konsistensi internal

- [x] Istilah Journey/JourneyDetail konsisten; tidak ada label chat manusia.
- [x] Ejaan Journey dipakai; varian salah tidak ada di dokumen final.
- [x] Hubungan per journey; tidak ada klaim global.
- [x] Auto tidak memilih/mengirim token.
- [x] Log read-only dan bukan konteks model.
- [x] Free menyimpan Log/state; Paid menambah memori, bukan kesempurnaan.
- [x] Periode Paid 1 juta ditandai asumsi harian.
- [x] Tidak ada harga/provider/login yang dikarang.
- [x] Backend/frontend tetap kosong pada pengiriman rencana.
- [x] Semua FR P0 memiliki layar dan AC.
- [x] Semua event memiliki validasi dan fallback.
- [x] Tautan dokumen memakai nama berkas yang ada.
- [x] Rate limit/abuse: enforcement server, UX 429/blokir, tanpa skor internal di klien.
- [x] Kandidat model Free Gemma 4 E4B uncensored / Paid `mistral-medium-latest` tercatat sebagai usulan belum terverifikasi; tidak ada klaim konteks/harga.
- [x] Nama produk **fayLN** dan scheme deep-link `fayln://` konsisten di dokumen 00, 02, 03.
- [x] F2 selesai: AC-05–AC-17 tercakup tes otomatis; kontrak `openJourneySession` terdokumentasi di 09.

## 4. Status persetujuan

- Draf 1.0 selesai sebagai paket review.
- **Nama produk dikunci: fayLN** (30 Sep 2026). Gate F0 lolos kondisional.
- F1 (fondasi frontend) boleh dimulai; F4 (backend nyata) tetap terkunci.
- Masih terbuka: O-08a/O-08b (verifikasi model), O-09 (login/entitlement), D-26 (retensi/enkripsi).
- Perubahan setelah persetujuan mengikuti prosedur kendali perubahan 01 §10.
