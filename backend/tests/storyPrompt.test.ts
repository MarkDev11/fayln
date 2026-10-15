/**
 * Prompt mesin cerita.
 *
 * Prompt ini adalah SPESIFIKASI TOOL CALLING, bukan gaya penulisan: keluarannya
 * dikonsumsi program. Karena itu yang dijaga di sini bukan "apakah promptnya
 * bagus", melainkan apakah aturan yang membuat keluarannya dapat dipakai masih
 * ada. Satu aturan yang hilang tidak menimbulkan galat di sini — ia menimbulkan
 * cerita yang berhenti di produksi.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_RELATION_STATUSES } from '../src/contracts/types';

import {
  buildStoryUserPrompt,
  MAX_BEAT_WORDS,
  MAX_SCENE_BEATS,
  STORY_SYSTEM_PROMPT,
  storySystemPrompt,
} from '../src/services/storyPrompt';
import type { StoryPromptInput } from '../src/services/storyPrompt';

const MASUKAN: StoryPromptInput = {
  worldTitle: 'Bosku Ternyata Mantan Pacarku',
  premise: 'Kamu duduk di meja kerja nomor 47 di gedung Sky Tower.',
  synopsis: 'Hari pertama kerja mempertemukanmu dengan mantanmu.',
  persona: { name: 'Marky', age: 24 },
  backgrounds: [
    { assetId: 'bg_kantor', label: 'Kantor Modern Pemandangan Kota' },
    { assetId: 'bg_kantin', label: 'Kantin Karyawan' },
  ],
  characters: [
    {
      npcId: 'npc_rina',
      name: 'Rina',
      role: 'bosmu',
      soul: 'Keras di permukaan, tetapi menyimpan banyak hal.',
      publicBackstory: 'Mantan pacarmu saat SMA.',
      defaultPortraitAssetId: 'p_npc_rina_0_senyum',
      expressions: ['senyum', 'kesal'],
    },
  ],
  storySoFar: null,
  recentBeats: [],
  /*
   * Keadaan hubungan awal. Bidang ini WAJIB ada, dan fixture yang melewatkannya
   * dulu lolos `tsc` karena `tests/` dikecualikan dari pemeriksaan tipe — lalu
   * gagal saat berjalan dengan "Cannot read properties of undefined". Itu
   * persis jebakan yang sudah tercatat di memori proyek; uji di bawah
   * ("menolak keadaan hubungan yang hilang") menjaganya.
   */
  relations: [
    {
      npcId: 'npc_rina',
      name: 'Rina',
      status: 'normal',
      reasonPublic: 'Hubungan awal yang ditetapkan dunia.',
    },
  ],
  /*
   * Kosakata status yang sah untuk dunia ini.
   *
   * Bentuknya MENIRU salinan yang dibekukan pada versi dunia, bukan master yang
   * sedang berlaku. Di produksi isinya datang dari
   * `journeyRepository.relationshipVocabulary()`; di sini disusun tangan.
   */
  relationVocabulary: [
    { relationId: 'normal', meaning: 'Netral — bersikap wajar.', behaviourHint: '' },
    { relationId: 'hangat', meaning: 'Hangat — ramah tetapi belum dekat.', behaviourHint: '' },
    { relationId: 'waspada', meaning: 'Waspada — menjaga jarak dan berhati-hati.', behaviourHint: '' },
    { relationId: 'tegang', meaning: 'Tegang — ketegangan terbuka.', behaviourHint: '' },
    { relationId: 'renggang', meaning: 'Renggang — menjauh dan menghindari.', behaviourHint: '' },
    { relationId: 'dekat', meaning: 'Dekat — mempercayai pemain.', behaviourHint: '' },
    { relationId: 'sayang', meaning: 'Sayang — menyukai pemain dengan tulus.', behaviourHint: '' },
    { relationId: 'cinta', meaning: 'Cinta — jatuh cinta kepada pemain.', behaviourHint: '' },
  ],
  playerAction: null,
  responseLocale: 'id-ID',
};

