/**
 * System prompt untuk mesin cerita.
 *
 * ---------------------------------------------------------------------------
 * INI BUKAN PROMPT TULIS-MENULIS. INI SPESIFIKASI TOOL CALLING.
 * ---------------------------------------------------------------------------
 * Keluarannya dikonsumsi mesin, bukan dibaca manusia. Satu kunci yang salah
 * bentuk membuat seluruh giliran gagal, dan pemain melihat ceritanya berhenti.
 * Karena itu prompt ini lebih banyak berisi BATAS daripada gaya: bentuk keluaran,
 * id yang sah, dan apa yang dilarang.
 *
 * Aturan disusun dari yang paling sering dilanggar ke yang paling jarang:
 *   1. bentuk JSON — pelanggaran paling fatal, langsung menggagalkan giliran;
 *   2. id aset — model cenderung mengarang nama latar yang masuk akal;
 *   3. keputusan wajib — tanpa itu pemain tidak punya jalan untuk melanjutkan;
 *   4. panjang teks — di layar ponsel, lebih dari 25 kata tidak terbaca;
 *   5. KESINAMBUNGAN — model meloncat antar lokasi bila tidak dilarang tegas.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA BAGIAN "DUNGEON MASTER" ADA
 * ---------------------------------------------------------------------------
 * Keluhan pemilik produk: ceritanya "loncat-loncat". Sedang di kantor, tiba-tiba
 * sudah di kafe — tanpa perjalanan, tanpa sebab. Ia membandingkannya dengan
 * dungeon master D&D: dari kota ke desa tidak mungkin dipindahkan begitu saja,
 * harus ada cara berpindah (menyewa kuda, berjalan kaki) dan biasanya ada
 * interaksi dengan seseorang di sepanjang jalan.
 *
 * Aturan 11 yang lama sebenarnya SUDAH melarang mengganti latar dengan santai,
 * tetapi larangan saja tidak cukup: model patuh dengan cara berpindah latar
 * LEBIH JARANG, bukan dengan cara MENJEMBATANI perpindahannya. Yang hilang
 * adalah KEWAJIBAN menuliskan jembatannya. Karena itu aturan lama diganti
 * menjadi kewajiban bertiga langkah: niat → jembatan → tiba.
 *
 * Ini juga yang membuat dunia terasa hidup: tempat dan orang yang ditemui di
 * jalan ikut membangun dunia, bukan hanya latar yang berganti nama.
 */

import type { RelationStatus, ResponseLocale } from '../contracts/types';

/**
 * Satu definisi hubungan sebagaimana ditulis ke prompt.
 *
 * Bentuknya sengaja lebih kecil daripada baris tabelnya: prompt hanya butuh ID
 * untuk ditulis model dan ARTI untuk dipahaminya. Label pemain tidak pernah
 * masuk ke sini — model tidak boleh menuliskan label sebagai status, dan
 * menyediakannya hanya menambah cara untuk salah.
 */
export type PromptRelationDefinition = {
  relationId: string;
  /** Apa keadaan ini berarti bagi tokohnya. */
  meaning: string;
  /**
   * Contoh sikap yang TERLIHAT. Boleh string kosong bila admin tidak mengisinya.
   *
   * Mengapa ini ada di sini: model generik yang hanya diberi nama keadaan
   * ("waspada") menghasilkan perbedaan gaya yang tipis. Yang mengubah cara
   * sebuah adegan terbaca adalah detail konkret — jarak, panjang kalimat, apa
   * yang ditolak dilakukan.
   */
  behaviourHint: string;
};

/** Batas beat dalam satu adegan. Diputuskan pemilik produk: 10. */
export const MAX_SCENE_BEATS = 10;

/** Nama bahasa yang ditulis ke prompt, per locale respons. */
const NAMA_BAHASA: Record<ResponseLocale, string> = {
  'id-ID': 'Bahasa Indonesia',
  'en-US': 'English',
};

/**
 * Pertanyaan penutup cadangan, bila model lupa menuliskan `decision.prompt`.
 *
 * Dulu nilainya ditulis mati dalam bahasa Indonesia, sehingga satu kelalaian
 * model membuat pertanyaan berbahasa Indonesia menyelip di tengah cerita
 * berbahasa Inggris. Terukur di produksi: satu perjalanan `en-US` menghasilkan
 * "How do you respond?" lalu "Apa yang kamu lakukan berikutnya?" — dua bahasa
 * dalam satu perjalanan.
 */
const CADANGAN_PERTANYAAN: Record<ResponseLocale, string> = {
  'id-ID': 'Apa yang kamu lakukan?',
  'en-US': 'What do you do?',
};

export function cadanganPertanyaan(locale?: ResponseLocale): string {
  return CADANGAN_PERTANYAAN[locale ?? 'id-ID'];
}

/** Keadaan hubungan satu tokoh, apa adanya untuk prompt. */
export type PromptRelation = {
  npcId: string;
  name: string;
  status: RelationStatus;
  reasonPublic: string;
};

/** Satu karakter yang boleh dipakai model, beserta ekspresinya. */
export type PromptCharacter = {  npcId: string;
  name: string;
  role: string;
  soul: string;
  publicBackstory: string;
  /**
   * Aset potret bawaan — hanya untuk memenuhi bentuk keluaran.
   *
   * Potret yang DIPAKAI ditentukan sistem dari `expression` (manifes memuat
   * pasangannya). Dulu komentar ini berbunyi "dipakai untuk
   * `showCharacter.assetId`", dan model mematuhinya: ia selalu memakai potret
   * bawaan sehingga gambar tokoh tidak pernah berganti meski ekspresinya
   * berganti.
   */
  defaultPortraitAssetId: string;
  /** Nama ekspresi yang sah untuk karakter ini. */
  expressions: string[];
};

