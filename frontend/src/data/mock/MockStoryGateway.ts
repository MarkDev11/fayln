/**
 * MockStoryGateway — simulator deterministik.
 *
 * Tujuan: membuktikan seluruh alur frontend tanpa backend, tanpa jaringan, dan
 * tanpa biaya model. Setiap respons membawa penanda `simulator: true` supaya UI
 * tidak pernah mengklaim ini AI produksi (NFR-16, R-16).
 *
 * Determinitas: seed yang sama menghasilkan beat, opsi, dan usage yang sama
 * (FR-57, docs/11 §2).
 */

import {
  FIXTURE_SEED,
  allWorlds,
  findWorld,
  toCatalogItem,
  worldBoskuMantan,
} from './fixtures';

import {
  StoryGatewayError,
  type CatalogPage,
  type CatalogQuery,
  type CreateJourneyInput,
  type CreateJourneyResult,
  type FaultMode,
  type JourneySession,
  type OperationStatus,
  type ReadProgressInput,
  type ReportInput,
  type ReportResult,
  type StoryGateway,
  type SubmitChoiceInput,
  type SubmitCustomInput,
  type TopWorldsPage,
  type RankedWorldItem,
  type UpdatedWorldItem,
} from '../gateway';

import type {
  Beat,
  GenreId,
  GenreOption,
  JourneyDetailDTO,
  JourneySummary,
  RelationEntry,
  StoryEvent,
  TurnResultEnvelope,
  UsageDTO,
  WorldCatalogItem,
  WorldDetailDTO,
} from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Konstanta simulasi                                                  */
/* ------------------------------------------------------------------ */

/** Nama model simulasi. Bukan nama model produksi dan bukan janji apa pun. */
export const SIMULATOR_MODEL_ID = 'simulator/deterministic-v1';

export const FREE_CONTEXT_WINDOW = 64_000;
export const PAID_CONTEXT_WINDOW = 256_000;
export const FREE_DAILY_ALLOWANCE = 100_000;

/** Perkiraan biaya satu giliran pada simulator, bukan tokenisasi model nyata. */
const SIM_PROMPT_TOKENS = 18_240;
const SIM_COMPLETION_TOKENS = 640;

const SLOW_DELAY_MS = 10_000;

/**
 * Label genre contoh, dengan nama yang sama seperti yang di-seed server.
 *
 * Disimpan di sini karena gateway contoh harus dapat menjawab `/v1/genres`
 * tanpa server. Isinya SENGAJA sama dengan `009_genres.sql` — bila keduanya
 * berselisih, uji akan lulus dengan label yang tidak pernah dilihat pemain.
 */
const MOCK_GENRE_LABELS: Record<string, { labelId: string; labelEn: string }> = {
  romance: { labelId: 'Romansa', labelEn: 'Romance' },
  drama: { labelId: 'Drama', labelEn: 'Drama' },
  office: { labelId: 'Kehidupan Kantor', labelEn: 'Office Life' },
  fantasy: { labelId: 'Fantasi', labelEn: 'Fantasy' },
  mystery: { labelId: 'Misteri', labelEn: 'Mystery' },
};

/** Urutan tampil chip. Sama dengan urutan `position` di tabel genre. */
const MOCK_GENRE_ORDER: GenreId[] = ['romance', 'drama', 'office', 'fantasy', 'mystery'];

/** Bentuk laporan yang dicatat simulator. */
export type RecordedReport = ReportInput & { reportId: string };

/* ------------------------------------------------------------------ */
/* Pembangun beat                                                      */
/* ------------------------------------------------------------------ */

function buildBeats(turnId: string, events: StoryEvent[]): Beat[] {
  return events.map((event, index) => ({
    beatId: `${turnId}-b${String(index + 1).padStart(3, '0')}`,
    turnId,
    sequence: index + 1,
    event,
  }));
}

/**
 * Giliran pembuka dunia `w_bosku-mantan`.
 * Mengikuti storyboard docs/11 §1 langkah 1–4.
 */
export function buildOpeningBeats(turnId = 't001'): Beat[] {
  return buildBeats(turnId, [
    { type: 'setBackground', assetId: 'bg_gedung_luar' },
    {
      type: 'narrate',
      text:
        'Pagi itu kamu berdiri di depan gedung perusahaan AAA. Ini hari pertamamu bekerja, dan kamu belum tahu siapa yang akan kamu temui di dalam.',
    },
    { type: 'setBackground', assetId: 'bg_kantor_dalam' },
    {
      type: 'narrate',
      text: 'Kamu hampir telat masuk kantor pertamamu. Lift terbuka, dan lorong itu terasa jauh lebih panjang dari biasanya.',
    },
    { type: 'showCharacter', npcId: 'npc_elysia', expression: 'kesal', assetId: 'p_elysia_kesal' },
    {
      type: 'say',
      npcId: 'npc_elysia',
      text:
        'Oh, jadi kamu anak barunya. Baru masuk sudah hampir telat. Kamu sudah tahu job desk kamu ngapain, kan?',
    },
    {
      type: 'presentChoices',
      decisionId: 'd001',
      prompt: 'Bagaimana kamu merespons?',
      options: [
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
      ],
    },
  ]);
}

