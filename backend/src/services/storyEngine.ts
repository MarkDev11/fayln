/**
 * Mesin cerita.
 *
 * Status: **placeholder yang jujur.** Penyedia model belum diputuskan (O-08a/O-08b),
 * jadi implementasi ini menghasilkan giliran yang deterministik dan menandai
 * dirinya `simulator: true` di setiap envelope.
 *
 * Antarmuka ini sengaja ditulis sekarang supaya ketika model dipilih, yang berubah
 * hanya isi `generateTurn` — bukan route, bukan skema, bukan kontrak.
 *
 * Yang TIDAK boleh dilakukan mesin ini:
 * - Mengembalikan perintah yang tidak ada di daftar event (FR-55).
 * - Mengubah tier, kuota, atau menjalankan kode.
 * - Mengarang aset yang tidak ada di manifest dunia.
 */

import type { AssetManifest, Beat, ChoiceOption, NPCPublicDTO, StoryEvent } from '../contracts/types';

export type StoryContext = {
  worldTitle: string;
  premise: string;
  /**
   * Lokasi pembuka yang DIPILIH ADMIN, bila ada.
   *
   * Ini satu-satunya sumber yang benar-benar tahu;  hanya menebak.
   */
  openingLocationId?: string | null;
  /** Nama lokasi pembuka; dipakai mencocokkan label latar. */
  openingLocationLabel?: string | null;
  characters: NPCPublicDTO[];
  manifest: AssetManifest;
  personaName: string;
  /** Aksi bebas pemain, bila giliran ini berasal dari input teks. */
  customText?: string;
  /** Opsi yang dipilih, bila giliran ini berasal dari pilihan. */
  optionId?: string;
  /** Nomor turn, dipakai membuat ID yang stabil. */
  turnOrdinal: number;
  /**
   * Awalan ID beat yang dijamin unik secara global.
   *
   * WAJIB diisi pemanggil yang menyimpan hasilnya. `beats.beat_id` adalah kunci
   * utama tabel, bukan kunci gabungan, sehingga ID yang hanya berbasis nomor turn
   * akan bertabrakan antar perjalanan — pembukaan setiap perjalanan sama-sama
   * menghasilkan `t001-b001`, dan perjalanan kedua gagal disimpan.
   *
   * Bila kosong, awalan diturunkan dari `turnOrdinal`. Itu hanya aman untuk
   * pemakaian sekali jalan (mis. pengujian mesin), bukan untuk penyimpanan.
   */
  beatIdPrefix?: string;
};

export type StoryEngineResult = {
  beats: { beatId: string; sequence: number; event: StoryEvent }[];
  usage: { promptTokens: number; completionTokens: number; chargedTotal: number };
  modelId: string;
  modelVersion: string;
};

export interface StoryEngine {
  readonly isSimulator: boolean;
  /**
   * Perkiraan biaya satu giliran, dipakai untuk memutuskan SEBELUM memanggil
   * model apakah kuota pemain cukup (FR-50). Tanpa ini, generasi tetap berjalan
   * lalu menagih melebihi batas paket.
   */
  readonly estimatedTurnCost: number;
  generateOpening(context: StoryContext): Promise<StoryEngineResult>;
  generateTurn(context: StoryContext): Promise<StoryEngineResult>;
}

/**
 * Apakah mesin cerita yang TERPASANG masih simulator.
 *
 * Satu sumber kebenaran untuk tiga tempat yang harus sependapat: penanda
 * `simulator` pada setiap envelope, `storyEngine.simulator` pada `/v1/meta`
 * (yang dibaca pemain), dan kartu mesin cerita di panel admin. Menuliskannya
 * tiga kali di tiga berkas berarti tiga tempat yang dapat berbohong sendiri.
 *
 * Penanda ini bukan pengaturan: mengubahnya tidak mengubah mesin yang
 * dijalankan. Yang bisa diubah dari panel adalah pengaturan
 * `engine.simulator`, yang hanya menandai niat — karena itu panel
 * menampilkan keduanya dan memperingatkan bila keduanya tidak sejalan.
 */
export const STORY_ENGINE_IS_SIMULATOR = true;

/** Model simulasi. Bukan nama model produksi dan bukan janji apa pun. */
export const SIMULATOR_MODEL_ID = 'simulator/deterministic-v1';
const SIMULATOR_MODEL_VERSION = '1.0.0';