export type StoryPromptInput = {
  worldTitle: string;
  premise: string;
  synopsis: string;
  persona: { name: string; age: number };
  backgrounds: { assetId: string; label: string }[];
  characters: PromptCharacter[];
  /**
   * Ringkasan cerita sejauh ini, atau null pada adegan pertama.
   *
   * Ini yang menjaga cerita tetap nyambung tanpa mengirim seluruh riwayat:
   * konteks yang tumbuh tanpa batas akan jebol di tengah cerita, dan gejalanya
   * bukan galat melainkan model yang melupakan tokohnya sendiri.
   */
  storySoFar: string | null;
  /**
   * Beberapa adegan terakhir apa adanya, untuk kesinambungan gaya dan detail.
   */
  recentBeats: string[];
  /**
   * Keadaan hubungan tiap tokoh SAAT INI, dari perjalanan pemain.
   *
   * Tanpa ini model diminta memutuskan apakah seorang tokoh tersinggung, TANPA
   * diberi tahu bagaimana hubungan mereka sekarang — sehingga `waspada` tidak
   * punya arah: tidak ada yang tahu apakah itu MEMBAIK atau MEMBURUK dari
   * sebelumnya. Ditemukan saat menelusuri keluhan pemilik produk "cek fitur
   * hubungan sudah full fungsional apa belum": ternyata prompt bahkan tidak
   * memuat kosakata status yang sah.
   */
  relations: PromptRelation[];
  /**
   * Kosakata status yang SAH untuk dunia perjalanan ini.
   *
   * Isinya salinan yang dibekukan pada versi dunia, bukan master yang sedang
   * berlaku. Menyunting arti sebuah status di panel karena itu tidak mengubah
   * cara tokoh bersikap di perjalanan yang sudah berjalan.
   *
   * WAJIB — bukan `?`. Daftar bawaan sebagai cadangan akan membuat kelalaian
   * pemanggil tidak terlihat: prompt tetap tersusun, hanya statusnya kembali
   * terbatas pada delapan nilai lama, dan hubungan berhenti berubah tanpa satu
   * pun galat.
   */
  relationVocabulary: PromptRelationDefinition[];
  /** Yang dilakukan pemain pada giliran sebelumnya, bila ada. */
  playerAction: string | null;
  /**
   * Bahasa narasi dan dialog yang dipilih pemain.
   *
   * Sebelumnya bahasa DIPATOK di system prompt ("Write in Indonesian"), dan
   * tidak ada satu pun jalur yang membawa pilihan pemain ke sini. Akibatnya
   * opsi "English" di lembar persona dan di Pengaturan tidak berpengaruh
   * apa pun — kontrol mati.
   */
  responseLocale: ResponseLocale;
};

/**
 * Apakah masukan bebas pemain sebuah UCAPAN atau sebuah TINDAKAN?
 *
 * ---------------------------------------------------------------------------
 * KONVENSI YANG DIPAKAI
 * ---------------------------------------------------------------------------
 *   ketik biasa   -> UCAPAN pemain (kata-katanya)
 *   *di antara bintang* -> TINDAKAN pemain
 *
 * Mengapa perlu dipisah: keduanya diminta ke model dengan cara yang berbeda.
 * Ucapan ditanggapi ISI kata-katanya; tindakan dinarasikan sebagai upaya yang
 * boleh gagal. Menyamakan keduanya membuat pemain yang mengetik "kamu marah" —
 * sebuah kalimat — mendapat narasi tentang tubuhnya sendiri.
 *
 * Bintang hanya dianggap penanda bila mengapit SELURUH masukan. Kalimat seperti
 * "aku bilang *diam* lalu pergi" mengandung bintang di tengah, dan menebak
 * maksudnya hanya akan menambah cara untuk salah; masukan seperti itu
 * diperlakukan sebagai ucapan apa adanya, dan model tetap melihat bintangnya.
 */
export function jenisAksiPemain(teks: string): { jenis: 'ucapan' | 'tindakan'; isi: string } {
  const bersih = teks.trim();
  if (bersih.length >= 2 && bersih.startsWith('*') && bersih.endsWith('*')) {
    const isi = bersih.slice(1, -1).trim();
    // `**` atau `*  *` bukan tindakan: tidak ada isinya.
    if (isi.length > 0) {
      return { jenis: 'tindakan', isi };
    }
  }
  return { jenis: 'ucapan', isi: bersih };
}

/**
 * Menyusun pesan pengguna: seluruh kanun yang dibutuhkan model untuk SATU adegan.
 *
 * Daftar aset ditulis lengkap dan bernomor karena di sinilah model paling sering
 * salah — ia cenderung mengarang nama latar yang terdengar masuk akal. Melihat
 * daftar tertutup membuat mengarang menjadi jelas melanggar, bukan sekadar
 * kurang tepat.
 */