describe('prompt sistem', () => {
  it('menetapkan bentuk keluaran sebagai JSON, tanpa pagar kode', () => {
    expect(STORY_SYSTEM_PROMPT).toContain('ONE JSON object and nothing else');
    expect(STORY_SYSTEM_PROMPT).toContain('Never wrap the JSON in markdown');
  });

  it('menyebut keenam bentuk event yang sah', () => {
    /*
     * Model tidak dapat memilih bentuk yang tidak pernah dilihatnya. Setiap jenis
     * peristiwa yang dikonsumsi mesin harus tertulis lengkap di promptnya.
     */
    for (const jenis of [
      'setBackground',
      'showCharacter',
      'hideCharacter',
      'narrate',
      'say',
      'relationshipDelta',
    ]) {
      expect(STORY_SYSTEM_PROMPT, `bentuk ${jenis} tidak disebut`).toContain(jenis);
    }
  });

  it('mewajibkan adegan berakhir dengan keputusan berisi tiga opsi', () => {
    expect(STORY_SYSTEM_PROMPT).toContain('ALWAYS ends with a decision');
    expect(STORY_SYSTEM_PROMPT).toContain('EXACTLY three options');
    expect(STORY_SYSTEM_PROMPT).toContain('Never end the scene without a decision');
  });

  it('melarang mengarang id, dan menyuruh memakai daftar yang diberikan', () => {
    // Kegagalan paling sering: model menulis nama latar yang terdengar masuk akal
    // padahal tidak ada di manifest — klien lalu menampilkan placeholder.
    expect(STORY_SYSTEM_PROMPT).toContain('Never write an id that was not given to you');
    expect(STORY_SYSTEM_PROMPT).toContain('the list is the whole world');
  });

  it('menyebut batas beat dan batas kata dari konstanta yang sama', () => {
    // Angka yang ditulis ulang di dua tempat akan bercabang; keduanya harus
    // berasal dari konstanta yang sama.
    expect(STORY_SYSTEM_PROMPT).toContain(`MAXIMUM ${String(MAX_SCENE_BEATS)} events`);
    expect(STORY_SYSTEM_PROMPT).toContain(`under ${String(MAX_BEAT_WORDS)} words`);
  });

  it('mempertahankan aturan @user dan token karakter', () => {
    expect(STORY_SYSTEM_PROMPT).toContain('NAME OF THE PLAYER');
    expect(STORY_SYSTEM_PROMPT).toContain('never with "kamu"');
    expect(STORY_SYSTEM_PROMPT).toContain('has not');
  });

  it('menyatakan premis sebagai pelengkap, bukan naskah', () => {
    expect(STORY_SYSTEM_PROMPT).toContain('SUPPLEMENT, not a script');
  });
});

/**
 * Kesinambungan antar-adegan — keluhan pemilik produk.
 *
 * Ia membandingkan mesin cerita dengan dungeon master D&D: dari kota ke desa
 * tidak mungkin dipindahkan begitu saja, harus ada cara berpindah dan biasanya
 * ada interaksi dengan seseorang di jalan. Uji di bawah ini menjaga KEWAJIBAN
 * menjembatani itu tetap tertulis.
 *
 * Uji ini membaca TEKS PROMPT, jadi ia hanya menjaga bahwa aturannya tidak
 * terhapus — bukan bahwa model mematuhinya. Itu batas yang disengaja: perilaku
 * model tidak dapat diuji tanpa memanggil model, dan panggilan seperti itu tidak
 * deterministik. Yang dapat dijamin di sini adalah aturannya masih dikirim.
 */
describe('kesinambungan adegan (dungeon master)', () => {
  it('melarang berpindah tempat tanpa jembatan', () => {
    expect(STORY_SYSTEM_PROMPT).toContain('you are a dungeon master, not a fast-travel menu');
    expect(STORY_SYSTEM_PROMPT).toContain('That is a teleport');
  });

  it('menyebut ketiga langkah jembatan secara berurutan', () => {
    // Niat lalu perjalanan lalu tiba. Bila salah satu hilang, model akan
    // memilih jalan pintas: langsung mengganti latar.
    expect(STORY_SYSTEM_PROMPT).toContain('(a) INTENT');
    expect(STORY_SYSTEM_PROMPT).toContain('(b) BRIDGE');
    expect(STORY_SYSTEM_PROMPT).toContain('(c) ARRIVAL');
  });

  it('menjadikan jembatan sebagai tempat world building, bukan pengisi', () => {
    expect(STORY_SYSTEM_PROMPT).toContain('WORLD BUILDING');
    expect(STORY_SYSTEM_PROMPT).toContain('bridge beat in between is mandatory');
  });

  it('mengingatkan agar tidak meloncat saat meneruskan aksi pemain', () => {
    const pesan = buildStoryUserPrompt({ ...MASUKAN, playerAction: 'Pergi ke kantin' });

    expect(pesan).toContain('apakah tindakan itu MEMINDAHKAN pemain ke tempat lain');
    expect(pesan).toContain('jangan langsung mengganti latar');
  });

  it('menegaskan jangan meloncat saat sudah ada riwayat cerita', () => {
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      storySoFar: 'Rina memintamu mengambil berkas.',
      recentBeats: ['narrate: Kamu berdiri di depan lift.'],
    });

    expect(pesan).toContain('jangan meloncat ke tempat');
  });

  it('TIDAK menambahkan peringatan riwayat pada adegan pertama', () => {
    // Adegan pembuka tidak punya riwayat, jadi peringatannya hanya menambah
    // kebisingan bagi model.
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).not.toContain('jangan meloncat ke tempat');
  });

  it('meminta adegan pembuka membangun tempat, bukan menamainya', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('Ini kesan pertama pemain terhadap dunia ini');
    expect(pesan).toContain('Jangan hanya menamai ruangan');
  });
});

