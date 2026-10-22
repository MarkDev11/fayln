/**
 * Tipe domain fayLN.
 *
 * Sumber normatif: docs/06-runtime-visual-novel.md dan docs/09-arsitektur-frontend-dan-kontrak.md.
 * Tipe di sini adalah kontrak frontend. Backend kelak wajib mematuhinya, bukan sebaliknya.
 */

/* ------------------------------------------------------------------ */
/* Katalog dan dunia                                                   */
/* ------------------------------------------------------------------ */

export const WORLD_STATUSES = ['draft', 'published', 'retired', 'revoked'] as const;
export type WorldStatus = (typeof WORLD_STATUSES)[number];

export const CONTENT_RATINGS = ['all', '13_plus', '18_plus'] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

/**
 * Genre bawaan — BUKAN daftar seluruh genre.
 *
 * Daftar yang sah hidup di server (tabel `genres`), karena admin dapat menambah,
 * menonaktifkan, dan menghapus genre dari panel. Nilai di sini hanya mencatat
 * genre yang ikut dipasang bersama aplikasi.
 *
 * Nama `SEEDED_` disengaja: nilai ini pernah bernama `GENRES` dan diperlakukan
 * sebagai daftar lengkap. Menyimpan nama lama akan mengundang layar baru untuk
 * memakainya sebagai daftar chip — dan chip dari daftar yang basi akan
 * menyembunyikan genre yang baru dibuat admin, tanpa galat apa pun.
 */
export const SEEDED_GENRES = ['romance', 'drama', 'office', 'fantasy', 'mystery'] as const;

/**
 * Id genre.
 *
 * Sengaja `string`, bukan gabungan nilai tetap. Daftar genre adalah data, dan
 * tipe yang tertutup akan menolak genre buatan admin tepat di tempat yang
 * seharusnya menampilkannya.
 */
export type GenreId = string;

/**
 * Satu genre yang ditawarkan server.
 *
 * Membawa labelnya sendiri, karena genre buatan admin tidak punya kunci
 * terjemahan di aplikasi. Tanpa label dari server, genre seperti itu akan tampil
 * sebagai `slice_of_life` di layar pemain.
 */
export type GenreOption = {
  genreId: GenreId;
  labelId: string;
  labelEn: string;
};

export type ResponseLocale = 'id-ID' | 'en-US';

export type WorldCatalogItem = {
  worldId: string;
  title: string;
  synopsis: string;
  genres: GenreId[];
  coverAssetId: string;
  /**
   * URL sampul yang siap dimuat, atau string kosong bila belum ada.
   *
   * Sebelumnya daftar katalog hanya mengirim ID aset, sehingga SETIAP sampul di
   * beranda tampil sebagai placeholder tanpa satu pun galat.
   */
  coverUri: string;
  worldVersion: number;
  status: WorldStatus;
  contentRating: ContentRating;
  supportedResponseLocales: ResponseLocale[];
  /**
   * Kapan versi terbit ini masuk katalog.
   *
   * Sebelumnya bernama `updatedAt`, padahal isinya tanggal terbit. Nama lama itu
   * membuat rail "Baru Diperbarui" menyebut dunia yang belum pernah disunting
   * sebagai "baru diperbarui". Rail "Terbaru Dirilis" memakai bidang ini dengan
   * sebutan yang benar.
   */
  publishedAt: string;
};

export type NPCPublicDTO = {
  npcId: string;
  name: string;
  role: string;
  /**
   * Jiwa: kepribadian mendalam karakter ini di dunia ini.
   *
   * Menggantikan `traits` sejak 7 Oktober 2026. Satu paragraf dapat menyatakan
   * "pendiam" sekaligus MENGAPA ia pendiam.
   */
  soul: string;
  /** Backstory versi publik; tidak memuat rahasia kanon. */
  publicBackstory: string;
  /** Hubungan awal yang ditetapkan admin, bukan hubungan perjalanan pemain. */
  initialRelation: RelationStatus;
  expressions: string[];
  defaultPortraitAssetId: string;
};