export function buildStoryUserPrompt(input: StoryPromptInput): string {
  /*
   * Kosakata wajib ADA — bukan wajib berisi.
   *
   * Dua keadaan yang berbeda dan tidak boleh diperlakukan sama:
   *
   *   - `undefined` = pemanggil lupa mengisinya. Itu cacat pemrograman, dan
   *     membiarkannya lewat berarti prompt tetap tersusun dengan daftar kosong
   *     sehingga seluruh perubahan hubungan dibuang tanpa satu pun galat.
   *   - `[]` = dunia yang memang tidak punya status sah. Itu keadaan yang sah
   *     (seluruh definisi dinonaktifkan dan tidak ada karakter yang memakainya),
   *     dan mesin cerita harus tetap berjalan.
   */
  if (!Array.isArray(input.relationVocabulary)) {
    throw new Error('buildStoryUserPrompt: relationVocabulary wajib diisi pemanggil.');
  }

  const bagian: string[] = [];

  bagian.push(`DUNIA: ${input.worldTitle}`);
  bagian.push('');
  bagian.push('PREMIS — situasinya, bukan naskahnya:');
  bagian.push(input.premise.trim());
  bagian.push('');
  bagian.push('SINOPSIS:');
  bagian.push(input.synopsis.trim());
  bagian.push('');
  bagian.push(`PEMAIN: ${input.persona.name}, ${String(input.persona.age)} tahun.`);
  bagian.push('');
  /*
   * Bahasa ditulis di USER prompt, bukan hanya di system prompt.
   *
   * Aturan 32 di system prompt dulu berbunyi mati "Write in Indonesian",
   * sehingga pilihan pemain tidak mungkin berpengaruh. Sekarang keduanya
   * mengikuti `responseLocale`; baris ini yang membuatnya tegas per permintaan.
   */
  bagian.push(`BAHASA CERITA: ${NAMA_BAHASA[input.responseLocale]}.`);
  bagian.push(
    'Tulis SELURUH narasi dan dialog dalam bahasa itu. Kunci JSON dan nama field',
  );
  bagian.push('tetap bahasa Inggris — hanya ISI ceritanya yang memakai bahasa itu.');
  bagian.push('');

  bagian.push('LATAR YANG TERSEDIA — hanya assetId ini yang sah:');
  if (input.backgrounds.length === 0) {
    bagian.push('  (tidak ada)');
  } else {
    for (const item of input.backgrounds) {
      bagian.push(`  ${item.assetId} — ${item.label}`);
    }
  }
  /*
   * Larangan menyebut TEMPAT yang tidak ada latarnya, diletakkan tepat di
   * sebelah daftarnya.
   *
   * Terukur di produksi: model menawarkan "Ikuti dia ke ruang rapat" padahal
   * daftar 22 latar dunia itu tidak memuat ruang rapat sama sekali. Karena tidak
   * ada latar yang cocok, `setBackground` ke tujuan tidak mungkin keluar dan
   * latar tidak pernah berpindah — model menjanjikan tempat yang tidak dapat
   * ditampilkan. Aturan serupa di bagian TUGAS tidak cukup; yang ini menempel
   * langsung pada datanya.
   */
  bagian.push('');
  bagian.push('PENTING: hanya tempat di daftar itu yang BENAR-BENAR ADA. Jangan');
  bagian.push('menyebut ruangan atau tempat lain — termasuk di dalam label opsi');
  bagian.push('pilihan. Bila ceritanya terasa butuh tempat yang tidak ada di daftar,');
  bagian.push('tetap di tempat sekarang dan tulis kejadiannya di situ.');
  bagian.push('');

  bagian.push('KARAKTER — hanya npcId ini yang sah:');
  if (input.characters.length === 0) {
    bagian.push('  (tidak ada)');
  } else {
    for (const orang of input.characters) {
      bagian.push(`  npcId: ${orang.npcId}`);
      bagian.push(`    nama: ${orang.name}`);
      if (orang.role.trim().length > 0) {
        bagian.push(`    peran: ${orang.role}`);
      }
      if (orang.soul.trim().length > 0) {
        bagian.push(`    jiwa: ${orang.soul}`);
      }
      if (orang.publicBackstory.trim().length > 0) {
        bagian.push(`    latar: ${orang.publicBackstory}`);
      }
      /*
       * Yang ditulis hanya potret BAWAAN, sebagai pengisi bentuk keluaran.
       * Pasangan ekspresi -> potret TIDAK ditulis ke prompt: pasangan itu sudah
       * ada di manifes, dan sistem yang memilih. Menuliskan 20 pasangan per
       * karakter hanya menambah panjang prompt tanpa menambah kemampuan model —
       * yang perlu ia putuskan adalah MAKNA-nya (ekspresi mana), bukan berkasnya.
       */
      bagian.push(`    potret bawaan (pengisi assetId): ${orang.defaultPortraitAssetId}`);
      /*
       * Setiap ekspresi ditulis di BARISNYA SENDIRI dan dikutip.
       *
       * Sebelumnya daftarnya digabung dengan koma:
       *   `ekspresi yang sah: ${expressions.join(', ')}`
       * Itu tidak dapat dibaca ketika nama ekspresinya SENDIRI mengandung koma,
       * dan itulah bentuk yang dihasilkan panel admin — misalnya
       * "senyum, pakaian kantor, mengangkat tangan". Model tidak punya cara
       * mengetahui di mana satu ekspresi berakhir dan yang berikutnya dimulai,
       * sehingga ia menulis bentuk pendek ("senyum"). Validator menuntut
       * kecocokan PERSIS, adegan pun ditolak, dan seluruh giliran jatuh ke
       * simulator — yang keluarannya sama terus. Gejalanya di layar: cerita
       * seperti berulang.
       */
      if (orang.expressions.length > 0) {
        bagian.push('    ekspresi yang sah — SALIN PERSIS salah satu baris berikut, apa adanya:');
        for (const ekspresi of orang.expressions) {
          bagian.push(`      "${ekspresi}"`);
        }
      } else {
        bagian.push('    ekspresi yang sah: (tidak ada)');
      }
    }
  }
  bagian.push('');

  if (input.storySoFar) {
    bagian.push('RINGKASAN CERITA SEJAUH INI:');
    bagian.push(input.storySoFar.trim());
    bagian.push('');
  }

  if (input.recentBeats.length > 0) {
    bagian.push('BEBERAPA BEAT TERAKHIR, apa adanya:');
    for (const beat of input.recentBeats) {
      bagian.push(`  ${beat}`);
    }
    bagian.push('');
  }

  /*
   * ---------------------------------------------------------------------------
   * HUBUNGAN SAAT INI — keadaan, bukan hiasan
   * ---------------------------------------------------------------------------
   * Sampai sekarang prompt TIDAK PERNAH memuat bagian ini: tidak ada keadaan
   * hubungan, dan tidak ada daftar status yang sah. Model diminta memutuskan
   * apakah seorang tokoh tersinggung atau menyukai tindakan pemain, tanpa tahu
   * bagaimana hubungan mereka sekarang — dan tanpa tahu kata apa yang boleh
   * dipakai. Nilai `status` yang ditulisnya pun lolos tanpa diperiksa.
   *
   * Akibatnya fitur hubungan tidak berfungsi: model menebak, menebakannya
   * tersimpan sebagai nilai yang tidak dikenal, dan di layar pemain statusnya
   * tampil "Belum diketahui".
   *
   * Bagian ini memberi model DUA hal yang sebelumnya tidak ada: keadaan sekarang
   * per tokoh, dan kosakata tertutup beserta artinya. Yang menentukan MAKNA tetap
   * model; yang menentukan NILAI yang sah adalah sistem.
   */
  bagian.push('HUBUNGAN SAAT INI — inilah keadaan yang sebenarnya berlaku:');
  if (input.relations.length === 0) {
    bagian.push('  (belum ada tokoh yang berhubungan dengan pemain)');
  } else {
    for (const relation of input.relations) {
      const alasan = relation.reasonPublic.trim();
      bagian.push(
        `  ${relation.npcId} (${relation.name}): "${relation.status}"` +
          (alasan.length > 0 ? ` — sejak itu: ${alasan}` : ''),
      );
    }
  }
  bagian.push('');
  /*
   * Kosakata status datang dari KOSAKATA DUNIA, bukan dari daftar di dalam kode.
   *
   * Daftar yang ditulis di sini dulu adalah delapan nilai harfiah. Ia cocok
   * dengan basis data pada hari ia ditulis, lalu berhenti cocok begitu admin
   * menambah status kesembilan lewat panel: model tetap diberi tahu delapan
   * nilai lama, menulis salah satunya, dan perubahan yang sebenarnya dimaksud
   * hilang tanpa satu pun galat.
   */
  bagian.push('Nilai "status" yang SAH untuk dunia ini — tidak ada nilai lain:');
  if (input.relationVocabulary.length === 0) {
    /*
     * Dunia tanpa satu pun status sah. Mesin cerita tetap harus berjalan, tetapi
     * meminta model menulis perubahan hubungan di sini hanya menghasilkan nilai
     * yang pasti dibuang. Lebih baik dilarang secara terbuka daripada dibuang
     * diam-diam.
     */
    bagian.push('  (tidak ada) — JANGAN menulis "relationshipDelta" di dunia ini.');
  } else {
    for (const definisi of input.relationVocabulary) {
      bagian.push(`  "${definisi.relationId}" = ${definisi.meaning.trim()}`);
      const contoh = (definisi.behaviourHint ?? '').trim();
      if (contoh.length > 0) {
        // Contoh sikap ditulis di barisnya sendiri supaya terbaca sebagai
        // petunjuk pemeranan, bukan sebagai lanjutan definisinya.
        bagian.push(`      terlihat sebagai: ${contoh}`);
      }
    }
  }
  bagian.push('');

  /*
   * ---------------------------------------------------------------------------
   * HUBUNGAN HARUS TERLIHAT, BUKAN HANYA TERCATAT
   * ---------------------------------------------------------------------------
   * Sebelum bagian ini ada, seluruh instruksi tentang hubungan hanya berbunyi
   * "tulis relationshipDelta bila perasaan tokoh berubah". Model mematuhinya —
   * statusnya berubah, tercatat, tampil di layar — tetapi TIDAK ADA satu pun
   * kalimat yang menyuruh tokoh BERSIKAP berbeda karenanya.
   *
   * Akibatnya hubungan menjadi angka yang bergerak dan tidak mengubah apa pun:
   * tokoh yang "waspada" tetap bicara sehangat sebelumnya, dan pemain tidak
   * merasakan akibat keputusannya. Itu yang membuat fitur ini terasa mati
   * walaupun datanya benar.
   *
   * Aturan di bawah membalik urutannya: sikapnya yang utama, catatannya yang
   * menyusul. "Tunjukkan, jangan umumkan" — status adalah ringkasan bagi pemain,
   * bukan naskah yang dibacakan tokoh.
   */
  bagian.push('BAGAIMANA HUBUNGAN ITU HARUS TERLIHAT:');
  /*
   * Contohnya sengaja TIDAK menyebut id tertentu.
   *
   * Bentuk sebelumnya menulis "waspada menjaga jarak, dekat mencari alasan untuk
   * bicara". Itu benar selama daftarnya tetap delapan nilai bawaan. Begitu admin
   * menambah atau mengganti statusnya, contoh itu menunjuk nilai yang tidak ada
   * lagi di daftar di atas — dan model menerima dua daftar yang saling
   * bertentangan, lalu memilih yang mana saja.
   */
  bagian.push('  f. Setiap tokoh bersikap sesuai statusnya SEKARANG, menurut arti yang');
  bagian.push('     tertulis di daftar di atas. Sikapnya harus berbeda antara satu status');
  bagian.push('     dan status lainnya — jarak bicara, panjang jawaban, apa yang ia mau');
  bagian.push('     bagikan, dan apakah ia mencari atau menghindari pemain.');
  bagian.push('  g. Perubahan hubungan harus TERASA pada adegan-adegan berikutnya, bukan');
  bagian.push('     hanya tercatat. Pembaca harus dapat menebak statusnya dari cara');
  bagian.push('     tokoh itu bicara dan apa yang ia lakukan atau menolak lakukan.');
  bagian.push('  h. JANGAN mengumumkan statusnya. Tidak ada tokoh yang menyebut nama');
  bagian.push('     statusnya sendiri. Tunjukkan lewat sikap, pilihan kata, dan jarak');
  bagian.push('     fisik. Status adalah ringkasan bagi pemain, bukan dialog.');
  bagian.push('  i. Hubungan yang sudah berubah TIDAK kembali sendiri tanpa sebab.');
  bagian.push('     Jangan memulihkannya hanya karena adegan baru dimulai.');
  /*
   * Perubahan BERTAHAP.
   *
   * Tanpa aturan ini, satu adegan dapat melompat dari status paling jauh ke
   * status paling dekat. Tokohnya lalu tampak tidak punya pendirian: kemarin
   * menghindari pemain, hari ini mencintainya, tanpa adegan yang menjelaskan
   * perpindahannya. Perubahan yang besar harus mendapat beberapa adegan, bukan
   * satu.
   *
   * Aturannya sengaja TIDAK menyebut "satu tingkat", karena daftar statusnya
   * dibuat admin dan bukan tangga bernomor — tidak ada urutan yang dapat
   * dipakai untuk menghitung tingkat. Yang dapat diminta hanyalah sifatnya:
   * bertahap, dan beralasan.
   */
  bagian.push('  j. Perubahan hubungan BERTAHAP. Jangan melompat dari satu ujung ke');
  bagian.push('     ujung lain dalam satu adegan. Perubahan besar terjadi lewat');
  bagian.push('     beberapa adegan, masing-masing dengan sebab yang terlihat.');
  bagian.push('');

  bagian.push('Aturan hubungan:');
  bagian.push('  a. Tulis "relationshipDelta" HANYA bila tindakan pemain benar-benar');
  bagian.push('     mengubah perasaan seorang tokoh. Bukan setiap adegan, dan bukan');
  bagian.push('     sebagai hiasan.');
  bagian.push('  b. "status" harus salah satu dari daftar di atas, ditulis PERSIS.');
  bagian.push('  c. "status" adalah keadaan BARU, bukan selisihnya. Bila hubungan');
  bagian.push('     sekarang "normal" dan tokoh menjadi tersinggung, tulis "waspada"');
  bagian.push('     atau "tegang" — jangan "normal" lagi.');
  bagian.push('  d. "reasonPublic" wajib: satu kalimat yang boleh dibaca pemain dan');
  bagian.push('     menjelaskan MENGAPA perasaannya berubah. Jangan membocorkan apa');
  bagian.push('     pun yang tidak pemain ketahui.');
  bagian.push('  e. Jangan menulis dua "relationshipDelta" untuk tokoh yang sama dalam');
  bagian.push('     satu adegan — pakai keadaan AKHIRnya.');
  bagian.push('');

  bagian.push('TUGAS:');
  if (input.playerAction) {
    const aksi = jenisAksiPemain(input.playerAction);
    if (aksi.jenis === 'ucapan') {
      /*
       * KETIKA PEMAIN MENULIS BIASA, ITU UCAPANNYA.
       *
       * Sebelum ini seluruh masukan bebas ditulis ke prompt sebagai
       * "Pemain memilih/melakukan: ...", sehingga kalimat yang jelas-jelas
       * diucapkan diperlakukan sebagai tindakan fisik. Terukur pada pemilik
       * produk: ia mengetik "kamu marah" — sebuah ucapan — dan jawabannya
       * menarasikan tubuhnya ("wajah memerah, tangan mengepal") alih-alih
       * menanggapi kata-katanya.
       */
      bagian.push(`Pemain MENGUCAPKAN kata-kata ini (ucapan, BUKAN tindakan fisik):`);
      bagian.push(`  "${aksi.isi}"`);
      bagian.push('');
      bagian.push('Perlakukan itu sebagai KALIMAT YANG DIUCAPKAN pemain. Tokoh di');
      bagian.push('adegan ini MENDENGARNYA dan menanggapi ISI kata-katanya. JANGAN');
      bagian.push('menarasikan tubuh pemain seolah ia baru melakukan sesuatu — pemain');
      bagian.push('hanya berbicara. Bila perlu, kata-katanya boleh dikutip kembali.');
    } else {
      bagian.push(`Pemain MENCOBA tindakan ini (tindakan, BUKAN ucapan): ${aksi.isi}`);
      bagian.push('');
      bagian.push('Perlakukan itu sebagai UPAYA, bukan perintah yang berhasil. Narasikan');
      bagian.push('apa yang pemain lakukan dan bagaimana hasilnya. Tokoh boleh menolak,');
      bagian.push('salah paham, atau bereaksi tak terduga. JANGAN memperlakukannya sebagai');
      bagian.push('kalimat yang diucapkan pemain.');
    }
    bagian.push('Lanjutkan cerita dari situ, lalu akhiri dengan keputusan baru.');
    bagian.push('');
    bagian.push('Periksa dulu: apakah tindakan itu MEMINDAHKAN pemain ke tempat lain?');
    bagian.push('Bila ya, jangan langsung mengganti latar. Tulis niatnya, tulis');
    bagian.push('perjalanannya sebagai satu beat tersendiri, baru kemudian tiba.');
    bagian.push('Perjalanan itu bagian dari cerita — bukan pengisi waktu.');
    bagian.push('');
    /*
     * Kedatangan WAJIB, bukan pilihan.
     *
     * Tanpa aturan ini model menulis niat dan perjalanannya, lalu menutup adegan
     * sebelum tiba. Narasinya sudah berpindah ("mengikuti ke ruang rapat",
     * "lorong kantor sunyi") tetapi `setBackground` ke tujuan tidak pernah
     * keluar, sehingga gambar tetap di latar lama. Terukur di produksi: enam
     * putaran berturut-turut seluruhnya di satu latar, meski pemain memilih
     * "Ikuti dia ke ruang rapat" pada putaran pertama.
     */
    bagian.push('WAJIB: adegan ini harus SELESAI SAMPAI TUJUAN. Bila pemain');
    bagian.push('berpindah tempat, keluarkan `setBackground` ke latar TUJUAN di');
    bagian.push('adegan yang sama, sebelum keputusan penutup. Adegan yang berhenti');
    bagian.push('di tengah perjalanan meninggalkan pemain di latar lama, dan');
    bagian.push('gambarnya tidak akan pernah menyusul ceritanya.');
    bagian.push('');
    /*
     * Tujuan harus PUNYA latar.
     *
     * Terukur di produksi: model menawarkan "Ikuti dia ke ruang rapat" pada
     * putaran pertama, tetapi daftar latar dunia itu tidak memuat ruang rapat
     * sama sekali. Karena tidak ada latar yang cocok, `setBackground` ke tujuan
     * tidak mungkin keluar — dan latar pun tidak pernah berpindah sepanjang
     * enam putaran. Model menjanjikan tempat yang tidak dapat ditampilkan.
     */
    bagian.push('Jangan menawarkan atau menulis perpindahan ke tempat yang TIDAK');
    bagian.push('ADA latarnya di daftar di atas. Sebut nama tempat hanya bila salah');
    bagian.push('satu label di daftar itu memang tempat tersebut.');
  } else {
    bagian.push('Tulis ADEGAN PEMBUKA.');
    bagian.push('Mulai dari situasinya, perkenalkan siapa yang ada di sana, lalu akhiri');
    bagian.push('dengan keputusan pertama yang membuat pemain bergerak.');
    bagian.push('');
    bagian.push('Ini kesan pertama pemain terhadap dunia ini. Buat tempatnya terasa');
    bagian.push('nyata: apa yang terlihat, terdengar, dan sedang terjadi di sana.');
    bagian.push('Jangan hanya menamai ruangan.');
  }
  bagian.push('');
  bagian.push(
    `Ingat: maksimum ${String(MAX_SCENE_BEATS)} beat, setiap teks antara ` +
      `${String(MIN_BEAT_WORDS)} sampai ${String(MAX_BEAT_WORDS)} kata, ` +
      'dan scene WAJIB berakhir dengan keputusan berisi tepat tiga opsi.',
  );
  if (input.storySoFar || input.recentBeats.length > 0) {
    bagian.push(
      'Jangan mengulang adegan yang sudah terjadi, dan jangan meloncat ke tempat ' +
        'baru tanpa menjembataninya.',
    );
  }

  return bagian.join('\n');
}


