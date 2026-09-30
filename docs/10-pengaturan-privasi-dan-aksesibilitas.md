# 10 — Pengaturan, Privasi, dan Aksesibilitas

> Versi 1.0 · 29 September 2026.
> Layar terkait SC-15 sampai SC-24 di [04](04-spesifikasi-layar.md); kontrak di [09](09-arsitektur-frontend-dan-kontrak.md).

## 1. Profil dan usia

- Nama akun 1–30 karakter; dukung Unicode; tidak boleh kosong.
- Usia aktual wajib untuk gate konten; bukan usia persona.
- Perubahan nama menjelaskan dampak pada journey baru vs aktif.
- Perubahan usia ke bawah ambang memicu peninjauan akses world dewasa.
- Avatar P1; tidak ada upload yang memproses data biometrik untuk gameplay inti.
- Tidak ada izin kontak, lokasi, atau mikrofon untuk alur P0.

## 2. Bahasa

| Preferensi | Berlaku | Tidak berlaku |
|---|---|---|
| Bahasa UI | Seluruh chrome aplikasi segera | Dialog lama, Log lama, memori tersimpan |
| Bahasa respons | Request generasi berikutnya pada journey berjalan | Menerjemahkan ulang arsip |

Bila bahasa respons tidak didukung world, tampilkan fallback dan pilihan dunia lain; jangan mengganti diam-diam ke bahasa lain lalu menagih token.

## 3. Kenyamanan membaca

- Ukuran dialog 14–24; default 17.
- Kecepatan typewriter karakter per detik; opsi tampilkan langsung.
- Jeda Auto 1–5 detik; default 2,2 detik.
- Tema Sistem/Gelap/Terang; ilustrasi tidak di-invert destruktif.
- Reduced motion mengikuti sistem; haptics dapat dimatikan.
- Semua pengaturan memiliki preview lokal tanpa memanggil AI.

## 4. Privasi dan data

- Akun dan journey terisolasi; cache lokal dibatasi per identitas.
- Custom input dan dialog bukan bahan analytics default.
- Event standar hanya metadata nonteks dan hasil operasi.
- Ekspor P1 hanya data milik akun/journey tersebut dalam format aman.
- Hapus journey ≠ hapus akun ≠ hapus cache.
- Logout/ganti akun menghapus kredensial privat dan menyembunyikan save lama.
- Hapus akun P1-rilis menjelaskan cakupan, status async, dan retensi sebelum konfirmasi.
- Enkripsi/backup/restore mengikuti keputusan D-26; tidak ada klaim sebelum diuji.

## 5. Pelaporan dan bantuan

- Lapor dari Player/Log/JourneyDetail dengan memilih beat yang relevan.
- Kategori: cerita tidak konsisten, karakter keluar kepribadian, aset salah, hubungan tidak masuk akal, konten tidak pantas, bug teknis.
- Pelapor dapat memilih menyertakan teks beat; default minimal.
- Pelaporan menjeda Auto dan tidak mengubah state cerita.
- Bantuan menjelaskan AI bisa keliru, beda Log/konteks/memori, arti kuota, dan langkah pemulihan.

## 6. Aksesibilitas fungsional

- Semua teks UI memakai key ID/EN; tidak ada enum mentah.
- Screen reader mengumumkan pembicara, teks, opsi, status hubungan, error, dan dialog modal.
- Fokus modal terperangkap; tombol destruktif tidak menjadi fokus awal.
- Target inti 48 unit; jarak aman; ikon hapus tidak menempel Continue.
- Alur inti selesai pada skala teks 200% dan navigasi keyboard/switch.
- Status Auto, loading, dan hubungan memakai teks, bukan hanya warna/ikon.

## 7. Kriteria selesai

- Tidak ada pengaturan yang mengubah kuota/hubungan dari perangkat.
- Tidak ada teks sensitif dalam analytics atau screenshot uji.
- Semua gate usia dan bahasa dapat dibuktikan lewat skenario 11.
- Pengguna dapat menemukan kontrol privasi tanpa membuka dokumentasi eksternal.
