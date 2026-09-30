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

/** Genre dipakai untuk filter katalog; label tampilan berasal dari i18n. */
export const GENRES = ['romance', 'drama', 'office', 'fantasy', 'mystery'] as const;
export type GenreId = (typeof GENRES)[number];

export type ResponseLocale = 'id-ID' | 'en-US';

export type WorldCatalogItem = {
  worldId: string;
  title: string;
  synopsis: string;
  genres: GenreId[];
  coverAssetId: string;
  worldVersion: number;
  status: WorldStatus;
  contentRating: ContentRating;
  supportedResponseLocales: ResponseLocale[];
  updatedAt: string;
};

export type NPCPublicDTO = {
  npcId: string;
  name: string;
  role: string;
  /** Trait yang boleh diketahui sebelum bermain. */
  traits: string[];
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

export const RELATION_STATUSES = [
  'normal',
  'hangat',
  'waspada',
  'tegang',
  'renggang',
  'dekat',
  'sayang',
  'cinta',
] as const;
export type RelationStatus = (typeof RELATION_STATUSES)[number];

export function isRelationStatus(value: unknown): value is RelationStatus {
  return typeof value === 'string' && (RELATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Status tak dikenal tidak boleh membuat UI kosong.
 * Admin boleh menambah status baru; pemain melihat label netral.
 */
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

export type UsageDTO = {
  tier: Tier;
  spent: number;
  reserved: number;
  available: number;
  allowanceLimit: number;
  resetAt: string;
  /** Angka dari klien selalu estimasi; angka final hanya dari server. */
  isEstimate: boolean;
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
