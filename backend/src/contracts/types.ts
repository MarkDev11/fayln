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

/**
 * Genre bawaan — BUKAN daftar seluruh genre.
 *
 * Daftar yang sah sekarang hidup di tabel `genres` (migrasi 009), karena admin
 * dapat menambah, mengubah, menonaktifkan, dan menghapusnya dari panel. Daftar
 * ini hanya mencatat genre yang ikut dipasang bersama aplikasi.
 *
 * Nama `SEEDED_` disengaja: nilai ini pernah bernama `GENRES` dan diperlakukan
 * sebagai daftar lengkap. Menyimpan nama lama akan mengundang kode baru untuk
 * memakainya sebagai penyaring — dan penyaring dari daftar yang basi akan
 * membuang genre yang baru dibuat admin tanpa pesan apa pun.
 *
 * Uji `contract-drift` memakai daftar ini untuk memastikan setiap genre bawaan
 * punya terjemahan di aplikasi pemain. Genre buatan admin tidak punya kunci
 * terjemahan, jadi ia ditampilkan dari label yang disimpan server.
 */
export const SEEDED_GENRES = ['romance', 'drama', 'office', 'fantasy', 'mystery'] as const;

/**
 * Id genre.
 *
 * Sengaja `string`, bukan gabungan nilai tetap: daftarnya adalah data, dan tipe
 * yang tertutup akan menolak genre yang baru saja dibuat admin. Keabsahan
 * sebuah id diperiksa terhadap tabel `genres`, bukan terhadap tipe.
 */
export type GenreId = string;

/**
 * Satu genre sebagaimana ditawarkan ke aplikasi pemain.
 *
 * Label dibawa SERTA id-nya, bukan hanya id. Sebelum genre menjadi data, klien
 * menerjemahkan id menjadi teks lewat kunci i18n — dan itu hanya bekerja untuk
 * genre yang ditulis di kode. Genre buatan admin tidak akan pernah punya kunci
 * terjemahan, jadi tanpa label dari server ia akan tampil sebagai
 * `slice_of_life` di layar pemain.
 *
 * Kedua bahasa dikirim sekaligus, bukan satu yang dipilih server: klien sudah
 * tahu bahasa antarmukanya, dan pengalihan bahasa di aplikasi tidak boleh
 * menuntut perjalanan bolak-balik ke server.
 */
export type GenreOption = {
  genreId: GenreId;
  labelId: string;
  labelEn: string;
};

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
  /**
   * URL sampul yang SIAP DIMUAT, atau string kosong bila belum ada.
   *
   * Daftar katalog sebelumnya hanya mengirim ID ("a_cover_kantor"), dan klien
   * tidak punya cara mengubahnya menjadi gambar — akibatnya SETIAP sampul di
   * beranda tampil sebagai placeholder, tanpa satu pun galat.
   */
  coverUri: string;
  worldVersion: number;
  status: WorldStatus;
  contentRating: ContentRating;
  supportedResponseLocales: ResponseLocale[];
  /**
   * Kapan versi terbit ini dimasukkan ke katalog.
   *
   * Sebelumnya bidang ini bernama `updatedAt` padahal isinya `published_at`.
   * Nama lama membuat rail "Baru Diperbarui" berbohong: dunia yang belum pernah
   * disunting tetap tampil sebagai baru diperbarui, karena yang berubah hanyalah
   * tanggal terbitnya. Nama ini menyebut isinya apa adanya.
   */
  publishedAt: string;
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
  /**
   * Jiwa: kepribadian mendalam karakter pada dunia ini.
   *
   * Menggantikan `traits` (daftar kata) sejak 7 Oktober 2026. Satu paragraf dapat
   * menyatakan "pendiam" sekaligus MENGAPA ia pendiam, sedangkan daftar kata tidak
   * dapat — dan mesin cerita memakai ini untuk menggambarkan dialognya.
   */
  soul: string;
  publicBackstory: string;
  initialRelation: RelationStatus;
  expressions: string[];
  defaultPortraitAssetId: string;
};

export type WorldDetailDTO = WorldCatalogItem & {
  premise: string;
  /**
   * Lokasi tempat cerita DIMULAI, atau null bila admin belum memilih.
   *
   * Mesin cerita memakainya untuk memilih latar adegan pembuka. Tanpa ini ia
   * hanya dapat menebak — dan dua tebakannya sudah terbukti salah di produksi:
   * entri pertama menurut urutan master, lalu pencocokan kata yang tertipu kata
   * umum seperti "ruang".
   */
  openingLocationId: string | null;
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
  /**
   * ID aset sampul, apa adanya dari database.
   *
   * Tidak dapat dimuat klien — hanya berguna sebagai kunci. Yang dapat dimuat
   * adalah `coverUri`.
   */
  coverAssetId: string;
  /**
   * URL sampul yang SIAP DIMUAT, mis. `https://host/assets/cover/x.png`.
   *
   * WAJIB ada di sini. Tanpa ini klien hanya menerima `coverAssetId`
   * (`a_cover_kantor`) dan `assetUri()` di frontend menempelkan awalan
   * `asset://` — hasilnya placeholder, tanpa galat apa pun. Daftar Perjalanan
   * dan halaman detail perjalanan tampak "tidak punya gambar" karenanya.
   * Katalog dunia sudah lebih dulu mengirim ini; perjalanan tertinggal.
   */
  coverUri: string;
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