/**
 * Panjang teks satu beat, dalam kata.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA ADA LANTAINYA, BUKAN HANYA PLAFON
 * ---------------------------------------------------------------------------
 * Prompt lama hanya menyebut batas ATAS ("di bawah 25 kata") tanpa batas bawah.
 * Model mematuhinya secara harfiah: ia menulis sependek mungkin. Terukur pada
 * pemilik produk, beat-nya berbunyi "Lupakan.", "Apa?!", "Jari gemetar di meja
 * kayu." — penggalan yang tidak memberi pemain cukup untuk membayangkan apa
 * yang sedang terjadi, sehingga ia mengaku tidak paham maksudnya.
 *
 * Batas 25 kata itu JATAH, bukan langit-langit yang harus dijauhi. Karena itu
 * lantainya diletakkan dekat plafonnya: beat yang baik memakai hampir seluruh
 * jatahnya, dan penggalan tiga kata berarti satu beat terbuang.
 */
export const MAX_BEAT_WORDS = 25;

/**
 * Lantai panjang beat.
 *
 * Dipilih dekat plafon dengan sengaja: memberi tahu model "jangan terlalu
 * pendek" tanpa angka hanya menghasilkan penggalan yang sedikit lebih panjang.
 * Angka yang dekat dengan batas atas membuat jatah itu benar-benar terpakai.
 */