/** Respons untuk pilihan profesional (opt1). */
function buildApologeticBeats(turnId: string): Beat[] {
  return buildBeats(turnId, [
    { type: 'showCharacter', npcId: 'npc_elysia', expression: 'netral', assetId: 'p_elysia_netral' },
    {
      type: 'narrate',
      text:
        'Kamu memilih mengakui kesalahan tanpa membela diri. Elysia menatapmu sebentar, lalu mengangguk kecil.',
    },
    {
      type: 'say',
      npcId: 'npc_elysia',
      text:
        'Bagus. Setidaknya kamu tahu kapan harus berhenti beralasan. Meja kamu di ujung, dokumen onboarding sudah menunggu.',
    },
    {
      type: 'relationshipDelta',
      npcId: 'npc_elysia',
      status: 'normal',
      reasonPublic: 'Elysia menilai kamu menanggapi teguran dengan sikap profesional.',
    },
    {
      type: 'say',
      npcId: 'npc_elysia',
      text: 'Satu lagi. Jangan ulangi keterlambatan ini.',
    },
    {
      type: 'presentChoices',
      decisionId: 'd002',
      prompt: 'Apa langkahmu selanjutnya?',
      options: [
        {
          optionId: 'opt1',
          label: 'Langsung menuju meja',
          description: 'Mulai bekerja dan tunjukkan hasil secepat mungkin.',
        },
        {
          optionId: 'opt2',
          label: 'Tanya rekan terdekat',
          description: 'Cari tahu alur kerja tim sebelum mengerjakan apa pun.',
        },
        {
          optionId: 'opt3',
          label: 'Perhatikan suasana kantor',
          description: 'Amati siapa saja yang tampak tidak nyaman pagi ini.',
        },
      ],
    },
  ]);
}

/** Respons untuk penjelasan singkat (opt2). */
function buildBriefBeats(turnId: string): Beat[] {
  return buildBeats(turnId, [
    { type: 'showCharacter', npcId: 'npc_elysia', expression: 'netral', assetId: 'p_elysia_netral' },
    {
      type: 'narrate',
      text: 'Kamu menyebut alasanmu seperlunya, lalu langsung bertanya apa yang harus dikerjakan.',
    },
    {
      type: 'say',
      npcId: 'npc_elysia',
      text:
        'Alasanmu tidak penting untukku. Yang penting kamu tahu harus mulai dari mana. Ikuti Leo, dia yang mengurus onboarding.',
    },
    {
      type: 'relationshipDelta',
      npcId: 'npc_elysia',
      status: 'normal',
      reasonPublic: 'Elysia menghargai kamu yang langsung fokus ke pekerjaan.',
    },
    { type: 'showCharacter', npcId: 'npc_leo', expression: 'senang', assetId: 'p_leo_senang' },
    {
      type: 'say',
      npcId: 'npc_leo',
      text: 'Siap, Bos. Hei, kamu yang baru kan? Sini, aku tunjukkan tempatnya.',
    },
    {
      type: 'presentChoices',
      decisionId: 'd002',
      prompt: 'Bagaimana kamu menanggapi Leo?',
      options: [
        {
          optionId: 'opt1',
          label: 'Ikut dengan ramah',
          description: 'Terima bantuan dan berkenalan secara wajar.',
        },
        {
          optionId: 'opt2',
          label: 'Tanya tentang Elysia',
          description: 'Cari tahu bagaimana sebenarnya atasanmu itu.',
        },
        {
          optionId: 'opt3',
          label: 'Amati dulu sebelum bicara',
          description: 'Dengarkan lebih banyak daripada berbicara.',
        },
      ],
    },
  ]);
}

/** Respons untuk humor yang meleset (opt3). */
function buildHumorBeats(turnId: string): Beat[] {
  return buildBeats(turnId, [
    { type: 'showCharacter', npcId: 'npc_elysia', expression: 'kesal', assetId: 'p_elysia_kesal' },
    {
      type: 'narrate',
      text: 'Kamu mencoba meredakan suasana dengan nada ringan. Suasana justru membeku.',
    },
    {
      type: 'say',
      npcId: 'npc_elysia',
      text:
        'Kalau kamu pikir ini lucu, kita mulai dengan pemahaman yang berbeda soal bekerja di sini. Selesaikan onboarding, lalu lapor ke aku.',
    },
    {
      type: 'relationshipDelta',
      npcId: 'npc_elysia',
      status: 'waspada',
      reasonPublic: 'Elysia menilai nada bercandamu tidak pas untuk hari pertama.',
    },
    {
      type: 'presentChoices',
      decisionId: 'd002',
      prompt: 'Bagaimana kamu memperbaiki keadaan?',
      options: [
        {
          optionId: 'opt1',
          label: 'Minta maaf dengan tulus',
          description: 'Akui bahwa nada itu salah tempat.',
        },
        {
          optionId: 'opt2',
          label: 'Diam dan mulai bekerja',
          description: 'Biarkan hasil kerja yang berbicara.',
        },
        {
          optionId: 'opt3',
          label: 'Cari Leo untuk memahami budaya tim',
          description: 'Tanyakan apa yang sebaiknya kamu lakukan.',
        },
      ],
    },
  ]);
}