describe('pesan pengguna', () => {
  it('memuat seluruh id latar yang sah', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('bg_kantor');
    expect(pesan).toContain('bg_kantin');
    expect(pesan).toContain('Kantor Modern Pemandangan Kota');
  });

  it('memuat karakter beserta jiwa, potret, dan ekspresinya', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('npc_rina');
    expect(pesan).toContain('Keras di permukaan');
    expect(pesan).toContain('p_npc_rina_0_senyum');
    /*
     * Dikutip satu per satu, BUKAN digabung dengan koma.
     *
     * `'senyum, kesal'` adalah bentuk lama yang ambigu begitu nama ekspresinya
     * sendiri mengandung koma — dan begitulah bentuk yang dihasilkan panel
     * admin. Lihat describe 'daftar ekspresi tidak ambigu' di bawah.
     */
    expect(pesan).toContain('"senyum"');
    expect(pesan).toContain('"kesal"');
  });

  it('meminta ADEGAN PEMBUKA saat belum ada aksi pemain', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('Tulis ADEGAN PEMBUKA');
    expect(pesan).not.toContain('Pemain memilih/melakukan');
  });

  it('meneruskan aksi pemain saat ada, bukan menulis adegan pembuka lagi', () => {
    const pesan = buildStoryUserPrompt({ ...MASUKAN, playerAction: 'Menatapnya tanpa bicara' });

    expect(pesan).toContain('Pemain memilih/melakukan: Menatapnya tanpa bicara');
    expect(pesan).not.toContain('Tulis ADEGAN PEMBUKA');
  });

  it('menyertakan ringkasan dan beat terakhir bila ada', () => {
    /*
     * Inilah yang menjaga cerita tetap nyambung tanpa mengirim seluruh riwayat.
     */
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      storySoFar: 'Rina tahu @user mengingat masa SMA mereka.',
      recentBeats: ['narrate: Kamu masuk ruangan.', 'say(rina): Kamu terlambat.'],
    });

    expect(pesan).toContain('RINGKASAN CERITA SEJAUH INI');
    expect(pesan).toContain('Rina tahu @user mengingat masa SMA mereka.');
    expect(pesan).toContain('say(rina): Kamu terlambat.');
  });

  it('tidak menuliskan bagian ringkasan saat adegan pertama', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).not.toContain('RINGKASAN CERITA SEJAUH INI');
  });

  it('mengulang batas beat dan kata di akhir, tempat yang paling dibaca model', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain(`maksimum ${String(MAX_SCENE_BEATS)} beat`);
    expect(pesan).toContain(`di bawah ${String(MAX_BEAT_WORDS)} kata`);
  });
});

/**
 * Daftar ekspresi harus TIDAK AMBIGU.
 *
 * Panel admin menghasilkan nama ekspresi berupa frasa berkoma, misalnya
 * "senyum, pakaian kantor, mengangkat tangan". Bila daftarnya digabung dengan
 * koma juga (`expressions.join(', ')`), model tidak punya cara mengetahui di
 * mana satu ekspresi berakhir — ia menulis bentuk pendek, validator menolak
 * dengan `ekspresi-tidak-dikenal`, dan SELURUH giliran jatuh ke simulator.
 * Di layar itu terlihat sebagai cerita yang berulang.
 *
 * BUKTI MERAH: kembalikan `orang.expressions.join(', ')` di `storyPrompt.ts`,
 * lalu uji ini memerah pada pemeriksaan kutip per baris.
 */
describe('daftar ekspresi tidak ambigu', () => {
  const DENGAN_KOMA = {
    ...MASUKAN,
    characters: [
      {
        ...MASUKAN.characters[0]!,
        expressions: [
          'senyum, pakaian kantor, mengangkat tangan',
          'terkejut, pakaian kantor, menutup mulut',
        ],
      },
    ],
  };

  it('menulis setiap ekspresi di barisnya sendiri, dalam kutip', () => {
    const prompt = buildStoryUserPrompt(DENGAN_KOMA);

    expect(prompt).toContain('"senyum, pakaian kantor, mengangkat tangan"');
    expect(prompt).toContain('"terkejut, pakaian kantor, menutup mulut"');

    /*
     * Masing-masing berdiri sendiri, bukan menyatu di satu baris.
     *
     * Hitungannya DIBATASI sampai bagian "HUBUNGAN SAAT INI" — sejak bagian itu
     * ada, daftar status yang sah juga ditulis dalam kutip di barisnya sendiri,
     * dan hitungan yang mencari seluruh prompt akan ikut menghitungnya.
     */
    const sampaiHubungan = prompt.split('HUBUNGAN SAAT INI')[0] ?? prompt;
    const barisEkspresi = sampaiHubungan
      .split('\n')
      .filter((baris) => baris.trim().startsWith('"'));
    expect(barisEkspresi).toHaveLength(2);
  });

  it('TIDAK menggabungkan ekspresi dengan koma', () => {
    const prompt = buildStoryUserPrompt(DENGAN_KOMA);

    // Bentuk lama yang ambigu: dua ekspresi berdampingan dipisah koma.
    expect(prompt).not.toContain(
      'senyum, pakaian kantor, mengangkat tangan, terkejut, pakaian kantor, menutup mulut',
    );
  });

  it('meminta model menyalin apa adanya', () => {
    const prompt = buildStoryUserPrompt(DENGAN_KOMA);
    expect(prompt).toMatch(/SALIN PERSIS/i);
  });
});

