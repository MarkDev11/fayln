# 07 — World, Karakter, dan Relasi

> Versi 1.0 · 29 September 2026.
> Menetapkan apa yang ditulis admin, apa yang boleh berubah, dan apa yang tidak boleh dibaca pemain.
> Struktur DTO di [09](09-arsitektur-frontend-dan-kontrak.md); contoh di [11](11-demo-dan-skenario-uji.md).

## 1. World

World adalah paket kanon yang diterbitkan admin:

- Identitas: ID stabil, judul, sinopsis publik, genre, bahasa yang didukung.
- Premis pembuka dan nada cerita.
- Lokasi yang diizinkan dan latar yang tersedia.
- Daftar NPC dan relasi awal.
- Aturan konten, rating, dan batas perilaku.
- Manifest aset untuk versi tersebut.
- Status: draft, published, retired, revoked.
- Nomor versi immutable; publikasi baru membuat versi baru.

Journey menyimpan `worldId` dan `worldVersion`. Publikasi baru tidak mengubah journey lama. Retired menghentikan journey baru tetapi membiarkan journey lama dibaca; revoked dipakai untuk masalah serius dan membutuhkan pesan aman.

## 2. CharacterDefinition

Setiap NPC memiliki:

- ID stabil, nama tampil, peran, dan afiliasi.
- Trait publik dan trait privat; hanya publik yang boleh tampil sebelum terungkap.
- Backstory publik dan rahasia; rahasia tidak masuk DTO publik.
- Tujuan, luka lama, gaya bicara, dan batas perilaku.
- Relasi awal ke NPC lain dan ke pemain.
- Ekspresi yang tersedia dan portrait-nya.
- Pengetahuan yang boleh dipakai dalam cerita.
- Contoh nada bila perlu, bukan dialog yang harus diulang.

NPC bukan sekadar label emosi. Elysia bersikap sinis karena sejarah dan jabatannya; Leo meredakan karena ia mengenal keduanya. AI boleh mengembangkan respons, tetapi tidak boleh menghapus motivasi tersebut tanpa peristiwa yang masuk akal dalam cerita.

## 3. Sosok pemain dan persona

- Profil akun menyimpan nama dan usia aktual.
- Setiap journey menyimpan persona snapshot: nama protagonis, usia tokoh, dan preferensi relevan.
- Mengubah nama akun tidak mengubah persona journey aktif tanpa konfirmasi.
- Usia akun dipakai untuk gate konten; usia persona tidak boleh dipakai untuk melewatinya.
- Semua contoh romantis memakai karakter dewasa.

## 4. Model hubungan

Hubungan adalah state per pasangan pemain–NPC dalam satu journey:

```text
JourneyPlayerRelation {
  journeyId
  npcId
  status: NORMAL | HANGAT | WASPADA | TEGANG | RENGGANG | DEKAT | SAYANG | CINTA | ...
  score: opsional internal 0..100, tidak tampil sebagai angka pasti
  updatedAtTurnId
  reasonPublic: alasan aman yang boleh dibaca
  reasonPrivate: catatan internal, tidak dikirim ke publik
}
```

Aturan:

- Enum dapat diperluas oleh admin, tetapi UI harus menangani status tak dikenal secara netral.
- `score` bila dipakai hanya untuk transisi internal; pemain melihat label dan alasan, bukan angka.
- Perubahan membutuhkan `reasonPublic`; tanpa alasan, perubahan ditolak.
- Custom input tidak dapat memaksa status tertentu.
- NPC dapat menolak, salah paham, atau bereaksi negatif bila sesuai kepribadian.
- Perubahan hubungan tidak membeli persetujuan lewat paket Paid.
- Dua journey pada world sama memiliki relasi terpisah.

Mapping contoh demo:

- Awal Elysia: `NORMAL`.
- Setelah aksi kabedon yang tidak pantas: `WASPADA`, alasan publik misalnya “Elysia menilai perilakumu melewati batas profesional.”
- Leo tetap `NORMAL` atau menjadi `HANGAT` bila interaksinya positif, tergantung respons committed.

## 5. Visibilitas dan anti-spoiler

| Data | Publik katalog | StoryDetail | JourneyDetail/Log | Tidak boleh keluar |
|---|---|---|---:|---|
| Sinopsis dan genre | Ya | Ya | Ya | — |
| Backstory publik NPC | Tidak | Ya | Ya | — |
| Relasi awal admin | Tidak | Bila diizinkan | Sebagai titik awal seen | Alasan privat |
| Hubungan journey saat ini | Tidak | Tidak | Ya, sampai presented cursor | Efek beat belum dibaca |
| Fakta terungkap | Tidak | Tidak | Ya bila sudah dibaca | Fakta belum dibaca |
| Rahasia admin/NPC | Tidak | Tidak | Tidak | Semua permukaan |
| Prompt/skema internal | Tidak | Tidak | Tidak | Semua permukaan |

## 6. Contoh world demo

World kerja: `w_bosku-mantan`; versi demo `v7`.

Premis publik: protagonis mulai bekerja di perusahaan AAA dan bertemu kembali dengan mantan dari masa kampus yang kini menjadi atasan.

NPC:

- Elysia: atasan langsung, tegas, menjaga batas profesional; menyimpan sejarah personal dengan protagonis.
- Leo: rekan/sahabat yang mengenal keduanya; gaya santai dan menengahi.

Lokasi: luar gedung AAA; interior kantor; ruang rapat kecil.

Relasi awal demo: Elysia–pemain `NORMAL`; Leo–pemain `NORMAL`; Elysia–Leo `DEKAT` sebagai sahabat.

Batasan demo: tidak ada konten seksual eksplisit; konflik ditampilkan melalui dialog dan dinamika kerja.

## 7. Kriteria selesai

- Semua karakter/relasi/lokasi/aset pada contoh memiliki ID dan referensi valid.
- Tidak ada permukaan yang menampilkan secret atau efek belum dibaca.
- Perubahan hubungan selalu memiliki alasan publik.
- Journey lama tetap valid setelah world diperbarui.
- Relasi dua save tidak saling bocor.