/**
 * Respons aksi bebas. Tindakan pemain adalah UPAYA, bukan perintah yang pasti berhasil.
 * Aksi yang melewati batas profesional mendapat teguran dan menaikkan kewaspadaan.
 */
function buildCustomBeats(turnId: string, customText: string): Beat[] {
  const normalized = customText.toLowerCase();
  const isBoundaryCrossing =
    normalized.includes('kabedon') ||
    normalized.includes('mendekati') ||
    normalized.includes('menyentuh') ||
    normalized.includes('menarik');

  if (isBoundaryCrossing) {
    return buildBeats(turnId, [
      {
        type: 'narrate',
        text:
          'Kamu mendekat ke arah Elysia, melewati jarak yang pantas di lingkungan kerja. Ia tidak mundur, tetapi sorot matanya berubah.',
      },
      { type: 'showCharacter', npcId: 'npc_elysia', expression: 'kesal', assetId: 'p_elysia_kesal' },
      {
        type: 'say',
        npcId: 'npc_elysia',
        text:
          'Sikapmu masih sama saja seperti dulu. Satu kali lagi kamu melakukan ini, aku tidak akan sekadar menegur.',
      },
      {
        type: 'relationshipDelta',
        npcId: 'npc_elysia',
        status: 'waspada',
        reasonPublic: 'Elysia menilai perilakumu melewati batas profesional.',
      },
      { type: 'showCharacter', npcId: 'npc_leo', expression: 'senang', assetId: 'p_leo_senang' },
      {
        type: 'say',
        npcId: 'npc_leo',
        text:
          'Haha, kalian ini masih saja seperti dulu. Mendingan kalian balikan lagi kayak waktu kuliah.',
      },
      {
        type: 'showCharacter',
        npcId: 'npc_elysia',
        expression: 'tercengang',
        assetId: 'p_elysia_tercengang',
      },
      {
        type: 'say',
        npcId: 'npc_elysia',
        text: 'Hah, apa maksudmu, Leo? Aku balikan sama dia? Ogah banget balik sama dia.',
      },
      { type: 'showCharacter', npcId: 'npc_leo', expression: 'netral', assetId: 'p_leo_netral' },
      {
        type: 'say',
        npcId: 'npc_leo',
        text: 'Ya sudah, aku cuma mengingatkan. Yang penting sekarang kalian kerja dulu.',
      },
      {
        type: 'presentChoices',
        decisionId: 'd002',
        prompt: 'Bagaimana kamu menanggapi situasi ini?',
        options: [
          {
            optionId: 'opt1',
            label: 'Mundur dan minta maaf',
            description: 'Sadari batasnya dan perbaiki posisimu di depan Elysia.',
          },
          {
            optionId: 'opt2',
            label: 'Bela diri di depan Leo',
            description: 'Jelaskan bahwa kamu tidak bermaksud seperti yang mereka pikir.',
          },
          {
            optionId: 'opt3',
            label: 'Diam dan kembali bekerja',
            description: 'Tinggalkan percakapan tanpa memperkeruh keadaan.',
          },
        ],
      },
    ]);
  }

  return buildBeats(turnId, [
    {
      type: 'narrate',
      text: `Kamu memilih bertindak: "${customText}". Elysia memperhatikanmu sebentar sebelum menanggapi.`,
    },
    { type: 'showCharacter', npcId: 'npc_elysia', expression: 'netral', assetId: 'p_elysia_netral' },
    {
      type: 'say',
      npcId: 'npc_elysia',
      text: 'Baik. Kita lihat apakah caramu itu berguna untuk pekerjaan ini.',
    },
    {
      type: 'relationshipDelta',
      npcId: 'npc_elysia',
      status: 'normal',
      reasonPublic: 'Elysia belum menilai tindakanmu sebagai pelanggaran.',
    },
    {
      type: 'presentChoices',
      decisionId: 'd002',
      prompt: 'Apa yang kamu lakukan berikutnya?',
      options: [
        {
          optionId: 'opt1',
          label: 'Mulai bekerja',
          description: 'Fokus pada tugas pertama yang diberikan.',
        },
        {
          optionId: 'opt2',
          label: 'Cari Leo',
          description: 'Minta penjelasan tentang alur kerja tim.',
        },
        {
          optionId: 'opt3',
          label: 'Amati sekeliling',
          description: 'Kenali dulu siapa saja yang ada di kantor.',
        },
      ],
    },
  ]);
}

