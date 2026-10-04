/**
 * Kamus Bahasa Indonesia — sumber kebenaran untuk seluruh string UI.
 *
 * Aturan (docs/10, NFR-12):
 * - Tidak ada string produk yang ditulis langsung di komponen.
 * - Setiap kunci wajib ada padanannya di en.ts.
 * - Enum mentah dari server tidak boleh ditampilkan apa adanya.
 */

export const id = {
  'app.name': 'fayLN',
  'app.tagline': 'Pilih jalanmu, jalani kisahmu.',

  'common.retry': 'Coba lagi',
  'common.cancel': 'Batal',
  'common.close': 'Tutup',
  'common.back': 'Kembali',
  'common.loading': 'Memuat…',
  'common.reset': 'Atur ulang',
  'common.apply': 'Terapkan',
  'common.seeAll': 'Lihat semua',
  'common.optional': 'opsional',

  'tabs.home': 'Beranda',
  'tabs.journey': 'Perjalanan',
  'tabs.settings': 'Pengaturan',

  'sim.badge': 'SIMULATOR',
  'sim.notice':
    'Mode simulator. Cerita di bawah ini berasal dari contoh bawaan, bukan dari AI sungguhan.',

  'home.title': 'Beranda',
  'home.searchLabel': 'Cari judul cerita',
  'home.searchPlaceholder': 'Cari judul…',
  'home.searchClear': 'Hapus pencarian',
  'home.filterAny': 'Semua genre',
  'home.sectionResume': 'Lanjutkan Bermain',
  'home.sectionUpdated': 'Baru Diperbarui',
  'home.sectionTop': 'Top 10 Minggu Ini',
  'home.sectionNew': 'Terbaru Dirilis',
  'home.rankLabel': 'Peringkat {rank}',
  'home.startsThisWeek': '{count} perjalanan minggu ini',
  'home.sectionAll': 'Semua Cerita',
  'home.resultsTitle': 'Hasil',
  'home.heroStart': 'Mulai',
  'home.heroDotsLabel': 'Dunia {index} dari {total}',
  'home.heroSwipeHint': 'Geser untuk melihat dunia unggulan lain',
  'home.openWorldHint': 'Membuka halaman dunia',
  'home.updatedAt': 'Diperbarui {when}',
  'home.sectionErrorTitle': 'Gagal memuat bagian ini',
  'home.sectionErrorBody': 'Bagian lain di halaman ini tetap bisa dipakai.',
  // Cadangan: hanya dipakai bila titik hero dijadikan kontrol (SC-01.9 keputusan #3).
  'home.heroDotOpen': 'Tampilkan dunia {index}',
  'home.searchToggle': 'Buka atau tutup pencarian',
  'home.searchClose': 'Tutup pencarian',
  'home.tokensLeft': 'Sisa {count} token',
  'home.emptySearchTitle': 'Tidak ada cerita yang cocok',
  'home.emptySearchBody':
    'Coba kata kunci lain, atau atur ulang filter genre yang sedang aktif.',
  'home.emptyCatalogTitle': 'Katalog masih kosong',
  'home.emptyCatalogBody':
    'Belum ada cerita yang diterbitkan. Periksa kembali setelah kurator menambah dunia baru.',
  'home.resumeTitle': 'Lanjutkan perjalanan',
  'home.resumeBody': '{world} • beat {beat}',

  'state.offlineTitle': 'Kamu sedang offline',
  'state.offlineBody':
    'Katalog yang sudah dimuat dan riwayat tersimpan tetap bisa dibaca. Membuat cerita baru butuh koneksi.',
  'state.errorTitle': 'Gagal memuat',
  'state.errorBody': 'Terjadi masalah saat mengambil data. Data yang tersimpan tetap aman.',

  'genre.romance': 'Romansa',
  'genre.drama': 'Drama',
  'genre.office': 'Kehidupan Kantor',
  'genre.fantasy': 'Fantasi',
  'genre.mystery': 'Misteri',

  'world.status.published': 'Terbit',
  'world.status.retired': 'Diarsipkan',
  'world.status.revoked': 'Ditarik',
  'world.status.draft': 'Draf',

  'world.rating.18_plus': 'Dewasa 18+',
  'world.rating.13_plus': 'Remaja 13+',
  'world.rating.all': 'Semua usia',

  'detail.startJourney': 'Mulai Perjalanan',
  'detail.continueJourney': 'Lanjutkan',
  'detail.unavailable': 'Belum dapat dimainkan',
  'detail.retiredNotice':
    'Dunia ini sudah diarsipkan. Perjalanan lama tetap dapat dibaca, tetapi cerita baru tidak bisa dimulai.',
  'detail.synopsisTitle': 'Sinopsis',
  'detail.genresTitle': 'Genre',
  'detail.charactersTitle': 'Karakter',
  'detail.versionLabel': 'Versi dunia {version}',
  'detail.contentNoticeTitle': 'Catatan konten',
  'detail.contentNoticeBody':
    'Cerita ini menyasar pembaca dewasa. Semua tokoh romantis adalah orang dewasa.',

  'npc.relationTitle': 'Hubungan awal',
  'npc.roleLabel': 'Peran',
  'npc.openProfile': 'Buka profil {name}',

  'relation.normal': 'Normal',
  'relation.hangat': 'Hangat',
  'relation.waspada': 'Waspada',
  'relation.tegang': 'Tegang',
  'relation.renggang': 'Renggang',
  'relation.dekat': 'Dekat',
  'relation.sayang': 'Sayang',
  'relation.cinta': 'Cinta',
  'relation.unknown': 'Belum diketahui',

  'journey.title': 'Perjalanan',
  'journey.emptyTitle': 'Belum ada perjalanan',
  'journey.emptyBody':
    'Pilih satu cerita di Beranda, lalu tekan Mulai Perjalanan untuk membuka jalur pertamamu.',
  'journey.emptyAction': 'Cari cerita',
  'journey.lastPlayed': 'Terakhir dimainkan {when}',
  'journey.unreadBadge': 'Belum selesai dibaca',
  'journey.continue': 'Lanjutkan',
  'journey.delete': 'Hapus',
  'journey.deleteLabel': 'Hapus perjalanan {world}',
  'journey.detailTitle': 'Detail perjalanan',
  'journey.progress': 'Beat {beat} • {decisions} keputusan',
  'journey.relationsTitle': 'Hubungan saat ini',
  'journey.notice':
    'Status hubungan hanya menampilkan bagian cerita yang sudah kamu baca.',
  'journey.personaLabel': 'Tokoh: {name}',
  'journey.openDetail': 'Buka detail perjalanan {world}',
  'journey.deleteTitle': 'Hapus perjalanan ini?',
  'journey.deleteBody':
    'Perjalanan "{world}" beserta seluruh riwayat dan hubungannya akan dihapus permanen. Dunia dan perjalanan lain tidak terpengaruh. Tindakan ini tidak dapat dibatalkan.',
  'journey.deleteConfirm': 'Hapus permanen',
  'journey.deleteCancel': 'Batal',
  'journey.deleting': 'Menghapus…',
  'journey.deleted': 'Perjalanan dihapus.',
  'journey.deleteFailed': 'Perjalanan gagal dihapus. Tidak ada yang berubah — coba lagi.',
  'journey.notFound': 'Perjalanan tidak ditemukan.',
  'journey.continueAction': 'Lanjutkan perjalanan {world}',
  'journey.openLog': 'Lihat riwayat',
  'journey.logFailed': 'Riwayat gagal dimuat. Perjalananmu tidak terpengaruh.',

  'plan.title': 'Paket & penggunaan',
  'plan.currentTier': 'Paket aktif',
  'plan.free': 'Free',
  'plan.paid': 'Berbayar',
  'plan.usageTitle': 'Pemakaian hari ini',
  'plan.spent': 'Terpakai',
  'plan.reserved': 'Sedang dipakai',
  'plan.available': 'Sisa',
  'plan.limit': 'Batas',
  'plan.resetAt': 'Diperbarui {time}',
  'plan.estimateNote':
    'Angka di sini adalah perkiraan dari perangkat. Perhitungan resmi dilakukan server.',
  'plan.contextTitle': 'Batas konteks',
  'plan.contextBody':
    'Batas konteks adalah kapasitas satu permintaan, bukan jumlah cerita yang kamu simpan. Cerita lama tetap tersimpan dan bisa kamu baca lagi.',
  'plan.contextFree': '64.000 token',
  'plan.contextPaid': '256.000 token',
  'plan.compactionTitle': 'Peringkasan memori',
  'plan.compactionOn':
    'Aktif. Riwayat lama diringkas menjadi catatan memori agar cerita tidak kehilangan konteks.',
  'plan.compactionOff':
    'Tidak tersedia di paket Free. Riwayat lama keluar dari konteks model, tetapi tetap tersimpan dan bisa kamu baca.',
  'plan.compactionHonest':
    'Peringkasan membantu kesinambungan, tetapi tidak menjamin ingatan yang sempurna. Ringkasan bisa kehilangan detail.',
  'plan.upgradeNotice':
    'Harga dan pembelian belum aktif. Halaman ini hanya menampilkan kontrak paket.',
  'plan.memoryTitle': 'Catatan memori',
  'plan.memoryNone': 'Belum ada catatan memori untuk paket ini.',
  'plan.memoryVersion': 'Versi {version} · {source}',

  'network.title': 'Tidak ada koneksi',
  'network.body':
    'Cerita dihasilkan AI, jadi bermain memerlukan koneksi. Tindakan dan posisi bacamu tetap tersimpan dan tidak hilang.',
  'network.retry': 'Coba lagi',

  'cache.title': 'Cache aset & koneksi',
  'cache.connectionNotice':
    'Bermain memerlukan koneksi karena cerita dihasilkan AI. Tidak ada mode baca offline.',
  'cache.body':
    'Cache hanya mempercepat tampilan gambar. Membersihkannya tidak menghapus perjalanan, riwayat, atau draft.',
  'cache.clear': 'Bersihkan cache aset',
  'cache.cleared': 'Cache aset dibersihkan. Perjalananmu tidak terpengaruh.',
  'cache.unsupported':
    'Perangkat ini tidak menyediakan pembersihan cache. Tidak ada yang berubah.',
  'cache.failed': 'Cache gagal dibersihkan. Tidak ada yang berubah — coba lagi.',
  'cache.confirmTitle': 'Bersihkan cache aset?',
  'cache.confirmBody':
    'Gambar akan dimuat ulang saat dibutuhkan. Perjalanan, riwayat, hubungan, dan draft tidak terpengaruh.',

  'report.title': 'Laporkan masalah',
  'report.intro':
    'Laporan membantu memperbaiki cerita dan aplikasi. Pilih kategori yang paling mendekati.',
  'report.category': 'Kategori',
  'report.category.story': 'Cerita tidak konsisten',
  'report.category.character': 'Tokoh keluar dari kepribadian',
  'report.category.asset': 'Gambar atau aset salah',
  'report.category.relationship': 'Perubahan hubungan tidak masuk akal',
  'report.category.content': 'Konten tidak pantas',
  'report.category.technical': 'Masalah teknis',
  'report.detail': 'Keterangan tambahan',
  'report.detailPlaceholder': 'Ceritakan singkat apa yang terjadi',
  'report.detailOptional': 'opsional',
  'report.privacy':
    'Isi cerita tidak dikirim otomatis. Hanya kategori dan keterangan yang kamu tulis yang dilaporkan.',
  'report.submit': 'Kirim laporan',
  'report.cancel': 'Batal',
  'report.sent': 'Laporan diterima.',
  'report.simulatorNotice':
    'Mode simulator: laporan dicatat secara lokal dan belum dikirim ke server.',
  'report.failed': 'Laporan gagal dikirim. Tidak ada yang berubah — coba lagi.',
  'report.categoryRequired': 'Pilih salah satu kategori lebih dahulu.',

  'settings.title': 'Pengaturan',
  'settings.profile': 'Profil',
  'settings.profileNotice':
    'Nama dan usia ini dipakai sebagai nilai awal saat kamu memulai cerita baru. Perjalanan yang sudah berjalan tidak ikut berubah.',
  'settings.profileIncomplete':
    'Lengkapi nama dan usia supaya kamu tidak perlu mengisinya lagi saat memulai cerita.',
  'settings.saveProfile': 'Simpan profil',
  'settings.profileSaved': 'Profil tersimpan.',
  'settings.name': 'Nama',
  'settings.namePlaceholder': 'Nama yang kamu pakai',
  'settings.age': 'Usia',
  'settings.agePlaceholder': 'Contoh: 24',
  'settings.languageUi': 'Bahasa antarmuka',
  'settings.languageResponse': 'Bahasa respons cerita',
  'settings.languageNotice':
    'Mengganti bahasa antarmuka tidak menerjemahkan cerita lama dan tidak memanggil AI.',
  'settings.responseLanguageNotice':
    'Bahasa respons berlaku untuk cerita yang kamu mulai atau lanjutkan berikutnya, bukan untuk riwayat yang sudah ada.',
  'settings.reading': 'Membaca',
  'settings.textSize': 'Ukuran teks',
  'settings.theme': 'Tema',
  'settings.themeSystem': 'Ikuti sistem',
  'settings.themeLight': 'Terang',
  'settings.themeDark': 'Gelap',
  'settings.plan': 'Paket & penggunaan',
  'settings.planFree': 'Free',
  'settings.planPaid': 'Berbayar',
  'settings.planNotice':
    'Harga dan pembelian belum aktif. Halaman ini hanya menampilkan kontrak paket.',
  'settings.privacy': 'Privasi & data',
  'settings.help': 'Bantuan',
  'settings.about': 'Tentang',
  'settings.aboutBody':
    'fayLN — novel visual dinamis. Versi 0.1.0 (fondasi frontend, mode simulator).',

  'player.tapHint': 'Ketuk sekali untuk menyelesaikan teks, ketuk lagi untuk melanjutkan.',
  'player.tapToContinue': 'Ketuk untuk lanjut',
  'player.optionLabel': 'Pilihan {index}',
  'player.auto': 'Auto',
  'player.autoOn': 'Auto aktif',
  'player.autoOff': 'Auto mati',
  'player.autoStopDecision': 'Auto berhenti karena ada pilihan yang menunggu.',
  'player.autoStopError': 'Auto berhenti karena terjadi gangguan.',
  'player.autoStoppedBackground': 'Auto dijeda karena aplikasi tidak aktif.',
  'player.log': 'Riwayat',
  'player.characters': 'Tokoh',
  'player.pause': 'Jeda',
  'player.composerLabel': 'Tulis tindakan atau dialogmu',
  'player.composerPlaceholder': 'Contoh: aku mendekatinya dan bertanya soal pekerjaan',
  'player.composerHint':
    'Tindakanmu adalah usaha, bukan perintah. Tokoh tetap bisa menolak atau salah paham.',
  'player.send': 'Kirim',
  'player.charactersLeft': '{count} karakter tersisa',
  'player.customTooLong': 'Tindakanmu terlalu panjang. Pendekkan sedikit.',
  'player.waiting': 'Sedang menyusun cerita…',
  'player.waitingHint': 'Kamu bisa membatalkan selama cerita belum selesai disusun.',
  'player.cancel': 'Batalkan',
  'player.decisionWaiting': 'Pilih satu tindakan untuk melanjutkan.',
  'player.noBeatsLeft': 'Tidak ada kelanjutan yang tersimpan.',
  'player.continueHint': 'Ketuk untuk melanjutkan',
  'player.back': 'Kembali ke menu',
  'player.hideUi': 'Sembunyikan UI',
  'player.showUi': 'Tampilkan UI',
  'player.hiddenHint': 'Ketuk di mana saja untuk menampilkan kembali',
  'player.hiddenNotice': 'Tampilan bersih. Cerita dijeda selama UI disembunyikan.',
  'player.leaveTitle': 'Keluar dari cerita?',
  'player.leaveBody':
    'Posisi bacamu tersimpan, jadi kamu bisa melanjutkan nanti. Tidak ada adegan yang hilang.',
  'player.leaveConfirm': 'Keluar',
  'player.leaveCancel': 'Tetap di sini',
  'player.leaveWhileWritingTitle': 'Cerita masih disusun',
  'player.leaveWhileWritingBody':
    'Kalau kamu keluar sekarang, permintaan ini dibatalkan dan adegan yang sedang disusun tidak akan muncul. Kuota yang sudah terpakai tidak kembali.',
  'player.leaveWhileWritingConfirm': 'Tetap keluar',
  'player.leaveWhileWritingCancel': 'Tunggu sebentar',

  'log.title': 'Riwayat',
  'log.close': 'Tutup riwayat',
  'log.narration': 'Narasi',
  'log.unknownSpeaker': 'Tokoh',
  'log.you': 'Kamu',
  'log.empty': 'Belum ada yang tercatat di perjalanan ini.',
  'log.readOnly': 'Riwayat hanya untuk dibaca. Membuka riwayat tidak memakai kuota.',

  'inspector.title': 'Tokoh',
  'inspector.close': 'Tutup daftar tokoh',
  'inspector.relation': 'Hubungan',
  'inspector.traits': 'Sifat',
  'inspector.reason': 'Alasan perubahan',
  'inspector.empty': 'Belum ada tokoh yang muncul di perjalanan ini.',

  'notice.relationChanged': 'Hubungan dengan {name}: {status}',
  'notice.dismiss': 'Tutup pemberitahuan',

  'gateway.retry': 'Coba lagi',
  'gateway.retryHint': 'Percobaan ulang memakai permintaan yang sama, jadi tidak ada biaya ganda.',
  'gateway.rateLimitedTitle': 'Terlalu banyak permintaan',
  'gateway.rateLimitedBody': 'Tunggu {seconds} detik sebelum mencoba lagi.',
  'gateway.abuseTitle': 'Pengiriman dijeda sementara',
  'gateway.abuseBody':
    'Aktivitas yang tidak wajar membuat pengiriman cerita dijeda. Riwayat dan pengaturan tetap bisa dibuka.',
  'gateway.abuseUntil': 'Coba lagi setelah {time}.',
  'gateway.quotaTitle': 'Kuota harian habis',
  'gateway.quotaBody':
    'Kuota akan diperbarui otomatis. Cerita yang sudah kamu baca tetap tersimpan dan bisa dibuka.',
  'gateway.contextTitle': 'Konteks penuh',
  'gateway.contextBody':
    'Percakapan sudah sepanjang batas konteks. Cerita lama tetap tersimpan, tetapi tidak lagi dibaca model.',
  'gateway.modelTitle': 'Mesin cerita tidak tersedia',
  'gateway.modelBody': 'Coba lagi nanti. Progresmu tidak hilang.',
  'gateway.conflictTitle': 'Dibuka di perangkat lain',
  'gateway.conflictBody':
    'Perjalanan ini sedang dibuka di tempat lain. Pilih salinan yang ingin kamu lanjutkan.',
  'gateway.networkTitle': 'Koneksi terputus',
  'gateway.networkBody': 'Cerita belum selesai disusun. Tindakanmu masih tersimpan.',
  'gateway.notFoundTitle': 'Data tidak ditemukan',
  'gateway.notFoundBody':
    'Perjalanan atau cerita ini tidak ada, atau sudah dihapus. Kembali ke daftar untuk melanjutkan yang lain.',
  'gateway.internalTitle': 'Server sedang bermasalah',
  'gateway.internalBody':
    'Ini bukan kesalahanmu. Progresmu tetap tersimpan; coba lagi sebentar lagi.',

  'persona.title': 'Mulai perjalanan',
  'persona.subtitle': 'Tentukan siapa kamu di dalam cerita ini.',
  'persona.saveNotice':
    'Nama dan usia ini akan disimpan di Pengaturan, jadi kamu tidak perlu mengisinya lagi nanti.',
  'persona.nameLabel': 'Nama tokoh',
  'persona.namePlaceholder': 'Nama yang dipakai di cerita',
  'persona.ageLabel': 'Usia tokoh',
  'persona.agePlaceholder': 'Contoh: 24',
  'persona.responseLanguage': 'Bahasa respons cerita',
  'persona.nameError': 'Nama wajib diisi, 1 sampai 30 karakter.',
  'persona.ageError': 'Usia harus berupa angka antara 13 dan 99.',
  'persona.confirm': 'Buat & mulai',
  'persona.cancel': 'Batal',
  'persona.oneActivePerWorld':
    'Kamu sudah punya perjalanan aktif di dunia ini. Lanjutkan perjalanan itu alih-alih membuat yang baru.',
  'persona.startFailed': 'Perjalanan gagal dibuat. Coba lagi sebentar lagi.',

  'storage.persistent': 'Posisi baca tersimpan di perangkat ini.',
  'storage.memoryOnly':
    'Posisi baca hanya tersimpan selama aplikasi terbuka. Penyimpanan permanen menyusul di tahap berikutnya.',
  'storage.profileMemoryOnly':
    'Profil hanya tersimpan selama aplikasi terbuka di perangkat ini. Penyimpanan permanen menyusul di tahap berikutnya.',
} as const;

export type TranslationKey = keyof typeof id;
export type Dictionary = Record<TranslationKey, string>;
