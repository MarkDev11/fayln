/**
 * Kontrak gateway cerita.
 *
 * Frontend hanya berbicara dengan antarmuka ini. Mengganti mock ke backend nyata
 * tidak boleh mengubah satu pun komponen layar (NFR-15).
 */

import type {
  Beat,
  GenreId,
  GenreOption,
  JourneyDetailDTO,
  JourneySummary,
  MemorySnapshot,
  RelationEntry,
  TurnResultEnvelope,
  UsageDTO,
  WorldCatalogItem,
  WorldDetailDTO,
} from '@/domain/types';

export type CatalogQuery = {
  search?: string;
  genres?: GenreId[];
  page?: number;
  pageSize?: number;
};

export type CatalogPage = {
  items: WorldCatalogItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

/**
 * Item katalog dengan peringkat mingguan.
 *
 * `startCount` berasal dari server dan merupakan jumlah perjalanan NYATA dalam
 * jendela waktu. Ia dibawa ke UI supaya angka dapat diperiksa, bukan sekadar
 * dipercaya — dan supaya tidak ada tempat bagi UI untuk mengarang angkanya
 * sendiri.
 */
export type RankedWorldItem = WorldCatalogItem & {
  rank: number;
  startCount: number;
};

export type TopWorldsPage = {
  items: RankedWorldItem[];
  windowDays: number;
};

/**
 * Dunia untuk rail "Baru Diperbarui", beserta waktu revisi terakhirnya.
 *
 * `updatedAt` BUKAN `publishedAt`. Nilainya adalah waktu versi terakhir dunia
 * dibuat — yaitu saat isinya terakhir disunting. Inilah yang membedakan rail ini
 * dari "Terbaru Dirilis"; tanpa bidang ini, keduanya hanya bisa menampilkan
 * daftar yang sama.
 */
export type UpdatedWorldItem = WorldCatalogItem & {
  updatedAt: string;
};

export type SubmitChoiceInput = {
  clientOperationId: string;
  journeyId: string;
  decisionId: string;
  optionId: string;
  responseLocale: 'id-ID' | 'en-US';
};

export type SubmitCustomInput = {
  clientOperationId: string;
  journeyId: string;
  decisionId: string;
  customText: string;
  responseLocale: 'id-ID' | 'en-US';
};

export type CreateJourneyInput = {
  clientOperationId: string;
  worldId: string;
  persona: { name: string; age: number };
  responseLocale: 'id-ID' | 'en-US';
};

export type CreateJourneyResult = {
  journeyId: string;
  worldVersion: number;
  opening: TurnResultEnvelope;
};

/**
 * Sesi bermain: semua yang dibutuhkan pemutar untuk memulai atau melanjutkan.
 *
 * `relationsBaseline` SENGAJA berisi hubungan SEBELUM beat mana pun, bukan hubungan
 * kanonik terkini. Frontend menurunkan hubungan yang boleh dilihat dengan menerapkan
 * hanya beat yang sudah dibaca pemain. Bila server mengirim hubungan kanonik di sini,
 * perubahan dari beat yang belum dibaca akan bocor ke UI (R-04, AC-12).
 */
export type JourneySession = {
  journeyId: string;
  world: WorldDetailDTO;
  /** Seluruh beat yang sudah di-commit, terurut menaik. */
  beats: Beat[];
  relationsBaseline: RelationEntry[];
  memory: MemorySnapshot;
  /** Perkiraan posisi baca menurut server; frontend tetap memakai autosave lokal. */
  committedCursor: number;
  simulator: boolean;
};

export type ReadProgressInput = {
  journeyId: string;
  /** Jumlah beat yang sudah benar-benar dibaca pemain. */
  lastReadSequence: number;
  lastReadBeatId: string;
  decisionCount: number;
  hasUnreadBeats: boolean;
};

export const REPORT_CATEGORIES = [
  'story',
  'character',
  'asset',
  'relationship',
  'content',
  'technical',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === 'string' && (REPORT_CATEGORIES as readonly string[]).includes(value);
}

export type ReportInput = {
  clientOperationId: string;
  category: ReportCategory;
  /** Keterangan yang ditulis pemain. Boleh kosong. */
  detail: string;
  /** Konteks opsional; hanya disertakan bila pemain memilihnya. */
  journeyId?: string;
  beatId?: string;
};

export type ReportResult = {
  reportId: string;
  accepted: boolean;
  /** Benar bila laporan hanya dicatat lokal dan belum sampai ke server. */
  localOnly: boolean;
};

export type OperationStatus = {
  operationId: string;
  state: 'running' | 'succeeded' | 'failed';
  result: TurnResultEnvelope | null;
  errorCode: string | null;
};

/** Skenario gangguan yang dapat dipicu manual saat pengembangan dan pengujian. */
export type FaultMode =
  | 'none'
  | 'slow'
  | 'timeout'
  | 'quotaExhausted'
  | 'conflict'
  | 'assetMissing'
  | 'rateLimited'
  | 'abuseBlocked'
  | 'modelUnavailable';

export interface StoryGateway {
  /** Penanda mode simulator agar UI tidak pernah mengklaim AI sungguhan (NFR-16). */
  readonly isSimulator: boolean;

  fetchCatalog(query: CatalogQuery): Promise<CatalogPage>;
  /**
   * Genre yang ditawarkan, beserta labelnya.
   *
   * Daftar ini DATANG DARI SERVER, bukan dari konstanta di aplikasi. Dua alasan,
   * dan keduanya pernah menjadi cacat:
   *
   * 1. Admin dapat membuat genre baru dari panel. Daftar yang tertulis di kode
   *    akan menyembunyikannya dari chip saringan — pemain tidak akan pernah bisa
   *    menyaring dengan genre yang jelas-jelas dipakai cerita.
   * 2. Server hanya mengirim genre yang MEMANG dipakai cerita terbit, sehingga
   *    saringan yang ditawarkan selalu punya isi. Chip yang selalu mengembalikan
   *    daftar kosong terasa seperti kerusakan, bukan seperti saringan.
   */
  fetchGenres(): Promise<GenreOption[]>;
  fetchWorld(worldId: string): Promise<WorldDetailDTO>;
  /**
   * Dunia terbit yang paling banyak dimulai dalam jendela mingguan.
   *
   * Peringkat dihitung server dari perjalanan nyata. Frontend TIDAK menghitungnya
   * sendiri: ia tidak punya data perjalanan pemain lain, dan menghitungnya dari
   * katalog akan menghasilkan urutan yang salah tanpa terlihat salah.
   */
  fetchTopWorlds(limit?: number): Promise<TopWorldsPage>;
  /** Dunia terbit yang paling baru diterbitkan. */
  fetchNewWorlds(limit?: number): Promise<WorldCatalogItem[]>;
  /**
   * Dunia terbit yang isinya paling baru disunting.
   *
   * Sengaja endpoint terpisah dari `fetchNewWorlds`, bukan turunan katalog:
   * "baru terbit" dan "baru disunting" adalah dua pertanyaan berbeda, dan
   * menurunkan yang kedua dari katalog membuatnya kembar dengan yang pertama.
   */
  fetchUpdatedWorlds(limit?: number): Promise<UpdatedWorldItem[]>;

  fetchJourneys(): Promise<JourneySummary[]>;
  fetchJourneyDetail(journeyId: string): Promise<JourneyDetailDTO>;
  /** Membuka sesi bermain untuk memulai atau melanjutkan (FR-23, FR-25). */
  openJourneySession(journeyId: string): Promise<JourneySession>;
  createJourney(input: CreateJourneyInput): Promise<CreateJourneyResult>;
  deleteJourney(journeyId: string): Promise<void>;
  /**
   * Melaporkan posisi baca pemain.
   *
   * Tanpa ini, daftar Perjalanan akan selalu menampilkan "belum selesai dibaca"
   * karena server tidak tahu bagian mana yang benar-benar sudah dilihat pemain.
   */
  syncReadProgress(input: ReadProgressInput): Promise<void>;

  submitChoice(input: SubmitChoiceInput): Promise<TurnResultEnvelope>;
  submitCustom(input: SubmitCustomInput): Promise<TurnResultEnvelope>;
  fetchOperation(operationId: string): Promise<OperationStatus>;

  fetchUsage(): Promise<UsageDTO>;

  /**
   * Mengirim laporan masalah.
   *
   * Isi cerita TIDAK dikirim otomatis; hanya kategori dan keterangan yang ditulis
   * pemain (NFR-10, docs/10 §5).
   */
  submitReport(input: ReportInput): Promise<ReportResult>;
}

export class StoryGatewayError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterSec?: number;
  readonly blockedUntil?: string;

  constructor(options: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterSec?: number;
    blockedUntil?: string;
  }) {
    super(options.message);
    this.name = 'StoryGatewayError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.retryAfterSec = options.retryAfterSec;
    this.blockedUntil = options.blockedUntil;
  }
}
