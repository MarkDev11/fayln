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

import {
  buildStoryUserPrompt,
  MAX_BEAT_WORDS,
  MAX_SCENE_BEATS,
  STORY_SYSTEM_PROMPT,
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
  playerAction: null,
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
    expect(pesan).toContain('senyum, kesal');
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