/** Giliran pembuka untuk world selain demo utama. */
function buildGenericOpening(world: WorldDetailDTO, turnId: string): Beat[] {
  const firstBackground = world.assetManifest.backgrounds[0]?.assetId;
  const firstNpc = world.characters[0];

  const events: StoryEvent[] = [];
  if (firstBackground) {
    events.push({ type: 'setBackground', assetId: firstBackground });
  }
  events.push({
    type: 'narrate',
    text: world.premise,
  });

  if (firstNpc) {
    events.push({
      type: 'showCharacter',
      npcId: firstNpc.npcId,
      expression: firstNpc.expressions[0] ?? 'netral',
      assetId: firstNpc.defaultPortraitAssetId,
    });
    events.push({
      type: 'say',
      npcId: firstNpc.npcId,
      text: 'Kita mulai dari sini. Apa yang ingin kamu lakukan?',
    });
  }

  events.push({
    type: 'presentChoices',
    decisionId: 'd001',
    prompt: 'Apa langkah pertamamu?',
    options: [
      { optionId: 'opt1', label: 'Maju dan perkenalkan diri', description: 'Ambil inisiatif lebih dulu.' },
      { optionId: 'opt2', label: 'Amati situasi', description: 'Pahami keadaan sebelum bertindak.' },
      { optionId: 'opt3', label: 'Tanya langsung', description: 'Cari kejelasan tanpa menunggu.' },
    ],
  });

  return buildBeats(turnId, events);
}

/* ------------------------------------------------------------------ */
/* Gateway                                                             */
/* ------------------------------------------------------------------ */

export type MockStoryGatewayOptions = {
  /** Menunda respons pertama untuk menguji layar menunggu. */
  faultMode?: FaultMode;
  /** Menonaktifkan jeda buatan agar pengujian cepat. */
  instant?: boolean;
  /** Kuota awal; dipakai menguji blokir anggaran (AC-24/AC-25). */
  initialSpent?: number;
};

export class MockStoryGateway implements StoryGateway {
  readonly isSimulator = true;
  readonly seed = FIXTURE_SEED;

  private faultMode: FaultMode;
  private instant: boolean;

  private spent: number;
  private reserved = 0;

  /** Idempotensi: operationId yang sama selalu menghasilkan envelope yang sama (FR-52). */
  private readonly operations = new Map<string, TurnResultEnvelope>();
  private readonly inFlight = new Map<string, Promise<TurnResultEnvelope>>();

  private readonly journeys = new Map<string, JourneyDetailDTO>();
  /** Beat canonical per perjalanan; meniru penyimpanan server. */
  private readonly journeyBeats = new Map<string, Beat[]>();
  /** Hubungan SEBELUM beat mana pun; dasar penurunan state yang boleh dilihat. */
  private readonly journeyBaseline = new Map<string, RelationEntry[]>();
  private journeyCounter = 0;
  private turnCounter = 0;
  /**
   * Stempel waktu terakhir yang diberikan.
   *
   * Dijamin menaik: dua pembaruan dalam milidetik yang sama akan menghasilkan
   * waktu yang identik, dan pengurutan daftar menjadi tidak deterministik.
   * Server sungguhan juga memberi urutan yang dapat diandalkan.
   */
  private lastTimestampMs = 0;

  /** Laporan yang diterima simulator; tidak pernah meninggalkan perangkat. */
  private readonly reports: RecordedReport[] = [];
  private reportCounter = 0;

  constructor(options: MockStoryGatewayOptions = {}) {
    this.faultMode = options.faultMode ?? 'none';
    this.instant = options.instant ?? false;
    this.spent = options.initialSpent ?? 0;
  }

  setFaultMode(mode: FaultMode): void {
    this.faultMode = mode;
  }

  getFaultMode(): FaultMode {
    return this.faultMode;
  }

  /* ---------------- Katalog ---------------- */

  /**
   * Genre yang ditawarkan, diturunkan dari katalog contoh.
   *
   * Diturunkan, bukan ditulis sebagai daftar tetap — justru itu yang sedang
   * dibuktikan di sini. Di produksi daftarnya datang dari tabel `genres`; bila
   * gateway contoh memakai daftar sendiri, uji akan lulus sementara aplikasi
   * sungguhan tidak pernah menyebut `/v1/genres` sama sekali.
   *
   * Hanya genre dari dunia TERBIT yang ikut, supaya chip yang ditawarkan selalu
   * punya isi. Dunia `retired` sengaja tidak menyumbang genre: pemain tidak dapat
   * melihatnya, jadi menawarkan genrenya hanya menyesatkan.
   */
  async fetchGenres(): Promise<GenreOption[]> {
    await this.delay(20);
    this.throwIfFault();

    const used = new Set<string>();
    for (const world of allWorlds) {
      if (world.status !== 'published') {
        continue;
      }
      for (const genre of world.genres) {
        used.add(genre);
      }
    }

    return MOCK_GENRE_ORDER.filter((genreId) => used.has(genreId)).map((genreId) => ({
      genreId,
      labelId: MOCK_GENRE_LABELS[genreId]!.labelId,
      labelEn: MOCK_GENRE_LABELS[genreId]!.labelEn,
    }));
  }