/**
 * Perpindahan tempat harus SELESAI di adegan yang sama.
 *
 * Aturan lama hanya menyuruh "tulis niatnya, tulis perjalanannya, baru kemudian
 * tiba" — tanpa mewajibkan tibanya. Terukur di produksi: model menulis
 * "mengikuti ke ruang rapat" dan "lorong kantor sunyi", tetapi `setBackground`
 * ke tujuan tidak pernah keluar. Enam putaran berturut-turut seluruhnya di satu
 * latar, meski pemain memilih opsi perpindahan pada putaran pertama.
 *
 * BUKTI MERAH: hapus blok "WAJIB: adegan ini harus SELESAI SAMPAI TUJUAN" di
 * `storyPrompt.ts`, lalu uji ini memerah.
 */
describe('perpindahan tempat diselesaikan', () => {
  it('mewajibkan setBackground ke tujuan di adegan yang sama', () => {
    const pesan = buildStoryUserPrompt({ ...MASUKAN, playerAction: 'Ikuti dia ke ruang rapat' });

    expect(pesan).toContain('SELESAI SAMPAI TUJUAN');
    expect(pesan).toMatch(/setBackground/);
    expect(pesan).toMatch(/sebelum keputusan penutup/i);
  });

  it('tetap melarang meloncat tanpa menjembatani', () => {
    /*
     * Larangan meloncat hanya muncul bila sudah ada riwayat — itu memang
     * disengaja: pada adegan pembuka belum ada apa pun untuk diulang.
     */
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      playerAction: 'Ikuti dia ke ruang rapat',
      recentBeats: ['Rina: Ikut saya ke ruang rapat.'],
    });

    expect(pesan).toMatch(/jangan langsung mengganti latar/i);
    expect(pesan).toMatch(/jangan meloncat/i);
  });
});

/**
 * Jangan menjanjikan tempat yang tidak punya latar.
 *
 * Terukur di produksi: model menawarkan "Ikuti dia ke ruang rapat", tetapi
 * daftar latar dunia itu tidak memuat ruang rapat sama sekali. Karena tidak ada
 * latar yang cocok, `setBackground` ke tujuan tidak mungkin keluar — latar pun
 * tidak berpindah sepanjang enam putaran.
 *
 * BUKTI MERAH: hapus blok "Jangan menawarkan atau menulis perpindahan ke tempat
 * yang TIDAK ADA latarnya", lalu uji ini memerah.
 */
describe('tujuan harus punya latar', () => {
  it('melarang menyebut tempat yang tidak ada latarnya', () => {
    const pesan = buildStoryUserPrompt({ ...MASUKAN, playerAction: 'Ikuti dia ke ruang rapat' });

    // Perhatikan: teks prompt dipotong baris, jadi spasi tidak dapat diandalkan.
    expect(pesan).toMatch(/ADA latarnya di daftar/i);
    expect(pesan).toMatch(/satu label di daftar itu/i);
  });
});

/**
 * Bahasa mengikuti PILIHAN PEMAIN, bukan dipatok.
 *
 * Aturan 32 di system prompt semula berbunyi mati "Write in Indonesian",
 * sehingga opsi "English" di lembar persona dan di Pengaturan tidak berpengaruh
 * apa pun — kontrol mati. Uji ini menjaga kedua sisi: system prompt DAN user
 * prompt harus mengikuti `responseLocale`.
 *
 * BUKTI MERAH: kembalikan `STORY_SYSTEM_PROMPT` (konstanta) di
 * `aiStoryEngine.ts`, atau hapus baris "BAHASA CERITA" di `storyPrompt.ts`,
 * lalu uji-uji ini memerah.
 */
describe('bahasa mengikuti pilihan pemain', () => {
  it('system prompt menyebut English saat locale en-US', () => {
    const sistem = storySystemPrompt('en-US');

    expect(sistem).toContain('Write in English');
    expect(sistem).not.toContain('Write in Bahasa Indonesia');
  });

  it('system prompt menyebut Bahasa Indonesia saat locale id-ID', () => {
    const sistem = storySystemPrompt('id-ID');

    expect(sistem).toContain('Write in Bahasa Indonesia');
    expect(sistem).not.toContain('Write in English');
  });

  it('aturan bentuk keluaran TIDAK ikut berubah', () => {
    // Yang boleh berubah hanya aturan bahasanya. Kunci JSON tetap bahasa Inggris.
    const id = storySystemPrompt('id-ID');
    const en = storySystemPrompt('en-US');

    expect(id.replace(/^32\. Write in .*$/m, '')).toBe(
      en.replace(/^32\. Write in .*$/m, ''),
    );
  });

  it('user prompt menyebut bahasa yang dipilih', () => {
    expect(buildStoryUserPrompt({ ...MASUKAN, responseLocale: 'en-US' })).toContain(
      'BAHASA CERITA: English',
    );
    expect(buildStoryUserPrompt({ ...MASUKAN, responseLocale: 'id-ID' })).toContain(
      'BAHASA CERITA: Bahasa Indonesia',
    );
  });

  it('TIDAK PERNAH menulis "undefined" sebagai bahasa', () => {
    /*
     * Penjaga khusus: `tests/` DIKECUALIKAN dari `tsc`, sehingga fixture yang
     * kurang bidang ini tidak ketahuan saat kompilasi — promptnya hanya berbunyi
     * "BAHASA CERITA: undefined." dan model menebak sendiri.
     */
    for (const locale of ['id-ID', 'en-US'] as const) {
      expect(buildStoryUserPrompt({ ...MASUKAN, responseLocale: locale })).not.toContain(
        'undefined',
      );
    }
  });
});

