/**
 * Kontrak backend fayLN.
 *
 * Berkas ini adalah CERMIN dari `frontend/src/domain/types.ts`. Frontend adalah
 * konsumen kontrak ini, jadi bentuk di sini tidak boleh menyimpang darinya.
 *
 * Untuk mencegah perbedaan yang tidak disadari, ada uji drift di
 * `tests/contract-drift.test.ts` yang membandingkan daftar nilai enum antara
 * kedua sisi. Bila uji itu gagal, perbaiki salah satu sisi dengan sadar — jangan
 * melebarkan uji.
 */

/* ------------------------------------------------------------------ */
/* Katalog dan dunia                                                   */
/* ------------------------------------------------------------------ */

export const WORLD_STATUSES = ['draft', 'published', 'retired', 'revoked'] as const;
export type WorldStatus = (typeof WORLD_STATUSES)[number];

export const CONTENT_RATINGS = ['all', '13_plus', '18_plus'] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

export const GENRES = ['romance', 'drama', 'office', 'fantasy', 'mystery'] as const;
export type GenreId = (typeof GENRES)[number];

export const RESPONSE_LOCALES = ['id-ID', 'en-US'] as const;
export type ResponseLocale = (typeof RESPONSE_LOCALES)[number];

export type AssetRef = {
  assetId: string;
  label: string;
  uri: string;
};

export type PortraitRef = AssetRef & {
  npcId: string;
  expression: string;
};

export type AssetManifest = {
  cover: AssetRef;
  backgrounds: AssetRef[];
  portraits: PortraitRef[];
};

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

export type NPCPublicDTO = {
  npcId: string;
  name: string;
  role: string;
  traits: string[];
  publicBackstory: string;
  initialRelation: RelationStatus;
  expressions: string[];
  defaultPortraitAssetId: string;
};

export type WorldDetailDTO = WorldCatalogItem & {
  premise: string;
  locations: { locationId: string; label: string }[];
  characters: NPCPublicDTO[];
  assetManifest: AssetManifest;
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

export type ChoiceOption = {
  optionId: string;
  label: string;
  description: string;
};

export type StoryEvent =
  | { type: 'setBackground'; assetId: string }
  | { type: 'showCharacter'; npcId: string; expression: string; assetId: string }
  | { type: 'hideCharacter'; npcId: string }
  | { type: 'say'; npcId: string; text: string }
  | { type: 'narrate'; text: string }
  | {
      type: 'presentChoices';
      decisionId: string;
      prompt: string;
      options: [ChoiceOption, ChoiceOption, ChoiceOption];
    }
  | { type: 'relationshipDelta'; npcId: string; status: RelationStatus; reasonPublic: string }
  | { type: 'setFlag'; key: string; value: string | number | boolean }
  | { type: 'memoryWrite'; summary: string; sourceTurnIds: string[] }
  | { type: 'endArc'; reasonPublic: string };

export type Beat = {
  beatId: string;
  turnId: string;
  sequence: number;
  event: StoryEvent;
};

/* ------------------------------------------------------------------ */
/* Giliran                                                             */
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
  modelId: string;
  modelVersion: string;
  simulator: boolean;
};

/* ------------------------------------------------------------------ */
/* Perjalanan                                                          */
/* ------------------------------------------------------------------ */

export type PersonaSnapshot = {
  name: string;
  age: number;
};

export type RelationEntry = {
  npcId: string;
  status: RelationStatus;
  reasonPublic: string;
  updatedAtTurnId: string;
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
  hasUnreadBeats: boolean;
  updatedAt: string;
};

export type JourneyDetailDTO = JourneySummary & {
  relations: RelationEntry[];
  memory: MemorySnapshot;
  presentedThroughSequence: number;
};

export type JourneySessionDTO = {
  journeyId: string;
  world: WorldDetailDTO;
  beats: Beat[];
  relationsBaseline: RelationEntry[];
  memory: MemorySnapshot;
  committedCursor: number;
  simulator: boolean;
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
/* Laporan                                                             */
/* ------------------------------------------------------------------ */

export const REPORT_CATEGORIES = [
  'story',
  'character',
  'asset',
  'relationship',
  'content',
  'technical',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type ReportResult = {
  reportId: string;
  accepted: boolean;
  localOnly: boolean;
};