  async fetchCatalog(query: CatalogQuery): Promise<CatalogPage> {
    await this.delay(60);
    this.throwIfFault();

    const search = query.search?.trim().toLowerCase() ?? '';
    const genres = query.genres ?? [];
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const filtered: WorldCatalogItem[] = allWorlds
      .filter((world) => world.status !== 'draft')
      .map(toCatalogItem)
      .filter((item) => {
        if (search.length > 0 && !item.title.toLowerCase().includes(search)) {
          return false;
        }
        // Semantik OR: cukup satu genre yang cocok.
        if (genres.length > 0 && !genres.some((genre) => item.genres.includes(genre))) {
          return false;
        }
        return true;
      });

    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      items,
      page,
      pageSize,
      total: filtered.length,
      hasMore: start + items.length < filtered.length,
    };
  }

  async fetchWorld(worldId: string): Promise<WorldDetailDTO> {
    await this.delay(50);
    this.throwIfFault();

    const world = findWorld(worldId);
    if (!world) {
      throw new StoryGatewayError({
        code: 'VALIDATION',
        message: 'Cerita tidak ditemukan.',
        retryable: false,
      });
    }
    return world;
  }

  /**
   * Rail "Top 10 Minggu Ini" dalam mode data contoh.
   *
   * Angkanya diambil dari peta tetap di bawah — bukan dihitung dari katalog. Ini
   * disengaja: peringkat berasal dari perjalanan pemain, dan data contoh tidak
   * punya perjalanan. Nilai tetap membuat tampilan rail dapat diperiksa tanpa
   * berpura-pura telah menghitung sesuatu.
   *
   * Angkanya mencerminkan sebaran yang sama dengan seed backend
   * (`005_seed_top_weekly.sql`), supaya mode contoh dan mode produksi menampilkan
   * urutan yang sama. Bila keduanya berbeda, perbedaan tampilan akan tampak
   * seperti bug padahal hanya data yang berbeda.
   */
  async fetchTopWorlds(limit = 10): Promise<TopWorldsPage> {
    await this.delay(60);
    this.throwIfFault();

    // Perjalanan minggu ini per dunia, dari yang terbanyak.
    const startsByWorld: Record<string, number> = {
      'w_bosku-mantan': 4,
      'w_lentera-terakhir': 2,
      'w_rapat-tengah-malam': 1,
    };

    const ranked: RankedWorldItem[] = allWorlds
      .filter((world) => world.status === 'published')
      .map((world) => ({ world, startCount: startsByWorld[world.worldId] ?? 0 }))
      // Dunia tanpa perjalanan tidak ditampilkan: peringkat 0 bukan peringkat.
      .filter((entry) => entry.startCount > 0)
      .sort((a, b) => {
        if (a.startCount === b.startCount) {
          return a.world.worldId < b.world.worldId ? -1 : 1;
        }
        return b.startCount - a.startCount;
      })
      .slice(0, limit)
      .map((entry, index) => ({
        ...toCatalogItem(entry.world),
        rank: index + 1,
        startCount: entry.startCount,
      }));

    return { items: ranked, windowDays: 7 };
  }

  /** Rail "Terbaru Dirilis": urut tanggal terbit menurun. */
  async fetchNewWorlds(limit = 10): Promise<WorldCatalogItem[]> {
    await this.delay(50);
    this.throwIfFault();

    return allWorlds
      .filter((world) => world.status === 'published')
      .map(toCatalogItem)
      .sort((a, b) => {
        if (a.publishedAt === b.publishedAt) {
          return a.worldId < b.worldId ? -1 : 1;
        }
        return a.publishedAt < b.publishedAt ? 1 : -1;
      })
      .slice(0, limit);
  }

  /**
   * Rail "Baru Diperbarui" dalam mode data contoh.
   *
   * Memakai peta waktu revisi tetap, BUKAN `publishedAt`. Keduanya sengaja
   * menghasilkan urutan yang berbeda: `w_rapat-tengah-malam` TERBIT paling lama
   * tetapi direvisi paling akhir, jadi ia memuncaki rail ini dan bukan rail
   * "Terbaru Dirilis".
   *
   * Urutannya harus tetap berbeda SETELAH dunia hero dibuang — dunia pertama
   * menurut tanggal terbit disembunyikan dari kedua rail, jadi perbedaan yang
   * hanya ada di puncak akan ikut terbuang bersama hero.
   *
   * Tanggalnya tetap, bukan relatif seperti migrasi 006 di backend, karena
   * fixture memang memakai tanggal tetap. Yang dijaga sama bukan tanggal
   * persisnya, melainkan sifatnya: dua rail yang benar-benar berbeda. Bila
   * keduanya kembali kembar, mode contoh pun akan menunjukkannya.
   */
  async fetchUpdatedWorlds(limit = 10): Promise<UpdatedWorldItem[]> {
    await this.delay(50);
    this.throwIfFault();

    const revisedAt: Record<string, string> = {
      'w_rapat-tengah-malam': '2026-10-02T03:00:00.000Z',
      'w_lentera-terakhir': '2026-09-25T07:30:00.000Z',
      'w_bosku-mantan': '2026-09-20T02:00:00.000Z',
    };

    return allWorlds
      .filter((world) => world.status === 'published')
      .map((world) => ({
        ...toCatalogItem(world),
        // Dunia yang belum pernah direvisi jatuh ke tanggal terbitnya.
        updatedAt: revisedAt[world.worldId] ?? world.publishedAt,
      }))
      .sort((a, b) => {
        if (a.updatedAt === b.updatedAt) {
          return a.worldId < b.worldId ? -1 : 1;
        }
        return a.updatedAt < b.updatedAt ? 1 : -1;
      })
      .slice(0, limit);
  }

  /* ---------------- Perjalanan ---------------- */
  async fetchJourneys(): Promise<JourneySummary[]> {
    await this.delay(40);
    return [...this.journeys.values()]
      .map(({ relations, memory, presentedThroughSequence, ...summary }) => summary)
      .sort((a, b) => {
        // Pengurutan harus deterministik; stempel waktu yang sama dipecah oleh ID.
        if (a.updatedAt === b.updatedAt) {
          return a.journeyId < b.journeyId ? 1 : -1;
        }
        return a.updatedAt < b.updatedAt ? 1 : -1;
      });
  }

  async fetchJourneyDetail(journeyId: string): Promise<JourneyDetailDTO> {
    await this.delay(40);
    const journey = this.journeys.get(journeyId);
    if (!journey) {
      throw new StoryGatewayError({
        code: 'VALIDATION',
        message: 'Perjalanan tidak ditemukan.',
        retryable: false,
      });
    }
    // Hubungan kanonik dihitung dari SELURUH beat committed, bukan dari baseline.
    return { ...journey, relations: this.canonicalRelations(journeyId) };
  }

  async openJourneySession(journeyId: string): Promise<JourneySession> {
    await this.delay(60);
    this.throwIfFault();

    const journey = this.journeys.get(journeyId);
    if (!journey) {
      throw new StoryGatewayError({
        code: 'VALIDATION',
        message: 'Perjalanan tidak ditemukan.',
        retryable: false,
      });
    }

    const world = findWorld(journey.worldId);
    if (!world) {
      throw new StoryGatewayError({
        code: 'WORLD_RETIRED',
        message: 'Dunia untuk perjalanan ini tidak lagi tersedia.',
        retryable: false,
      });
    }

    const beats = this.journeyBeats.get(journeyId) ?? [];

    return {
      journeyId,
      world,
      beats,
      relationsBaseline: this.journeyBaseline.get(journeyId) ?? [],
      memory: journey.memory,
      committedCursor: beats.length,
      simulator: true,
    };
  }

  /** Menerapkan seluruh delta hubungan dari beat committed ke baseline. */
  private canonicalRelations(journeyId: string): RelationEntry[] {
    let relations = this.journeyBaseline.get(journeyId) ?? [];
    for (const beat of this.journeyBeats.get(journeyId) ?? []) {
      const event = beat.event;
      if (event.type !== 'relationshipDelta') {
        continue;
      }
      const entry: RelationEntry = {
        npcId: event.npcId,
        status: event.status,
        reasonPublic: event.reasonPublic,
        updatedAtTurnId: beat.turnId,
      };
      const index = relations.findIndex((item) => item.npcId === event.npcId);
      if (index === -1) {
        relations = [...relations, entry];
      } else {
        const copy = [...relations];
        copy[index] = entry;
        relations = copy;
      }
    }
    return relations;
  }

  async createJourney(input: CreateJourneyInput): Promise<CreateJourneyResult> {
    await this.delay(80);
    this.throwIfFault();

    const existing = this.operations.get(input.clientOperationId);
    if (existing) {
      const journey = this.journeys.get(existing.journeyId);
      if (journey) {
        return { journeyId: journey.journeyId, worldVersion: journey.worldVersion, opening: existing };
      }
    }

    const world = findWorld(input.worldId);
    if (!world) {
      throw new StoryGatewayError({
        code: 'VALIDATION',
        message: 'Cerita tidak ditemukan.',
        retryable: false,
      });
    }
    if (world.status !== 'published') {
      throw new StoryGatewayError({
        code: 'WORLD_RETIRED',
        message: 'Dunia ini sudah diarsipkan dan tidak dapat dimulai lagi.',
        retryable: false,
      });
    }

    // MVP: satu perjalanan aktif per dunia (D-12).
    const duplicate = [...this.journeys.values()].find((item) => item.worldId === world.worldId);
    if (duplicate) {
      throw new StoryGatewayError({
        code: 'CONFLICT',
        message: 'Kamu sudah punya perjalanan aktif di dunia ini.',
        retryable: false,
      });
    }

    this.journeyCounter += 1;
    const journeyId = `j_${String(this.journeyCounter).padStart(3, '0')}`;
    this.turnCounter += 1;
    const turnId = `t${String(this.turnCounter).padStart(3, '0')}`;

    const beats =
      world.worldId === worldBoskuMantan.worldId
        ? buildOpeningBeats(turnId)
        : buildGenericOpening(world, turnId);

    const envelope = this.envelope({
      operationId: input.clientOperationId,
      journeyId,
      turnId,
      beats,
      revision: 1,
    });

    this.operations.set(input.clientOperationId, envelope);
    this.charge(envelope);

    const relations: RelationEntry[] = world.characters.map((character) => ({
      npcId: character.npcId,
      status: character.initialRelation,
      reasonPublic: 'Hubungan awal yang ditetapkan dunia.',
      updatedAtTurnId: turnId,
    }));

    const journey: JourneyDetailDTO = {
      journeyId,
      worldId: world.worldId,
      worldTitle: world.title,
      coverAssetId: world.coverAssetId,
      // Diteruskan apa adanya, seperti gateway HTTP: inilah yang dapat dimuat.
      coverUri: world.coverUri,
      worldVersion: world.worldVersion,
      personaName: input.persona.name,
      lastReadBeatId: '',
      lastReadSequence: 0,
      decisionCount: 0,
      hasUnreadBeats: true,
      updatedAt: this.nextTimestamp(),
      relations,
      memory: { activeVersion: null, source: 'none' },
      presentedThroughSequence: 0,
    };
    this.journeys.set(journeyId, journey);
    this.journeyBeats.set(journeyId, [...envelope.beats]);
    this.journeyBaseline.set(journeyId, relations);

    return { journeyId, worldVersion: world.worldVersion, opening: envelope };
  }

  async syncReadProgress(input: ReadProgressInput): Promise<void> {
    const journey = this.journeys.get(input.journeyId);
    if (!journey) {
      throw new StoryGatewayError({
        code: 'VALIDATION',
        message: 'Perjalanan tidak ditemukan.',
        retryable: false,
      });
    }
    journey.lastReadSequence = input.lastReadSequence;
    journey.lastReadBeatId = input.lastReadBeatId;
    journey.decisionCount = input.decisionCount;
    journey.hasUnreadBeats = input.hasUnreadBeats;
    journey.presentedThroughSequence = input.lastReadSequence;
    journey.updatedAt = this.nextTimestamp();
  }

  async deleteJourney(journeyId: string): Promise<void> {
    await this.delay(60);
    if (!this.journeys.has(journeyId)) {
      throw new StoryGatewayError({
        code: 'VALIDATION',
        message: 'Perjalanan tidak ditemukan.',
        retryable: false,
      });
    }
    this.journeys.delete(journeyId);
    this.journeyBeats.delete(journeyId);
    this.journeyBaseline.delete(journeyId);
  }

  /* ---------------- Giliran ---------------- */

  async submitChoice(input: SubmitChoiceInput): Promise<TurnResultEnvelope> {
    return this.runTurn(input.clientOperationId, input.journeyId, () => {
      switch (input.optionId) {
        case 'opt1':
          return buildApologeticBeats('t');
        case 'opt3':
          return buildHumorBeats('t');
        case 'opt2':
        default:
          return buildBriefBeats('t');
      }
    });
  }

  async submitCustom(input: SubmitCustomInput): Promise<TurnResultEnvelope> {
    return this.runTurn(input.clientOperationId, input.journeyId, () =>
      buildCustomBeats('t', input.customText),
    );
  }

  async fetchOperation(operationId: string): Promise<OperationStatus> {
    const result = this.operations.get(operationId);
    if (result) {
      return { operationId, state: 'succeeded', result, errorCode: null };
    }
    return { operationId, state: 'running', result: null, errorCode: null };
  }

  /* ---------------- Kuota ---------------- */

  async fetchUsage(): Promise<UsageDTO> {
    await this.delay(30);
    return {
      tier: 'free',
      spent: this.spent,
      reserved: this.reserved,
      available: Math.max(0, FREE_DAILY_ALLOWANCE - this.spent - this.reserved),
      allowanceLimit: FREE_DAILY_ALLOWANCE,
      resetAt: this.nextResetIso(),
      isEstimate: true,
    };
  }

  /**
   * Menerima laporan secara lokal.
   *
   * `localOnly: true` supaya UI tidak pernah mengklaim laporan sudah sampai ke
   * server padahal belum ada backend (NFR-16).
   */
  async submitReport(input: ReportInput): Promise<ReportResult> {
    await this.delay(40);
    this.reportCounter += 1;
    const reportId = `rep_${String(this.reportCounter).padStart(4, '0')}`;
    this.reports.push({ reportId, ...input });
    return { reportId, accepted: true, localOnly: true };
  }

  /** Hanya untuk pengujian: melihat laporan yang tercatat di simulator. */
  recordedReports(): readonly RecordedReport[] {
    return this.reports;
  }

  /* ---------------- Internal ---------------- */

  private async runTurn(
    operationId: string,
    journeyId: string,
    build: () => Beat[],
  ): Promise<TurnResultEnvelope> {
    const cached = this.operations.get(operationId);
    if (cached) {
      return cached;
    }
    const pending = this.inFlight.get(operationId);
    if (pending) {
      return pending;
    }

    const task = this.executeTurn(operationId, journeyId, build);
    this.inFlight.set(operationId, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(operationId);
    }
  }

  private async executeTurn(
    operationId: string,
    journeyId: string,
    build: () => Beat[],
  ): Promise<TurnResultEnvelope> {
    await this.delay(120);
    this.throwIfFault();

    const journey = this.journeys.get(journeyId);
    if (!journey) {
      throw new StoryGatewayError({
        code: 'VALIDATION',
        message: 'Perjalanan tidak ditemukan.',
        retryable: false,
      });
    }

    if (this.spent + SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS > FREE_DAILY_ALLOWANCE) {
      throw new StoryGatewayError({
        code: 'QUOTA_EXHAUSTED',
        message:
          'Kuota harianmu sudah habis. Riwayat dan pengaturan tetap bisa dibuka, dan kuota akan diperbarui otomatis.',
        retryable: false,
      });
    }

    this.turnCounter += 1;
    const turnId = `t${String(this.turnCounter).padStart(3, '0')}`;
    const beats = build().map((beat, index) => ({
      ...beat,
      turnId,
      beatId: `${turnId}-b${String(index + 1).padStart(3, '0')}`,
    }));

    const envelope = this.envelope({
      operationId,
      journeyId,
      turnId,
      beats,
      revision: journey.decisionCount + 2,
    });

    this.operations.set(operationId, envelope);
    this.charge(envelope);

    // Simpan beat ke penyimpanan canonical per perjalanan.
    this.journeyBeats.set(journeyId, [
      ...(this.journeyBeats.get(journeyId) ?? []),
      ...envelope.beats,
    ]);

    journey.decisionCount += 1;
    journey.hasUnreadBeats = true;
    journey.updatedAt = this.nextTimestamp();

    return envelope;
  }

  private envelope(options: {
    operationId: string;
    journeyId: string;
    turnId: string;
    beats: Beat[];
    revision: number;
  }): TurnResultEnvelope {
    const chargedTotal = SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS;
    return {
      operationId: options.operationId,
      journeyId: options.journeyId,
      turnId: options.turnId,
      revision: options.revision,
      beats: options.beats,
      usage: {
        promptTokens: SIM_PROMPT_TOKENS,
        completionTokens: SIM_COMPLETION_TOKENS,
        chargedTotal,
      },
      memory: { activeVersion: null, source: 'none' },
      budget: {
        availableAfter: Math.max(0, FREE_DAILY_ALLOWANCE - this.spent - chargedTotal),
        allowanceLimit: FREE_DAILY_ALLOWANCE,
        resetAt: this.nextResetIso(),
      },
      modelId: SIMULATOR_MODEL_ID,
      modelVersion: '1.0.0',
      simulator: true,
    };
  }

  private charge(envelope: TurnResultEnvelope): void {
    this.spent += envelope.usage.chargedTotal;
  }

  /** Reset harian pada 00.00 UTC; UI menampilkan versi waktu lokal. */
  private nextResetIso(): string {
    const now = new Date();
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
    );
    return next.toISOString();
  }

  /** Stempel waktu yang dijamin menaik untuk setiap pembaruan. */
  private nextTimestamp(): string {
    const now = Date.now();
    this.lastTimestampMs = now > this.lastTimestampMs ? now : this.lastTimestampMs + 1;
    return new Date(this.lastTimestampMs).toISOString();
  }

  private async delay(ms: number): Promise<void> {
    if (this.instant) {
      return;
    }
    const effective = this.faultMode === 'slow' ? SLOW_DELAY_MS : ms;
    await new Promise((resolve) => setTimeout(resolve, effective));
  }

  /** Memicu kegagalan sesuai mode yang dipilih. */
  private throwIfFault(): void {
    switch (this.faultMode) {
      case 'timeout':
        throw new StoryGatewayError({
          code: 'NETWORK',
          message: 'Koneksi terputus sebelum cerita selesai disusun. Progresmu tetap aman.',
          retryable: true,
        });
      case 'quotaExhausted':
        throw new StoryGatewayError({
          code: 'QUOTA_EXHAUSTED',
          message:
            'Kuota harianmu sudah habis. Riwayat dan pengaturan tetap bisa dibuka, dan kuota akan diperbarui otomatis.',
          retryable: false,
        });
      case 'conflict':
        throw new StoryGatewayError({
          code: 'CONFLICT',
          message: 'Perjalanan ini sedang dibuka di perangkat lain. Pilih salinan yang ingin kamu lanjutkan.',
          retryable: false,
        });
      case 'rateLimited':
        throw new StoryGatewayError({
          code: 'RATE_LIMITED',
          message: 'Kamu mengirim permintaan terlalu cepat. Tunggu sebentar, lalu coba lagi.',
          retryable: true,
          retryAfterSec: 30,
        });
      case 'abuseBlocked':
        throw new StoryGatewayError({
          code: 'ABUSE_BLOCKED',
          message:
            'Pengiriman cerita dijeda sementara karena aktivitas yang tidak wajar. Riwayat tetap bisa dibaca.',
          retryable: false,
          blockedUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        });
      case 'modelUnavailable':
        throw new StoryGatewayError({
          code: 'MODEL_UNAVAILABLE',
          message: 'Mesin cerita sedang tidak tersedia. Coba lagi nanti; progresmu tidak hilang.',
          retryable: true,
        });
      case 'assetMissing':
      case 'none':
      case 'slow':
      default:
        return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ekspor untuk pengujian                                              */
/* ------------------------------------------------------------------ */

/**
 * Pembangun beat diekspor agar reducer dan fixture dapat diuji tanpa memanggil
 * gateway. Bukan bagian dari kontrak publik aplikasi.
 */
export {
  buildApologeticBeats as buildApologeticBeatsForTest,
  buildBriefBeats as buildBriefBeatsForTest,
  buildCustomBeats as buildCustomBeatsForTest,
  buildHumorBeats as buildHumorBeatsForTest,
};
