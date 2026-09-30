# 11 — Demo dan Skenario Uji

> Versi 1.0 · 29 September 2026.
> Storyboard demo, fixture deterministik, dan acceptance criteria P0.
> Pelaksana detail di [12](12-roadmap-backlog-dan-gate.md); cakupan di [13](13-matriks-keterlacakan-dan-review.md).

## 1. Storyboard demo Elysia–Leo

Semua tokoh dewasa. Dialog di bawah contoh nada, bukan naskah final.

1. Latar luar gedung AAA; narasi hari pertama.
2. Latar interior kantor; narasi hampir terlambat.
3. Elysia/kesal menegur keterlambatan dan menanyakan job desk.
4. Decision tiga opsi berbeda niat: minta maaf profesional; jelaskan singkat dan minta arahan; humor hati-hati.
5. Pemain memilih custom: mendekati Elysia secara fisik dan menantangnya.
6. Narasi menilai tindakan itu melewati batas; Elysia tetap kesal dan memberi teguran.
7. Hubungan Elysia Normal → Waspada disertai alasan publik.
8. Leo/senang menengahi dan menggoda keduanya.
9. Elysia/tercengang menolak gagasan balikan.
10. Leo merespons santai; decision berikutnya dimulai.

Poin yang dibuktikan: latar berganti; ekspresi berganti; dialog berbeda pembicara; opsi AI tiga; custom input diproses sebagai upaya; hubungan berubah dengan alasan; karakter ketiga masuk tanpa merusak state.

## 2. Fixture deterministik

Seed `demo_bosku_mantan_v1` harus menghasilkan:

- Turn pembuka dan decision yang sama.
- Tiga opsi dengan ID stabil.
- Respons custom kabedon yang sama: teguran + Waspada.
- Adegan Leo yang sama.
- Metadata usage tetap untuk test.
- Simulasi error: lambat 10 detik, timeout, kuota habis, conflict, aset hilang.

Fixture hanya untuk pengujian; bukan konten produksi final.

## 3. Acceptance criteria P0

### Katalog dan detail

- [ ] AC-01: Cari judul parsial menampilkan hasil dalam 300 ms dari cache uji.
- [ ] AC-02: Multi-genre OR menjelaskan semantiknya dan reset bekerja.
- [ ] AC-03: StoryDetail menampilkan versi, rating, karakter publik, dan Start sticky.
- [ ] AC-04: World retired menonaktifkan Start dengan alasan aman.

### Player dan decision

- [ ] AC-05: Tap pertama menyelesaikan teks; tap kedua pindah beat.
- [ ] AC-06: Tepat tiga opsi berbeda niat; terkunci setelah dipilih.
- [ ] AC-07: Draft custom bertahan setelah rotasi dan error validasi.
- [ ] AC-08: Retry memakai operation ID sama tanpa turn ganda.
- [ ] AC-09: Hasil terlambat tidak menimpa turn baru.
- [ ] AC-10: Batal sebelum commit aman; sesudah commit tidak ada undo diam-diam.

### Relasi dan anti-spoiler

- [ ] AC-11: Waspada muncul setelah beat penyebab dibaca.
- [ ] AC-12: JourneyDetail tidak menampilkan efek beat belum dibaca.
- [ ] AC-13: Alasan publik selalu ada; secret tidak bocor.
- [ ] AC-14: Custom input tidak dapat memaksa status Cinta.

### Auto/Log

- [ ] AC-15: Auto berhenti di decision, modal, background, dan gangguan.
- [ ] AC-16: Replay Log tidak memakai token atau mengubah relasi.
- [ ] AC-17: Continue kembali ke beat baca yang benar setelah proses dimatikan.

### Journey dan hapus

- [ ] AC-18: Daftar terurut terakhir dimainkan dengan badge belum selesai.
- [ ] AC-19: Tap ganda Start tidak membuat journey ganda.
- [ ] AC-20: Hapus memakai konfirmasi spesifik dan hasil eksplisit.

### Pengaturan dan bahasa

- [ ] AC-21: Validasi nama/usia inline dan aksesibel.
- [ ] AC-22: Ganti UI tidak memanggil AI; ganti respons hanya untuk request berikutnya.
- [ ] AC-23: Skala teks 200% tidak menyembunyikan tombol inti.

### Kuota dan memori

- [ ] AC-24: Estimasi melebihi sisa memblokir request sebelum dikirim.
- [ ] AC-25: Kuota habis membuka Log/pengaturan; cerita tersimpan tetap ada.
- [ ] AC-26: Free tidak memiliki artefak compaction; Paid mencatat versi/sumber/biaya.
- [ ] AC-27: Kegagalan compaction tidak menghapus sumber.
- [ ] AC-28: Upgrade/downgrade tidak menghapus journey.

### Keandalan dan keamanan

- [ ] AC-29: Kehilangan koneksi di tengah sesi tidak menghapus draft/posisi baca; generasi baru diblokir dengan pesan yang berbeda dari kuota habis. Tidak ada mode baca offline.
- [ ] AC-30: Event aset tak valid ditolak dengan fallback netral.
- [ ] AC-31: Tidak ada secret di bundle, log, atau analytics.
- [ ] AC-32: Semua alur P0 dapat dipakai dengan screen reader.
- [ ] AC-33: Saat `RATE_LIMITED`, tombol kirim nonaktif sampai waktu buka, retry memakai operation ID sama, draft/cursor utuh.
- [ ] AC-34: Saat `ABUSE_WARN/BLOCKED`, Auto terjeda, alasan aman + durasi tampil, Log/pengaturan tetap buka, tidak ada skor internal di UI.

## 4. Metode pengujian

- Unit/property untuk reducer cursor, validasi event, dan formula allowance.
- Integration untuk mock gateway, retry, conflict, quota, dan compaction.
- E2E pada perangkat Android acuan untuk funnel mulai → decision → relasi → continue → hapus.
- Fault injection untuk crash sebelum/sesudah commit dan hasil terlambat.
- Audit manual aksesibilitas, kontras, dan teks 200%.
- Secret scan dan inspeksi payload sebelum setiap gate.