/**
 * Larangan menyebut tempat yang tidak ada latarnya, MENEMPEL pada daftarnya.
 *
 * Terukur di produksi: setelah aturan di bagian TUGAS ditambahkan, model masih
 * menawarkan "Ikuti ke rapat" — padahal daftar 22 latar dunia itu tidak memuat
 * ruang rapat. Aturan yang jauh dari datanya mudah terlewat; yang ini diletakkan
 * tepat di sebelah daftar latar.
 *
 * BUKTI MERAH: hapus blok "PENTING: hanya tempat di daftar itu" di
 * `storyPrompt.ts`, lalu uji ini memerah.
 */
describe('tempat yang disebut harus ada latarnya', () => {
  it('menempel tepat setelah daftar latar', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    const akhirDaftar = pesan.indexOf('bg_kantin');
    const larangan = pesan.indexOf('hanya tempat di daftar itu yang BENAR-BENAR ADA');

    expect(akhirDaftar).toBeGreaterThan(-1);
    expect(larangan).toBeGreaterThan(akhirDaftar);
    // Tidak boleh terpisah jauh — harus bagian dari blok latar.
    expect(larangan - akhirDaftar).toBeLessThan(200);
  });

  it('melarang menyebut tempat lain di dalam label opsi', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);
    expect(pesan).toMatch(/termasuk di dalam label opsi/i);
  });

  it('menyuruh tetap di tempat bila tempatnya tidak ada', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);
    expect(pesan).toMatch(/tetap di tempat sekarang/i);
  });
});

