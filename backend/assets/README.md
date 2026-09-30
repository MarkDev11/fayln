# Aset gambar fayLN

Backend menyajikan berkas di sini pada `https://<alamat-aplikasi>/assets/<jenis>/<nama>.png`.

## Struktur

```text
assets/
├── cover/        sampul dunia          768×1024
├── background/   latar adegan          1024×576
└── portrait/     potret karakter       512×768
```

## Konvensi penamaan

Nama berkas **harus sama dengan `asset_id`** di tabel `world_assets`, ditambah akhiran
`.png`. Contoh: `asset_id = p_elysia_netral` → `assets/portrait/p_elysia_netral.png`.

Nama hanya boleh memuat huruf, angka, tanda hubung, dan garis bawah. Akhiran yang
diterima: `.png`, `.jpg`, `.jpeg`, `.webp`. Aturan ini ditegakkan di
`src/routes/assets.ts`, bukan di sini.

## Cara menambah atau mengganti gambar

1. Simpan berkasnya di folder yang sesuai mengikuti nama `asset_id`.
2. Commit dan dorong ke `main`.
3. blitz.cloud membangun ulang dan menayangkan versi baru secara otomatis.

Tidak ada mekanisme unggah. Ini disengaja: gambar berversi bersama kode, tidak
memerlukan folder persisten, dan ikut terlacak di riwayat git.

## Keadaan saat ini — placeholder, bukan karya akhir

Berkas yang ada sekarang adalah **bidang warna datar** yang dibuat otomatis supaya
alur penyajian aset dapat dibuktikan bekerja ujung-ke-ujung. Mereka **bukan** seni
karakter.

Semua placeholder sengaja netral dan tidak memuat wajah atau identitas karakter
mana pun (aturan R-06).

Gantilah satu per satu dengan karya yang sesungguhnya. Tidak ada perubahan kode
yang diperlukan selama nama berkasnya mengikuti `asset_id`.

## Catatan ukuran

18 placeholder saat ini berjumlah ~47 KB. Karya akhir akan jauh lebih besar;
paket gratis blitz.cloud memberi 10 GB penyimpanan, dan image aplikasi saat ini
355 MB tanpa aset.