export type AssetManifest = {
  cover: AssetRef;
  backgrounds: AssetRef[];
  portraits: PortraitRef[];
};

export type AssetRef = {
  assetId: string;
  label: string;
  uri: string;
};

export type PortraitRef = AssetRef & {
  npcId: string;
  expression: string;
};

export type WorldDetailDTO = WorldCatalogItem & {
  premise: string;
  locations: { locationId: string; label: string }[];
  characters: NPCPublicDTO[];
  assetManifest: AssetManifest;
};

/* ------------------------------------------------------------------ */
/* Hubungan                                                            */
/* ------------------------------------------------------------------ */

/**
 * Delapan status hubungan BAWAAN — bukan lagi daftar yang menutup.
 *
 * Sejak 13 Oktober 2026 daftar yang sah tinggal di basis data, diatur admin, dan
 * dibekukan per versi dunia. Server mengirimnya di setiap sesi sebagai
 * `relationVocabulary`.
 *
 * Konstanta ini tetap ada karena satu hal saja: LABEL BAWAAN. Delapan id ini
 * sudah tersimpan di perjalanan lama, dan terjemahannya sudah ada di kamus
 * (`relation.normal`, dst). Tanpa daftar ini, perjalanan lama yang dibuka sebelum
 * kosakatanya sempat dimuat akan menampilkan id mentah.
 *
 * Yang TIDAK boleh lagi dilakukan: memakainya untuk memutuskan status mana yang
 * SAH. Itu persis kesalahan yang membuat status kesembilan mustahil — server
 * menyimpannya dengan benar, lalu aplikasi menolaknya di sini dan pemain melihat
 * "Belum diketahui" tanpa satu pun galat.
 */
export const DEFAULT_RELATION_STATUSES = [
  'normal',
  'hangat',
  'waspada',
  'tegang',
  'renggang',
  'dekat',
  'sayang',
  'cinta',
] as const;

/**
 * Status hubungan adalah ID BEBAS, bukan gabungan harfiah.
 *
 * Admin dapat menambah status baru lewat panel tanpa membangun ulang aplikasi.
 * Tipe yang menutup daftarnya akan menuntut penyuntingan kode setiap kali itu
 * terjadi — dan itulah bentuk lama yang digantikan.
 */
export type RelationStatus = string;

/** Satu definisi hubungan sebagaimana dikirim server untuk sebuah versi dunia. */
export type RelationVocabularyEntry = {
  relationId: string;
  labelId: string;
  labelEn: string;
  /** Arahan untuk mesin cerita. Tidak pernah ditampilkan ke pemain. */
  meaning: string;
  /** Contoh sikap: apa yang TERLIHAT di layar. Boleh kosong. */
  behaviourHint: string;
  position: number;
};

/**
 * Status yang benar-benar KOSONG saja yang dianggap tidak diketahui.
 *
 * Bentuk lamanya menolak apa pun yang tidak ada di delapan nilai bawaan. Sejak
 * status menjadi data, penolakan itu berubah menjadi kerusakan senyap: status
 * yang sah menurut server diubah menjadi "unknown" di sini, dan pemain melihat
 * hubungannya tidak pernah berubah.
 */
export function isRelationStatus(value: unknown): value is RelationStatus {
  return typeof value === 'string' && value.trim().length > 0;
}

export function coerceRelationStatus(value: unknown): RelationStatus | 'unknown' {
  return isRelationStatus(value) ? value : 'unknown';
}

export type RelationEntry = {
  npcId: string;
  status: RelationStatus | 'unknown';
  /** Alasan yang aman dibaca pemain. Wajib ada bila status berubah. */
  reasonPublic: string;
  updatedAtTurnId: string;
};

/* ------------------------------------------------------------------ */
/* Beat dan event                                                      */
/* ------------------------------------------------------------------ */