describe('hubungan — keadaan dan kosakata', () => {
  /*
   * Keluhan pemilik produk: "cek fitur hubungan sudah full fungsional apa belum".
   *
   * Jawabannya TIDAK, dan akarnya ada di prompt: ia tidak pernah memuat keadaan
   * hubungan sekarang, dan tidak pernah memuat daftar status yang sah. Model
   * diminta memutuskan apakah seorang tokoh tersinggung tanpa tahu bagaimana
   * hubungan mereka sebelumnya, dan tanpa tahu kata apa yang boleh dipakai.
   *
   * BUKTI MUTASI: hapus blok "HUBUNGAN SAAT INI" dari `buildStoryUserPrompt`,
   * lalu uji-uji ini memerah.
   */
  it('menyebut keadaan hubungan sekarang, per tokoh', () => {
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      relations: [
        { npcId: 'npc_rina', name: 'Rina', status: 'waspada', reasonPublic: 'Kamu menyebut masa lalu di depan tim.' },
      ],
    });

    expect(pesan).toContain('HUBUNGAN SAAT INI');
    expect(pesan).toContain('npc_rina (Rina): "waspada"');
    expect(pesan).toContain('Kamu menyebut masa lalu di depan tim.');
  });

  it('mendaftarkan SELURUH nilai status yang sah BESERTA artinya', () => {
    /*
     * Daftarnya datang dari KOSAKATA DUNIA, bukan dari konstanta di kode.
     *
     * Bentuk lama menulis delapan nilai harfiah di sini. Ia cocok dengan basis
     * data pada hari ia ditulis, lalu berhenti cocok begitu admin menambah
     * status kesembilan lewat panel: model tetap diberi tahu delapan nilai lama,
     * dan perubahan yang sebenarnya dimaksud hilang tanpa satu pun galat.
     *
     * BUKTI MUTASI: ganti loop ini menjadi `for (const status of
     * DEFAULT_RELATION_STATUSES)`, lalu uji "memakai kosakata dunia, bukan
     * daftar bawaan" di bawah memerah.
     */
    const pesan = buildStoryUserPrompt(MASUKAN);

    for (const definisi of MASUKAN.relationVocabulary) {
      expect(pesan).toContain(`"${definisi.relationId}"`);
      expect(pesan).toContain(definisi.meaning);
    }

    /*
     * Fixture-nya sendiri harus memuat seluruh status bawaan.
     *
     * Kalau tidak, uji-uji di berkas ini akan terus hijau sementara kosakatanya
     * diam-diam menyusut — dan uji yang memeriksa daftar yang lebih pendek
     * daripada yang benar tidak menjaga apa pun.
     */
    for (const bawaan of DEFAULT_RELATION_STATUSES) {
      expect(MASUKAN.relationVocabulary.map((item) => item.relationId)).toContain(bawaan);
    }
  });

  it('memakai kosakata dunia, bukan daftar bawaan di dalam kode', () => {
    /*
     * Status yang HANYA ada di kosakata dunia harus muncul di prompt. Inilah
     * yang membuat status kesembilan mungkin tanpa membangun ulang aplikasi.
     */
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      relationVocabulary: [
        { relationId: 'normal', meaning: 'Netral.', behaviourHint: '' },
        { relationId: 'rel_curiga', meaning: 'Curiga — mengawasi pemain diam-diam.', behaviourHint: '' },
      ],
    });

    expect(pesan).toContain('"rel_curiga"');
    expect(pesan).toContain('mengawasi pemain diam-diam');
    // Dan nilai bawaan yang TIDAK ada di kosakata dunia ini tidak ikut ditulis.
    expect(pesan).not.toContain('"cinta"');
  });

  it('menempatkan contoh sikap pada status yang tepat', () => {
    /*
     * BUKTI MUTASI: hapus atau pindahkan baris `terlihat sebagai` pada
     * `buildStoryUserPrompt`, lalu pasangan status-hint yang ditegaskan di sini
     * tidak lagi muncul dan uji ini memerah.
     */
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      relationVocabulary: [
        {
          relationId: 'rel_waspada',
          meaning: 'Berhati-hati sebelum mempercayai.',
          behaviourHint: 'Menjaga jarak fisik dan menjawab singkat.',
        },
        {
          relationId: 'rel_dekat',
          meaning: 'Mempercayai pemain.',
          behaviourHint: 'Mencari alasan untuk tetap berbicara.',
        },
      ],
    });

    expect(pesan).toContain(
      '"rel_waspada" = Berhati-hati sebelum mempercayai.\n      terlihat sebagai: Menjaga jarak fisik dan menjawab singkat.',
    );
    expect(pesan).toContain(
      '"rel_dekat" = Mempercayai pemain.\n      terlihat sebagai: Mencari alasan untuk tetap berbicara.',
    );
    expect(pesan).not.toContain('"rel_waspada" = Berhati-hati sebelum mempercayai.\n      terlihat sebagai: Mencari alasan');
  });

  it('hint kosong menghasilkan prompt wajar tanpa undefined', () => {
    /*
     * BUKTI MUTASI: tulis properti hint secara tak bersyarat tanpa memeriksa
     * string kosong, lalu prompt memperoleh baris `terlihat sebagai` kosong;
     * jika hint hilang dari input, nilainya menjadi teks `undefined`.
     */
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      relationVocabulary: [
        { relationId: 'rel_netral', meaning: 'Tidak dekat maupun bermusuhan.', behaviourHint: '' },
      ],
    });

    expect(pesan).toContain('"rel_netral" = Tidak dekat maupun bermusuhan.');
    expect(pesan).not.toContain('terlihat sebagai:');
    expect(pesan).not.toContain('undefined');
  });

  it('melarang menulis relationshipDelta saat dunia tidak punya status sah', () => {
    /*
     * Dunia tanpa satu pun status sah tetap harus dapat dimainkan, tetapi
     * meminta model menulis perubahan hubungan di situ hanya menghasilkan nilai
     * yang pasti dibuang. Lebih baik dilarang secara terbuka daripada dibuang
     * diam-diam.
     */
    const pesan = buildStoryUserPrompt({ ...MASUKAN, relationVocabulary: [] });

    expect(pesan).toContain('(tidak ada)');
    expect(pesan).toContain('JANGAN menulis "relationshipDelta"');
  });

  it('menolak kosakata yang HILANG, bukan memperlakukannya sebagai kosong', () => {
    /*
     * `undefined` dan `[]` adalah dua keadaan yang berbeda dan tidak boleh
     * diperlakukan sama:
     *
     *   - `undefined` = pemanggil lupa mengisinya. Itu cacat pemrograman, dan
     *     membiarkannya lewat berarti prompt tetap tersusun dengan daftar kosong
     *     sehingga seluruh perubahan hubungan dibuang tanpa satu pun galat.
     *   - `[]` = dunia yang memang tidak punya status sah. Itu keadaan yang sah.
     *
     * BUKTI MUTASI: hapus blok `if (!Array.isArray(...)) { throw ... }` di
     * `buildStoryUserPrompt`, lalu uji ini memerah.
     *
     * ---------------------------------------------------------------------------
     * MENGAPA PESANNYA DIPERIKSA, BUKAN SEKADAR "MELEMPAR"
     * ---------------------------------------------------------------------------
     * Bentuk pertama uji ini hanya menulis `.toThrow()`. Itu LOLOS walau
     * penjaganya dihapus: tanpa penjaga, `input.relationVocabulary.length`
     * melempar `TypeError: Cannot read properties of undefined` — tetap sebuah
     * galat, sehingga `.toThrow()` tetap terpenuhi. Uji yang hijau untuk alasan
     * yang salah lebih berbahaya daripada tidak ada uji: ia memberi rasa aman
     * atas penjaga yang tidak ada.
     *
     * Terukur: dengan penjaga → `Error: buildStoryUserPrompt: relationVocabulary
     * wajib diisi pemanggil.`; tanpa penjaga → `TypeError`.
     */
    const tanpaKosakata = { ...MASUKAN } as Record<string, unknown>;
    delete tanpaKosakata.relationVocabulary;

    expect(() => buildStoryUserPrompt(tanpaKosakata as never)).toThrow(
      'relationVocabulary wajib diisi',
    );
  });

  it('menegaskan status adalah keadaan BARU, bukan selisihnya', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('keadaan BARU');
    expect(pesan).toContain('reasonPublic');
  });

  it('tetap menulis bagian hubungan walau belum ada tokoh', () => {
    // Adegan yang belum mempertemukan siapa pun tetap harus punya bagiannya,
    // supaya model tidak menyimpulkan bahwa hubungan tidak dilacak sama sekali.
    const pesan = buildStoryUserPrompt({ ...MASUKAN, relations: [] });

    expect(pesan).toContain('HUBUNGAN SAAT INI');
    expect(pesan).toContain('belum ada tokoh');
  });

  it('menolak keadaan hubungan yang hilang, bukan diam-diam kosong', () => {
    /*
     * `relations` WAJIB. Bidang ini sempat membuat 22 uji merah sekaligus saat
     * ditambahkan, karena `tests/` dikecualikan dari `tsc` sehingga fixture yang
     * melewatkannya tidak pernah ketahuan saat kompilasi.
     *
     * BUKTI MUTASI: ubah `input.relations.length` menjadi
     * `(input.relations ?? []).length`, lalu uji ini memerah.
     */
    const tanpaRelations = { ...MASUKAN } as Record<string, unknown>;
    delete tanpaRelations.relations;

    expect(() => buildStoryUserPrompt(tanpaRelations as never)).toThrow();
  });
});