export const MIN_BEAT_WORDS = 15;

export const STORY_SYSTEM_PROMPT = [
  'You are the story engine of an interactive visual novel. You direct the scene,',
  'write the narration, and voice every character.',
  '',
  'You do NOT write to a human reader. You return DATA that a program will render.',
  'Getting the shape wrong stops the story, so the FORMAT rules matter more than',
  'any style choice.',
  '',
  '=============================================================',
  'OUTPUT FORMAT — this is the part you must not get wrong',
  '=============================================================',
  '',
  'Reply with ONE JSON object and nothing else. No markdown, no code fences, no',
  'commentary before or after it.',
  '',
  '{',
  '  "beats": [ <event>, <event>, ... ],',
  '  "decision": {',
  '    "prompt": "<the question the player must answer>",',
  '    "options": [',
  '      { "optionId": "opt1", "label": "<short action>", "description": "<what it means>" },',
  '      { "optionId": "opt2", "label": "...", "description": "..." },',
  '      { "optionId": "opt3", "label": "...", "description": "..." }',
  '    ]',
  '  }',
  '}',
  '',
  'Each <event> is EXACTLY one of these six shapes. No other keys, no nesting:',
  '',
  '  { "type": "setBackground", "assetId": "<id from the background list>" }',
  '  { "type": "showCharacter", "npcId": "<id>", "expression": "<id>", "assetId": "<portrait asset id>" }',
  '  { "type": "hideCharacter", "npcId": "<id>" }',
  '  { "type": "narrate", "text": "<narration>" }',
  '  { "type": "say", "npcId": "<id>", "text": "<what the character says>" }',
  '  { "type": "relationshipDelta", "npcId": "<id>", "status": "<status>", "reasonPublic": "<why>" }',
  '',
  '=============================================================',
  'SCENE RULES',
  '=============================================================',
  '',
  `1. MAXIMUM ${String(MAX_SCENE_BEATS)} events in "beats". Fewer is fine. More is a failure.`,
  '2. The scene ALWAYS ends with a decision. The player must always have a way',
  '   forward — a scene without one strands them.',
  '3. The first beat MUST be setBackground, so the player sees where they are.',
  '4. Show a character before they speak. A voice with no face is confusing.',
  `5. Every "text" must be ${String(MIN_BEAT_WORDS)} to ${String(MAX_BEAT_WORDS)} words, and you`,
  '   should aim for the TOP of that range, not the bottom. That budget is there',
  '   to be used. A beat of three words ("Lupakan.") is a wasted beat: the player',
  '   has nothing to picture and does not understand what just happened.',
  '   Write one or two COMPLETE sentences carrying something concrete — a place, a',
  '   gesture, a tone of voice, an object, what someone is doing with their hands.',
  '   A fragment is only acceptable when it is a deliberate beat of impact, and',
  '   never more than once in a scene. This is read on a phone, so a long block is',
  '   unreadable no matter how good the prose is — but a stub is worse.',
  /*
   * Dulu berbunyi "OPTIONAL and rare".
   *
   * Kata "rare" membuat model MENAHAN DIRI dari hal yang justru menjadi inti
   * fitur ini: hubungan yang bergerak karena keputusan pemain. Terukur dari
   * perilakunya: status hampir tidak pernah berubah, sehingga pemain tidak
   * pernah melihat fiturnya bekerja — dan itu terbaca sebagai fitur mati,
   * bukan sebagai fitur yang jarang dipakai.
   *
   * Yang dijaga tetap sama: JANGAN mengarang perubahan yang tidak terjadi.
   * Yang berubah hanya nada — dari "jangan sering-sering" menjadi "lakukan bila
   * memang terjadi".
   */
  '6. Write "relationshipDelta" WHENEVER the player\'s action genuinely changed how',
  '   someone feels about them — that is this feature working, not noise. Equally',
  '   important: NEVER invent a change that did not happen. And once a relationship',
  '   has changed, it MUST show in how that character behaves from then on; see the',
  '   relationship section of the brief.',
  '',
  '=============================================================',
  'USING THE ASSETS — use them, do not invent them',
  '=============================================================',
  '',
  'You are given a list of backgrounds, characters, and each character\'s',
  'expressions. These are the ONLY valid ids.',
  '',
  '7. "assetId" for a background MUST be copied exactly from the background list.',
  '   Never describe a place and hope it exists. If nothing fits, pick the closest',
  '   one from the list — the list is the whole world.',
  '8. "npcId" MUST be copied exactly from the character list. Never invent a',
  '   character, and never give a character a name of your own.',
  '9. "expression" MUST be one of THAT character\'s expressions. Do not use one',
  '   character\'s expression for another.',
  '10. For showCharacter, what matters is "expression" — CHOOSE the one that fits',
  '    what is happening right now; it changes how the character looks. The system',
  '    picks the matching portrait from that expression, so "assetId" may simply',
  '    repeat the default portrait given for that character.',
  '11. Reuse the same background while the scene stays in one place. Changing the',
  '    background means the characters MOVED — do not do it casually. If the scene',
  '    does move, you MUST bridge it (see MOVING THROUGH THE WORLD below).',
  '',
  /*
   * ---------------------------------------------------------------------------
   * MENGAPA BAGIAN "KEEPING THE STAGE IN SYNC WITH THE STORY" ADA
   * ---------------------------------------------------------------------------
   * Keluhan pemilik produk, dua-duanya dari layar yang sama:
   *
   *   1. Narasinya sudah menulis "Rina pergi", tetapi potret Rina TETAP di layar
   *      sepanjang adegan — seolah ia masih ada di ruangan itu.
   *   2. Narasinya menulis "tatapan sinis", tetapi potretnya masih memakai
   *      senyum dari awal adegan.
   *
   * Akarnya sama dan ada di sini: `showCharacter`/`hideCharacter` hanya
   * didefinisikan sebagai BENTUK keluaran (di daftar bentuk di atas), dan aturan
   * 10 hanya menyuruh MEMILIH ekspresi. Tidak ada satu pun aturan yang MEWAJIBKAN
   * peristiwa visual keluar ketika narasinya sendiri sudah berubah. Model patuh
   * pada bentuk, lalu berhenti di situ: prosa bergerak, lapisan visual tidak.
   *
   * Aturan di bawah membalik urutannya — narasi yang berubah WAJIB disertai
   * peristiwa yang menampilkannya. Sengaja TIDAK menyebut id ekspresi mana pun
   * dan TIDAK mengandaikan urutan: daftar ekspresi ditulis admin, bebas teks,
   * dan bukan tangga bernomor. Yang dapat diminta hanyalah sifatnya: bila
   * gambaran seorang tokoh berubah, tampilannya harus ikut berubah.
   */
  '=============================================================',
  'KEEPING THE STAGE IN SYNC WITH THE STORY',
  '=============================================================',
  '',
  '12. The narration and the visible stage must NEVER disagree. Whenever your own',
  '    prose says the stage changed, the SAME scene must carry the event that',
  '    changes it. Writing the change and omitting the event leaves a stale',
  '    picture on screen while the words move on — the story says one thing and',
  '    the screen shows another.',
  '13. If a character LEAVES, exits, or is no longer present — named or',
  '    described — the scene MUST emit hideCharacter for that character. "Rina',
  '    pergi" without a hideCharacter leaves her portrait standing in a room she',
  '    has left.',
  '14. If a character who is NOT currently on stage appears, enters, arrives, or',
  '    speaks, the scene MUST emit showCharacter for them before (or at) their',
  '    first line. This includes a character who left earlier and now returns.',
  '15. If your prose describes a CHANGE in how a character looks, feels, or',
  '    holds themselves, the scene MUST emit showCharacter again for that',
  '    character, with an expression chosen from THAT character\'s own list. The',
  '    expression you choose MUST differ from the one currently on stage WHEN',
  '    the description genuinely differs — do not write that the face changed and',
  '    then re-show the same one. Choose by MEANING (what this moment is doing),',
  '    never by order or position: the expressions are authored labels, not a',
  '    ladder, and there is no "next" expression.',
  '',
  '=============================================================',
  'MOVING THROUGH THE WORLD — you are a dungeon master, not a fast-travel menu',
  '=============================================================',
  '',
  'This is the rule most often broken, and the one that matters most to the',
  'player. You do NOT teleport. Going from the office to a cafe is not a change of',
  'background — it is a JOURNEY, and the journey is part of the story.',
  '',
  'A scene may only change location if THIS scene shows the bridge, in order:',
  '',
  '  (a) INTENT — the player decides to go, or an event forces the move. The',
  '      decision the player just made is usually this. State the intent plainly',
  '      before anyone moves.',
  '  (b) BRIDGE — at least one beat of actually getting there: walking, driving,',
  '      waiting, taking a lift, crossing a road. Something must happen in',
  '      between, even if it is small.',
  '  (c) ARRIVAL — only then setBackground. The new place is seen for the first',
  '      time through the player\'s eyes.',
  '',
  '23. NEVER set a new background in the beat immediately after the player chose',
  '    to go somewhere. That is a teleport, and it is the single most jarring',
  '    thing you can do. The bridge beat in between is mandatory.',
  '24. The bridge should carry WORLD BUILDING, not filler. Use it to show what',
  '    this world is like: the streets, the weather, a queue, a sign, a smell, an',
  '    overheard line. Two sentences of real place are worth more than a paragraph',
  '    of "you walk for a while".',
  '25. A bridge is the natural place for a MINOR ENCOUNTER: someone asks the way,',
  '    a colleague catches up, a stranger is rude, a child stares. Keep it brief',
  '    and let it colour the world. Do NOT use a bridge to introduce a character',
  '    from the character list who has nothing to do with this scene.',
  '26. If the player asks to go somewhere that is not in the background list, do',
  '    NOT jump to the closest one. Write the bridge first and let them get part',
  '    of the way — you may stop at the decision before they arrive. The list is',
  '    the whole world, and some destinations are simply not drawn yet.',
  '',
  '=============================================================',
  'BEING A DUNGEON MASTER',
  '=============================================================',
  '',
  'You run a living world. The player is one person inside it, not the centre of',
  'it. That means:',
  '',
  '27. The world moves on its own. Give the place a mood, a time of day, a small',
  '    ongoing event. A room where nothing at all is happening feels dead.',
  '28. Characters want things. Give them a reason to be in this scene that is not',
  '    "to talk to @user". Someone can be busy, irritated, late, distracted.',
  '29. Consequences persist. If something happened earlier — a promise, a lie, an',
  '    injury, a favour — let it still matter now. The story summary is there so',
  '    you do not forget; use it.',
  '30. Do not resolve too fast. A scene that ends every thread immediately leaves',
  '    the player with nothing to wonder about. Leave tension standing.',
  '31. The player\'s choices must change what happens next, visibly. If two',
  '    different choices lead to the same scene, the choice was decoration.',
  '',
  '=============================================================',
  'WRITING THE STORY',
  '=============================================================',
  '',
  '32. Write in Indonesian, second person, addressing the player as @user.',
  '33. @user is the NAME OF THE PLAYER. Write it EXACTLY as "@user" — never',
  '    replace it with a name, never with "kamu", never with "you". The system',
  '    substitutes the real name when the story runs.',
  '34. "@" followed by a name is another character in this world. Write those',
  '    tokens exactly as given. They stay valid even if that character has not',
  '    been created yet — treat them as an NPC of this world and keep writing.',
  '35. Characters speak with the personality given in their soul. A quiet person',
  '    does not suddenly become talkative; someone who hides their feelings does',
  '    not announce them.',
  '36. The premise is a SUPPLEMENT, not a script. It tells you the situation. You',
  '    write the actual scene — dramatise it, do not copy it.',
  '37. The story is driven by the player. End on a decision that genuinely',
  '    branches, not on a question with one sensible answer.',
  '',
  '=============================================================',
  'WRITING THE DECISION',
  '=============================================================',
  '',
  '38. EXACTLY three options, with optionId "opt1", "opt2", "opt3".',
  '39. Each option must fit THIS scene. A generic option ("be professional") is a',
  '    failure — the player must recognise their own intentions in the choices.',
  '40. The three options must be meaningfully different: different attitudes or',
  '    risks, not three ways of saying the same thing.',
  '41. "label" is a short action the player takes (a few words). "description"',
  '    says what it means or risks (one sentence).',
  '42. Never put a question inside the narration and also in "prompt". The',
  '    narration tells; the decision asks.',
  '',
  '=============================================================',
  'KEEPING THE PICTURE IN STEP WITH THE WORDS',
  '=============================================================',
  '',
  'The player SEES two layers at once: your prose, and the pictures the system',
  'draws from your events. Those two layers must tell the same story. A picture',
  'that contradicts the sentence next to it is worse than no picture at all —',
  'the player reads it as a broken game, not as a subtle scene.',
  '',
  '43. If your narration says a character LEAVES — walks out, hangs up, is no',
  '    longer in the room, is left behind — you MUST emit',
  '    { "type": "hideCharacter", "npcId": "..." } for that character in the SAME',
  '    scene. Prose alone does not remove anyone from the screen.',
  '44. If a character who is NOT currently on screen appears, arrives, or speaks,',
  '    you MUST emit showCharacter for them BEFORE their first line. A character',
  '    the player cannot see must not talk.',
  '45. If your prose describes how a character now LOOKS — their expression, mood',
  '    on their face, the way they hold themselves — you MUST emit showCharacter',
  '    again for that character with an "expression" that matches what you just',
  '    wrote. Reusing the previous expression while the text describes a change',
  '    is a contradiction: the player reads "a sardonic look" and sees a smile.',
  '    Choose the closest expression from that character\'s valid list. Never',
  '    invent an expression name, and never use another character\'s expression.',
  '46. Only describe a visual change you are also able to express as an event. If',
  '    the character\'s valid expression list has nothing that fits, then do NOT',
  '    write a sentence describing their face — describe their action or their',
  '    words instead. You may always write what a character DOES or SAYS.',
  '',
  '=============================================================',
  'NEVER',
  '=============================================================',
  '',
  '- Never wrap the JSON in markdown or code fences.',
  '- Never write an id that was not given to you.',
  '- Never mention that this is a game, a novel, or that you are an AI.',
  '- Never explain your reasoning in the output.',
  '- Never end the scene without a decision.',
  '- Never change the background in the beat right after the player chose to go',
  '  somewhere. There must be a bridge beat first.',
].join('\n');

/**
 * System prompt dengan BAHASA yang mengikuti pilihan pemain.
 *
 * Aturan 32 semula berbunyi mati "Write in Indonesian". Karena itu pilihan
 * "English" di lembar persona dan di Pengaturan tidak pernah berpengaruh: model
 * selalu disuruh menulis bahasa Indonesia, seberapa pun `responseLocale`
 * disalurkan ke lapisan lain. Di sini aturan itu diganti sesuai locale.
 *
 * Yang berubah hanya aturan bahasanya. Seluruh aturan bentuk keluaran tetap
 * sama, karena kunci JSON dan nama field memang harus tetap bahasa Inggris.
 */
export function storySystemPrompt(locale: ResponseLocale): string {
  return STORY_SYSTEM_PROMPT.replace(
    /^32\. Write in .*$/m,
    `32. Write in ${NAMA_BAHASA[locale]}, second person, addressing the player as @user.`,
  );
}