export const EVENT_TYPES = [
  'setBackground',
  'showCharacter',
  'hideCharacter',
  'say',
  'narrate',
  'presentChoices',
  'relationshipDelta',
  'playerInput',
  'setFlag',
  'memoryWrite',
  'endArc',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type SetBackgroundEvent = { type: 'setBackground'; assetId: string };
export type ShowCharacterEvent = {
  type: 'showCharacter';
  npcId: string;
  expression: string;
  assetId: string;
};
export type HideCharacterEvent = { type: 'hideCharacter'; npcId: string };
export type SayEvent = { type: 'say'; npcId: string; text: string };
export type NarrateEvent = { type: 'narrate'; text: string };
export type RelationshipDeltaEvent = {
  type: 'relationshipDelta';
  npcId: string;
  status: RelationStatus;
  reasonPublic: string;
};
/** Pemain ejaan/opsi sebagai beat riwayat, bukan dialog panggung. */
export type PlayerInputEvent = {
  type: 'playerInput';
  inputKind: 'choice' | 'custom';
  text: string;
};
export type SetFlagEvent = { type: 'setFlag'; key: string; value: string | number | boolean };
export type MemoryWriteEvent = { type: 'memoryWrite'; summary: string; sourceTurnIds: string[] };
export type EndArcEvent = { type: 'endArc'; reasonPublic: string };

export type ChoiceOption = {
  optionId: string;
  /** Niat tindakan, bukan kalimat yang harus diucapkan. */
  label: string;
  description: string;
};

export type PresentChoicesEvent = {
  type: 'presentChoices';
  decisionId: string;
  prompt: string;
  options: [ChoiceOption, ChoiceOption, ChoiceOption];
};

export type StoryEvent =
  | SetBackgroundEvent
  | ShowCharacterEvent
  | HideCharacterEvent
  | SayEvent
  | NarrateEvent
  | PresentChoicesEvent
  | RelationshipDeltaEvent
  | PlayerInputEvent
  | SetFlagEvent
  | MemoryWriteEvent
  | EndArcEvent;

export type Beat = {
  beatId: string;
  turnId: string;
  /** Urutan monoton di dalam turn; dipakai memastikan urutan pemutaran. */
  sequence: number;
  event: StoryEvent;
};

/* ------------------------------------------------------------------ */
/* Turn dan giliran                                                    */
/* ------------------------------------------------------------------ */

export type TurnUsage = {
  promptTokens: number;
  completionTokens: number;
  chargedTotal: number;
};

export type BudgetSnapshot = {
  availableAfter: number;
  allowanceLimit: number;
  resetAt: string;
};

export type MemorySnapshot = {
  /** `null` bila pemain Free atau compaction belum pernah berhasil. */
  activeVersion: number | null;
  source: 'none' | 'checkpoint';
};

export type TurnResultEnvelope = {
  operationId: string;
  journeyId: string;
  turnId: string;
  revision: number;
  beats: Beat[];
  usage: TurnUsage;
  memory: MemorySnapshot;
  budget: BudgetSnapshot;
  /** Ditampilkan untuk transparansi; frontend tidak pernah memilih model. */
  modelId: string;
  modelVersion: string;
  /** Penanda bahwa hasil berasal dari simulator, bukan AI produksi. */
  simulator: boolean;
};

/* ------------------------------------------------------------------ */
/* Perjalanan                                                          */
/* ------------------------------------------------------------------ */

export type PersonaSnapshot = {
  name: string;
  age: number;
};

export type JourneySummary = {
  journeyId: string;
  worldId: string;
  worldTitle: string;
  coverAssetId: string;
  /**
   * URL sampul yang SIAP DIMUAT, mis. `https://host/assets/cover/x.png`.
   *
   * WAJIB diutamakan atas `coverAssetId`. Yang terakhir hanyalah ID internal
   * (`a_cover_kantor`): `assetUri()` menempelkan awalan `asset://` padanya dan
   * gambarnya tidak akan pernah termuat — placeholder, tanpa galat apa pun.
   */
  coverUri: string;
  worldVersion: number;
  personaName: string;
  lastReadBeatId: string;
  lastReadSequence: number;
  decisionCount: number;
  /** Ada beat committed yang belum dibaca pemain. */
  hasUnreadBeats: boolean;
  updatedAt: string;
};

export type JourneyDetailDTO = JourneySummary & {
  relations: RelationEntry[];
  memory: MemorySnapshot;
  /** Hubungan hanya boleh berasal dari beat yang sudah dibaca. */
  presentedThroughSequence: number;
};

/* ------------------------------------------------------------------ */
/* Paket dan kuota                                                     */
/* ------------------------------------------------------------------ */

export const TIERS = ['free', 'paid'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Kuota harian dalam POIN, bukan token (docs/17).
 *
 * Sejak ekonomi poin: `available`/`allowanceLimit` bermakna poin, saldo hanya
 * ada setelah klaim harian, dan pergantian hari terjadi 00.00 WIB. Pencatatan
 * token tetap berjalan di server, tetapi hanya untuk analitik biaya — frontend
 * tidak boleh menampilkannya ke pemain sebagai mata uang.
 */
export type UsageDTO = {
  tier: Tier;
  /** Poin yang sudah terpakai hari ini. */
  spent: number;
  reserved: number;
  /** Poin yang masih bisa dipakai; 0 sebelum klaim hari ini. */
  available: number;
  /** Jatah dasar harian dalam poin (tanpa bonus streak). */
  allowanceLimit: number;
  /** Tengah malam WIB berikutnya, ISO. */
  resetAt: string;
  /** Angka dari klien selalu estimasi; angka final hanya dari server. */
  isEstimate: boolean;
  /** Hari ini belum diklaim — popup klaim harian harus tampil. */
  claimableToday: boolean;
  /**
   * Hari streak saat ini (1..7 dalam siklus). Aturannya milik server;
   * frontend hanya menampilkan, tidak pernah menghitung sendiri.
   */
  streakDay: number;
  /** Biaya satu adegan dalam poin. Ditampilkan apa adanya dari server. */
  sceneCost: number;
};

/**
 * Hasil klaim poin harian dari `POST /v1/usage/claim`.
 *
 * `awarded` 0 pada klaim ulang di hari yang sama (idempoten, bukan galat)
 * supaya percobaan ulang setelah kegagalan jaringan selalu aman.
 */
export type ClaimResultDTO = {
  /** Poin dasar yang diberikan klaim ini; 0 bila hari ini sudah diklaim. */
  awarded: number;
  /** Bonus streak (kelipatan 7 hari); 0 bila tidak ada. */
  bonus: number;
  streakDay: number;
  /** Saldo tersedia SETELAH klaim diterapkan. */
  available: number;
  resetAt: string;
};

export type EntitlementDTO = {
  tier: Tier;
  active: boolean;
  compactionEnabled: boolean;
  contextWindow: number;
  validUntil: string | null;
};

/* ------------------------------------------------------------------ */
/* Kesalahan                                                           */
/* ------------------------------------------------------------------ */

export const ERROR_CODES = [
  'NETWORK',
  'UNAUTHORIZED',
  'VALIDATION',
  'CONFLICT',
  'NOT_FOUND',
  'QUOTA_EXHAUSTED',
  'CONTEXT_FULL',
  'RATE_LIMITED',
  'ABUSE_WARN',
  'ABUSE_BLOCKED',
  'MODEL_UNAVAILABLE',
  'WORLD_RETIRED',
  'MAINTENANCE',
  'INTERNAL',
  'UNKNOWN',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type GatewayError = {
  code: ErrorCode;
  /** Pesan aman untuk pemain; tidak boleh memuat detail internal. */
  message: string;
  /** Khusus RATE_LIMITED. */
  retryAfterSec?: number;
  /** Khusus ABUSE_BLOCKED. */
  blockedUntil?: string;
  retryable: boolean;
};