describe('hubungan — harus TERLIHAT, bukan hanya tercatat', () => {
  /*
   * Keluhan pemilik produk: "kasih solusi biar hidup hubungannya".
   *
   * Akarnya bukan lagi data: keadaan sudah sampai ke prompt, kosakatanya sudah
   * ada, dan statusnya sudah divalidasi. Yang masih menahan adalah DUA kalimat:
   *
   *   1. Aturan 6 berbunyi "OPTIONAL and rare" — model disuruh MENAHAN DIRI dari
   *      hal yang justru inti fiturnya, sehingga status hampir tidak pernah
   *      berubah dan pemain tidak pernah melihat fiturnya bekerja.
   *   2. Tidak ada satu pun kalimat yang menyuruh tokoh BERSIKAP sesuai
   *      hubungannya. Statusnya berubah, tercatat, tampil di layar — dan tidak
   *      mengubah apa pun. Angka yang bergerak, bukan hubungan yang hidup.
   *
   * BUKTI MUTASI: hapus blok "BAGAIMANA HUBUNGAN ITU HARUS TERLIHAT" dari
   * `buildStoryUserPrompt`, lalu uji pertama memerah. Kembalikan kata "rare" ke
   * aturan 6, lalu uji ketiga memerah.
   */
  it('menyuruh tokoh BERSIKAP sesuai statusnya', () => {
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('BAGAIMANA HUBUNGAN ITU HARUS TERLIHAT');
    expect(pesan).toContain('bersikap sesuai statusnya SEKARANG');
    /*
     * Aturan itu TIDAK boleh menyebut status tertentu.
     *
     * Bentuk lamanya menulis "waspada menjaga jarak, dekat mencari alasan untuk
     * bicara". Itu benar selama daftarnya delapan nilai bawaan. Begitu admin
     * menambah atau mengganti statusnya, contoh itu menunjuk nilai yang tidak ada
     * lagi di daftar di atas — dan model menerima dua daftar yang saling
     * bertentangan, lalu memilih yang mana saja.
     *
     * BUKTI MUTASI: kembalikan contoh per-status ke dalam aturan f, lalu uji
     * "tidak menyebut status tertentu di dalam aturannya" di bawah memerah.
     */
    expect(pesan).toContain('menurut arti yang');
  });

  it('tidak menyebut status tertentu di dalam aturannya', () => {
    /*
     * Diuji dengan kosakata yang TIDAK memuat satu pun nilai bawaan: kalau
     * aturannya masih menyebut "waspada" atau "dekat", nama itu muncul di prompt
     * padahal tidak ada di daftar nilai yang sah — dan model akan memakainya.
     */
    const pesan = buildStoryUserPrompt({
      ...MASUKAN,
      relationVocabulary: [
        { relationId: 'rel_curiga', meaning: 'Curiga — mengawasi pemain diam-diam.', behaviourHint: '' },
      ],
    });

    const aturan = pesan.slice(pesan.indexOf('BAGAIMANA HUBUNGAN ITU HARUS TERLIHAT'));
    const akhirAturan = aturan.indexOf('Aturan hubungan:');
    const badanAturan = aturan.slice(0, akhirAturan);

    for (const bawaan of DEFAULT_RELATION_STATUSES) {
      expect(badanAturan).not.toContain(bawaan);
    }
  });

  it('melarang tokoh MENGUMUMKAN statusnya', () => {
    /*
     * "Tunjukkan, jangan umumkan." Tanpa aturan ini model menulis dialog seperti
     * "hubungan kita sekarang waspada" — yang membocorkan mekanik permainan ke
     * dalam cerita dan terdengar seperti naskah yang dibacakan.
     */
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('JANGAN mengumumkan statusnya');
    expect(pesan).toContain('bukan dialog');
  });

  it('TIDAK lagi menyebut relationshipDelta "rare"', () => {
    /*
     * Kata "rare" adalah penahan yang paling mudah terlewat: ia tidak membuat
     * apa pun gagal, ia hanya membuat fiturnya tidak pernah muncul.
     */
    expect(STORY_SYSTEM_PROMPT).not.toContain('OPTIONAL and rare');
    expect(STORY_SYSTEM_PROMPT).toContain('WHENEVER the player');
  });

  it('menegaskan hubungan yang berubah tidak pulih sendiri', () => {
    /*
     * Tanpa aturan ini model mengembalikan tokohnya ke "normal" di awal adegan
     * berikutnya, dan seluruh perubahan sebelumnya terhapus.
     */
    const pesan = buildStoryUserPrompt(MASUKAN);

    expect(pesan).toContain('TIDAK kembali sendiri tanpa sebab');
  });
});