/** Perkiraan token satu giliran pada simulator; bukan tokenisasi model nyata. */
const SIM_PROMPT_TOKENS = 18_240;
const SIM_COMPLETION_TOKENS = 640;

/**
 * Awalan ID beat untuk satu giliran.
 *
 * `beats.beat_id` adalah kunci utama tabel, jadi awalan ini harus unik secara
 * global. Pemanggil yang menyimpan hasilnya memberi `beatIdPrefix` (biasanya ID
 * turn yang sesungguhnya). Tanpa itu, dipakai nomor turn — cukup untuk pengujian
 * mesin, tetapi akan bertabrakan bila hasilnya disimpan lebih dari sekali.
 */
/**
 * Jumlah kata terbanyak dalam satu balok narasi.
 *
 * Dua puluh lima dipilih pemilik produk: itu yang terbaca dalam satu kotak dialog
 * di layar ponsel tanpa menggulir. Premis 376 kata menjadi sekitar lima belas
 * potongan, dan pemain menekan untuk lanjut antar potongan.
 */
const MAKS_KATA_NARASI = 25;

/**
 * Memecah teks menjadi potongan pendek, sedekat mungkin dengan batas kalimat.
 *
 * Memotong tepat di 25 kata akan memutus kalimat di tengah, dan pembaca
 * menyadarinya. Karena itu kalimat dikelompokkan: satu kalimat ditambahkan selama
 * totalnya belum melewati batas. Kalimat yang sendirinya lebih panjang dari batas
 * tetap dipotong per kata — lebih baik terpotong daripada tidak terbaca.
 */
export function potongNarasi(teks: string, maksKata = MAKS_KATA_NARASI): string[] {
  const bersih = teks.trim();
  if (bersih.length === 0) {
    return [];
  }

  // Paragraf dihormati lebih dulu: pemisah paragraf selalu memulai potongan baru.
  const potongan: string[] = [];

  for (const paragraf of bersih.split(/\n\s*\n/)) {
    const kalimat = paragraf
      .split(/(?<=[.!?…])\s+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    let sedang: string[] = [];
    let jumlah = 0;

    const tutup = () => {
      if (sedang.length > 0) {
        potongan.push(sedang.join(' '));
        sedang = [];
        jumlah = 0;
      }
    };

    for (const satu of kalimat) {
      const kata = satu.split(/\s+/).filter(Boolean);

      if (kata.length > maksKata) {
        tutup();
        for (let i = 0; i < kata.length; i += maksKata) {
          potongan.push(kata.slice(i, i + maksKata).join(' '));
        }
        continue;
      }

      if (jumlah + kata.length > maksKata) {
        tutup();
      }
      sedang.push(satu);
      jumlah += kata.length;
    }

    tutup();
  }

  return potongan;
}

/** Kata yang terlalu umum untuk dipakai mencocokkan latar dengan cerita. */
const KATA_UMUM = new Set([
  'dan', 'atau', 'yang', 'di', 'ke', 'dari', 'dengan', 'untuk', 'pada', 'saat',
  'itu', 'ini', 'dalam', 'adalah', 'akan', 'tidak', 'juga', 'sudah', 'masih',
  'the', 'and', 'with', 'yang', 'sebuah', 'para', 'lebih', 'bisa', 'kamu',
]);

/** Kata bermakna dari sebuah label atau teks, untuk pencocokan. */
function kataBermakna(teks: string): string[] {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((k) => k.length >= 4 && !KATA_UMUM.has(k));
}

/**
 * Memilih latar yang LABELNYA paling cocok dengan narasinya.
 *
 * Ini TEBAKAN, bukan pengetahuan: mesin cerita tidak memahami gambar. Tetapi
 * tebakan yang memakai bukti kata mengalahkan entri pertama menurut urutan
 * master, yang jelas tidak ada hubungannya dengan isi cerita.
 *
 * Bila tidak ada satu pun kata yang cocok, entri pertama dikembalikan — sama
 * seperti sebelumnya, tetapi setidaknya tidak lebih buruk, dan pemanggilnya dapat
 * melihat bahwa tidak ada dasar untuk memilih.
 */
export function pilihLatar(
  manifest: AssetManifest,
  teks: string,
  labelPilihan?: string | null,
): string | undefined {
  const latar = manifest.backgrounds;
  if (latar.length === 0) {
    return undefined;
  }

  /*
   * Pilihan admin MENANG atas tebakan apa pun.
   *
   * Ia satu-satunya sumber yang benar-benar tahu; pencocokan kata di bawah hanya
   * menebak, dan sudah terbukti tertipu kata umum seperti "ruang" — narasi
   * "ruang terbuka" cocok dengan label "Ruang Kelas Penuh Cahaya".
   */
  if (labelPilihan) {
    const cocok = latar.find(
      (item) => item.label.trim().toLowerCase() === labelPilihan.trim().toLowerCase(),
    );
    if (cocok) {
      return cocok.assetId;
    }
  }

  const kataCerita = new Set(kataBermakna(teks));

  let terbaik = latar[0]?.assetId;
  let skorTerbaik = 0;

  for (const item of latar) {
    const skor = kataBermakna(item.label).filter((k) => kataCerita.has(k)).length;
    if (skor > skorTerbaik) {
      skorTerbaik = skor;
      terbaik = item.assetId;
    }
  }

  return terbaik;
}

/**
 * Awalan ID beat: dari pemanggil bila ada, selain itu dari nomor turn.
 *
 * Lihat catatan pada `StoryContext.beatIdPrefix` — `beats.beat_id` adalah kunci
 * utama tabel, bukan kunci gabungan, sehingga awalan yang hanya berbasis nomor
 * turn akan bertabrakan antar perjalanan.
 */
function beatIdScope(context: StoryContext): string {
  const prefix = context.beatIdPrefix?.trim();
  if (prefix && prefix.length > 0) {
    return prefix;
  }
  return `t${String(context.turnOrdinal).padStart(3, '0')}`;
}

function choiceOptions(): [ChoiceOption, ChoiceOption, ChoiceOption] {
  return [
    {
      optionId: 'opt1',
      label: 'Minta maaf secara profesional',
      description: 'Akui keterlambatan tanpa membela diri, lalu tanyakan arahan kerja.',
    },
    {
      optionId: 'opt2',
      label: 'Jelaskan singkat dan minta arahan',
      description: 'Sebut alasan seperlunya, lalu fokus pada pekerjaan yang harus dimulai.',
    },
    {
      optionId: 'opt3',
      label: 'Coba meredakan dengan humor',
      description: 'Pakai nada ringan untuk mencairkan suasana, dengan risiko ditanggapi dingin.',
    },
  ];
}

/**
 * Label opsi berdasarkan ID-nya.
 *
 * ID opsi hanya bermakna di dalam satu giliran, jadi labelnya tidak disimpan di
 * database. Saat pemain memilih, narasinya perlu menyebut tindakan yang dipilih —
 * karena itu label dicari di sini. ID yang tidak dikenal dikembalikan apa adanya
 * supaya masalahnya terlihat, bukan tersamarkan menjadi kutipan kosong.
 */
function optionLabel(optionId: string | undefined): string {
  if (!optionId) {
    return 'pilihan yang tidak dikenal';
  }
  const match = choiceOptions().find((option) => option.optionId === optionId);
  return match ? match.label : optionId;
}

/**
 * Mengubah aksi bebas menjadi respons.
 *
 * Aksi pemain adalah UPAYA, bukan perintah yang pasti berhasil (FR-57). Aksi yang
 * melewati batas profesional menghasilkan teguran dan menaikkan kewaspadaan —
 * bukan kepatuhan.
 */
function customActionBeats(
  turnId: string,
  context: StoryContext,
): { beatId: string; sequence: number; event: StoryEvent }[] {
  const text = (context.customText ?? '').toLowerCase();
  const crossing =
    text.includes('kabedon') ||
    text.includes('mendekati') ||
    text.includes('menyentuh') ||
    text.includes('menarik');

  const primary = context.characters[0];
  const secondary = context.characters[1];

  const events: StoryEvent[] = [];

  if (crossing && primary) {
    events.push({
      type: 'narrate',
      text: 'Kamu mendekat melewati jarak yang pantas di lingkungan kerja. Ia tidak mundur, tetapi sorot matanya berubah.',
    });
    events.push({
      type: 'showCharacter',
      npcId: primary.npcId,
      expression: primary.expressions.includes('kesal') ? 'kesal' : (primary.expressions[0] ?? 'netral'),
      assetId: primary.defaultPortraitAssetId,
    });
    events.push({
      type: 'say',
      npcId: primary.npcId,
      text: 'Sikapmu masih sama saja seperti dulu. Satu kali lagi, aku tidak akan sekadar menegur.',
    });
    events.push({
      type: 'relationshipDelta',
      npcId: primary.npcId,
      status: 'waspada',
      reasonPublic: 'Ia menilai perilakumu melewati batas profesional.',
    });

    if (secondary) {
      events.push({
        type: 'showCharacter',
        npcId: secondary.npcId,
        expression: secondary.expressions[0] ?? 'netral',
        assetId: secondary.defaultPortraitAssetId,
      });
      events.push({
        type: 'say',
        npcId: secondary.npcId,
        text: 'Haha, kalian ini masih saja seperti dulu.',
      });
    }
  } else if (primary) {
    // Dua jenis masukan harus dibedakan. Sebelumnya keduanya memakai
    // `context.customText`, sehingga pemain yang MEMILIH OPSI menghasilkan
    // narasi dengan kutipan kosong: `Kamu memilih bertindak: ""`.
    const narration =
      context.customText !== undefined
        ? `Kamu memilih bertindak: "${context.customText}". Ia memperhatikanmu sebentar sebelum menanggapi.`
        : `Kamu memilih: "${optionLabel(context.optionId)}". Ia memperhatikanmu sebentar sebelum menanggapi.`;

    events.push({
      type: 'narrate',
      text: narration,
    });
    events.push({
      type: 'showCharacter',
      npcId: primary.npcId,
      expression: primary.expressions[0] ?? 'netral',
      assetId: primary.defaultPortraitAssetId,
    });
    events.push({
      type: 'say',
      npcId: primary.npcId,
      text: 'Baik. Kita lihat apakah caramu itu berguna untuk pekerjaan ini.',
    });
    events.push({
      type: 'relationshipDelta',
      npcId: primary.npcId,
      status: 'normal',
      reasonPublic: 'Ia belum menilai tindakanmu sebagai pelanggaran.',
    });
  }

  events.push({
    type: 'presentChoices',
    decisionId: `d${String(context.turnOrdinal).padStart(3, '0')}`,
    prompt: 'Apa yang kamu lakukan berikutnya?',
    options: choiceOptions(),
  });

  return events.map((event, index) => ({
    beatId: `${turnId}-b${String(index + 1).padStart(3, '0')}`,
    sequence: index + 1,
    event,
  }));
}

export class DeterministicStoryEngine implements StoryEngine {
  readonly isSimulator = true;
  readonly estimatedTurnCost = SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS;

  async generateOpening(context: StoryContext): Promise<StoryEngineResult> {
    const turnId = beatIdScope(context);
    const primary = context.characters[0];

    const events: StoryEvent[] = [];

    /*
     * Latar pembuka DIPILIH, bukan diambil yang pertama.
     *
     * Bentuk lamanya memakai `backgrounds[0]` — entri pertama menurut urutan
     * master, yang tidak ada hubungannya dengan isi cerita. Akibatnya adegan
     * kantor tampil dengan latar "Balkon Apartemen Saat Senja", dan pemilik
     * produk menyebutnya "ngaco parah".
     *
     * Yang dipakai sekarang: latar yang LABELNYA paling banyak berbagi kata
     * dengan narasinya. Itu tebakan, bukan pengetahuan — mesin ini tidak
     * memahami gambar. Tetapi tebakan yang memakai bukti mengalahkan entri
     * pertama yang jelas salah.
     */
    const latarPembuka = pilihLatar(
      context.manifest,
      context.premise,
      context.openingLocationLabel ?? null,
    );
    if (latarPembuka) {
      events.push({ type: 'setBackground', assetId: latarPembuka });
    }

    /*
     * Narasi dipecah menjadi potongan pendek.
     *
     * Premis bisa 376 kata, dan menyiramkannya sebagai satu balok membuat pemain
     * menerima dinding teks di layar ponsel. Setiap potongan menjadi PERISTIWA
     * sendiri — dan setiap peristiwa menjadi BEAT sendiri — sehingga klien
     * menampilkannya satu per satu tanpa perlu diubah.
     */
    for (const potongan of potongNarasi(context.premise)) {
      events.push({ type: 'narrate', text: potongan });
    }

    /*
     * TIDAK ada pergantian latar di sini.
     *
     * Bentuk lamanya memasang latar pertama, membacakan narasi, lalu LANGSUNG
     * menggantinya dengan latar kedua. Karena seluruh peristiwa satu giliran
     * diterapkan bersamaan, latar pertama tidak pernah sempat terlihat — dan
     * narasi tentang kantor dibacakan di atas latar yang lain sama sekali.
     */

    if (primary) {
      events.push({
        type: 'showCharacter',
        npcId: primary.npcId,
        expression: primary.expressions[0] ?? 'netral',
        assetId: primary.defaultPortraitAssetId,
      });
      events.push({
        type: 'say',
        npcId: primary.npcId,
        text: `${context.personaName}. Kita mulai dari sini.`,
      });
    }

    events.push({
      type: 'presentChoices',
      decisionId: 'd001',
      prompt: 'Apa langkah pertamamu?',
      options: choiceOptions(),
    });

    return {
      beats: events.map((event, index) => ({
        beatId: `${turnId}-b${String(index + 1).padStart(3, '0')}`,
        sequence: index + 1,
        event,
      })),
      usage: {
        promptTokens: SIM_PROMPT_TOKENS,
        completionTokens: SIM_COMPLETION_TOKENS,
        chargedTotal: SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS,
      },
      modelId: SIMULATOR_MODEL_ID,
      modelVersion: SIMULATOR_MODEL_VERSION,
    };
  }

  async generateTurn(context: StoryContext): Promise<StoryEngineResult> {
    const turnId = beatIdScope(context);
    const beats = customActionBeats(turnId, context);

    return {
      beats,
      usage: {
        promptTokens: SIM_PROMPT_TOKENS,
        completionTokens: SIM_COMPLETION_TOKENS,
        chargedTotal: SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS,
      },
      modelId: SIMULATOR_MODEL_ID,
      modelVersion: SIMULATOR_MODEL_VERSION,
    };
  }
}

/** Beat yang boleh diputar frontend. Dipakai memastikan mesin tidak keluar jalur. */
export const ALLOWED_EVENT_TYPES: readonly StoryEvent['type'][] = [
  'setBackground',
  'showCharacter',
  'hideCharacter',
  'say',
  'narrate',
  'presentChoices',
  'relationshipDelta',
  'setFlag',
  'memoryWrite',
  'endArc',
];

export type BeatValidationIssue = { beatId: string; reason: string };

/**
 * Memvalidasi keluaran mesin terhadap dunia SEBELUM disimpan.
 *
 * Ini pengaman utama FR-55: model tidak boleh menyebut aset, karakter, atau tipe
 * event yang tidak ada. Keluaran yang gagal tidak disimpan sama sekali.
 */
export function validateEngineBeats(
  beats: { beatId: string; sequence: number; event: StoryEvent }[],
  context: StoryContext,
): BeatValidationIssue[] {
  const issues: BeatValidationIssue[] = [];
  const npcIds = new Set(context.characters.map((character) => character.npcId));
  const backgroundIds = new Set(context.manifest.backgrounds.map((asset) => asset.assetId));

  let lastSequence = 0;

  for (const beat of beats) {
    const event = beat.event;

    if (!ALLOWED_EVENT_TYPES.includes(event.type)) {
      issues.push({ beatId: beat.beatId, reason: `Tipe event tidak diizinkan: ${event.type}` });
      continue;
    }

    if (beat.sequence <= lastSequence) {
      issues.push({ beatId: beat.beatId, reason: 'Urutan beat tidak menaik.' });
    }
    lastSequence = beat.sequence;

    switch (event.type) {
      case 'setBackground':
        if (!backgroundIds.has(event.assetId)) {
          issues.push({ beatId: beat.beatId, reason: `Latar tidak ada di manifest: ${event.assetId}` });
        }
        break;
      case 'showCharacter':
      case 'say':
      case 'hideCharacter':
      case 'relationshipDelta':
        if (!npcIds.has(event.npcId)) {
          issues.push({ beatId: beat.beatId, reason: `Karakter tidak ada di dunia: ${event.npcId}` });
        }
        if (event.type === 'relationshipDelta' && event.reasonPublic.trim().length === 0) {
          issues.push({ beatId: beat.beatId, reason: 'Perubahan hubungan tanpa alasan publik.' });
        }
        break;
      case 'presentChoices':
        if (event.options.length !== 3) {
          issues.push({ beatId: beat.beatId, reason: 'Keputusan harus berisi tepat tiga opsi.' });
        }
        break;
      default:
        break;
    }
  }

  return issues;
}

/** Dipakai pengujian dan route untuk memastikan tipe Beat tetap konsisten. */
export type EngineBeat = Beat;