/**
 * Lapisan gambar harus mengikuti isi cerita.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA PENJAGA INI ADA
 * ---------------------------------------------------------------------------
 * Terukur pada pemilik produk: narasi menulis tokoh "pergi", tetapi potretnya
 * tetap di layar; dan narasi menulis "tatapan sinis" sementara potretnya masih
 * tersenyum. Penyebabnya bukan mesin gambar, melainkan PROMPT: `hideCharacter`
 * hanya pernah muncul sebagai BENTUK keluaran yang boleh ditulis, dan tidak
 * pernah ada ATURAN yang mewajibkannya. Model pun menceritakan perubahan tanpa
 * mengirim peristiwanya.
 *
 * Yang dijaga di sini adalah keberadaan ATURAN-nya, bukan gaya bahasanya. Hapus
 * salah satu aturan, dan uji ini memerah.
 */
describe('lapisan gambar mengikuti isi cerita', () => {
  it('mewajibkan hideCharacter saat narasi menceritakan tokoh pergi', () => {
    /*
     * BUKTI MUTASI: hapus aturan 43 dari STORY_SYSTEM_PROMPT, lalu uji ini
     * memerah.
     */
    expect(STORY_SYSTEM_PROMPT).toContain('43.');
    expect(STORY_SYSTEM_PROMPT).toContain('LEAVES');
    expect(STORY_SYSTEM_PROMPT).toContain('hideCharacter');
    // Aturan itu harus berupa KEWAJIBAN, bukan saran.
    expect(STORY_SYSTEM_PROMPT).toContain('you MUST emit');
  });

  it('mewajibkan showCharacter sebelum tokoh yang belum tampil berbicara', () => {
    // Tokoh yang tidak terlihat tidak boleh bicara — kalau tidak, pemain
    // mendengar suara tanpa sosok.
    expect(STORY_SYSTEM_PROMPT).toContain('44.');
    expect(STORY_SYSTEM_PROMPT).toContain('BEFORE their first line');
  });

  it('mewajibkan ekspresi baru saat narasi menceritakan perubahan rupa', () => {
    /*
     * Inilah aturan yang mencegah "teks bilang tatapan sinis, gambar tersenyum".
     */
    expect(STORY_SYSTEM_PROMPT).toContain('45.');
    expect(STORY_SYSTEM_PROMPT).toContain('LOOKS');
    expect(STORY_SYSTEM_PROMPT).toContain('Reusing the previous expression');
  });

  it('melarang menceritakan perubahan rupa yang tidak dapat dikirim sebagai peristiwa', () => {
    // Tanpa ini, model menulis wajah yang tidak punya ekspresinya, dan gambar
    // terpaksa berbohong.
    expect(STORY_SYSTEM_PROMPT).toContain('46.');
    expect(STORY_SYSTEM_PROMPT).toContain('Only describe a visual change');
  });

  it('TIDAK menyebut nama ekspresi tertentu di dalam aturannya', () => {
    /*
     * Ekspresi adalah DATA yang ditulis admin. Aturan yang menyebut satu nama
     * ekspresi akan menyimpang dari dunia mana pun yang memakai nama berbeda.
     */
    const aturan = STORY_SYSTEM_PROMPT.slice(STORY_SYSTEM_PROMPT.indexOf('43.'));
    for (const terlarang of ['"senyum"', '"marah"', '"sedih"', '"dasar"']) {
      expect(aturan).not.toContain(terlarang);
    }
  });
});
