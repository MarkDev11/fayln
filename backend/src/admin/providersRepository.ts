/**
 * Provider model: ke mana permintaan dikirim, dan dengan protokol apa.
 *
 * Sebelum ini "provider" hanya teks bebas pada baris model, sehingga tidak ada
 * tempat untuk hal-hal yang sebenarnya milik PROVIDER: base URL, jenis API, dan
 * awalan id model. Ketiganya ditulis ulang di setiap model dari provider yang
 * sama — dan satu salah ketik menghasilkan model yang diam-diam menembak alamat
 * yang salah.
 *
 * ---------------------------------------------------------------------------
 * TIGA KEPUTUSAN YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
 * ---------------------------------------------------------------------------
 *
 * 1. KUNCI API TIDAK DISIMPAN DI SINI — hanya NAMA variabel lingkungannya.
 *
 *    `apiKeyEnv` berisi mis. "OPENAI_API_KEY", bukan kuncinya. Itu aturan
 *    proyek ini sejak awal (rahasia tidak masuk basis data yang isinya dapat
 *    dibaca panel), dan ada dua alasan tambahan yang khas fayLN: cadangan malam
 *    blitz.cloud menyalin isi basis data, dan panel ini punya peran `support`
 *    yang tidak seharusnya dapat melihat rahasia.
 *
 *    Yang dapat dilakukan panel: MEMERIKSA apakah variabelnya terpasang
 *    (`keyPresent`), tanpa pernah menampilkan nilainya. Jadi admin tetap tahu
 *    konfigurasinya lengkap atau belum.
 *
 * 2. PREFIX DIPERIKSA DI SINI, BUKAN DENGAN `UNIQUE` DI SKEMA.
 *
 *    Keunikannya tetap ditegakkan, tetapi lewat pemeriksaan yang dapat
 *    menjelaskan "prefix ini sudah dipakai provider X" — sedangkan `UNIQUE`
 *    hanya menghasilkan galat basis data. Bentuknya juga diperiksa di sini
 *    karena pg-mem tidak mengenal operator `~`, dan `CHECK` seperti itu membuat
 *    MIGRASI GAGAL, bukan sekadar tidak menegakkan apa pun.
 *
 * 3. BASE URL DINORMALKAN: garis miring di ujung dibuang.
 *
 *    "https://api.openai.com/v1/" dan "https://api.openai.com/v1" adalah alamat
 *    yang sama, dan menyimpannya sebagai dua bentuk berbeda berarti suatu saat
 *    ada yang menyambung path menjadi ".../v1//chat/completions". Yang
 *    diperiksa di sini hanya bentuknya (skema http/https + ada host); panel
 *    TIDAK memanggil alamatnya, karena itu pekerjaan jalur cerita nanti.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '../db/pool';
import { decryptSecret, encryptSecret, SecretsUnavailableError } from './secretBox';

export const MAX_PROVIDER_NAME = 120;
export const MAX_PREFIX = 32;
export const MAX_BASE_URL = 300;
export const MAX_API_KEY_ENV = 120;
export const MAX_PROVIDER_NOTES = 240;

/** Huruf kecil, angka, tanda hubung. Diawali huruf atau angka. 1–32 karakter. */
export const PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Nama variabel lingkungan: huruf besar, angka, garis bawah. */
export const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,119}$/;

/**
 * Cara gambar dilampirkan pada pesan, per penyedia.
 *
 * "OpenAI-compatible" tidak seragam dalam hal ini, dan salah pilih TIDAK
 * menghasilkan galat: Mistral membuang bagian yang bentuknya tidak dikenali,
 * lalu modelnya menjawab "tidak ada gambar yang diberikan" — gejala yang
 * menyesatkan ke arah yang salah sama sekali.
 */
export const IMAGE_PARTS = ['object', 'string'] as const;
export type ImagePart = (typeof IMAGE_PARTS)[number];

export const IMAGE_PART_LABELS: Record<ImagePart, string> = {
  object: 'Objek — {"url": "..."} (OpenAI, mayoritas gateway)',
  string: 'Teks — "..." (Mistral)',
};

export const API_TYPES = ['chat-completions', 'responses', 'messages'] as const;
export type ApiType = (typeof API_TYPES)[number];

/**
 * Nama yang dilihat admin.
 *
 * `messages` sengaja disebut "(Anthropic)" karena itulah satu-satunya penyedia
 * yang memakai bentuk itu; menyebutnya "Messages" saja membuat admin menebak.
 */
export const API_TYPE_LABELS: Record<ApiType, string> = {
  'chat-completions': 'Chat Completions',
  responses: 'Responses',
  messages: 'Messages (Anthropic)',
};

export type ProviderRow = {
  providerId: string;
  name: string;
  prefix: string;
  apiType: ApiType;
  baseUrl: string;
  /** NAMA variabel lingkungan — bukan nilainya. */
  apiKeyEnv: string;
  /** Bentuk lampiran gambar yang dipahami penyedia ini. */
  imagePart: ImagePart;
  position: number;
  isActive: boolean;
  notes: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Berapa model yang menunjuk provider ini. */
  modelCount: number;
  /** Apakah ada kunci tersimpan (terenkripsi) untuk provider ini. */
  hasStoredKey: boolean;
  /**
   * Apakah variabel lingkungan itu benar-benar terpasang.
   *
   * Dihitung dari nama variabelnya saja; nilainya tidak pernah dibaca untuk
   * keperluan tampilan.
   */
  keyPresent: boolean;
  /** Dari mana kunci yang dipakai nanti berasal. */
  keySource: 'stored' | 'env' | 'none';
};

export type ProviderInput = {
  name: string;
  prefix: string;
  apiType: string;
  baseUrl: string;
  apiKeyEnv: string;
  /** Bentuk lampiran gambar: 'object' (OpenAI) atau 'string' (Mistral). */
  imagePart: string;
  /**
   * Kunci API yang akan disimpan terenkripsi.
   *
   * Nilai ini hanya masuk ke `encryptSecret()` dan tidak pernah disimpan
   * apa adanya, tidak pernah dikembalikan, dan tidak pernah dicatat. Kosong
   * berarti "jangan ubah kunci yang sudah ada".
   */
  apiKey?: string;
  isActive: boolean;
  notes: string;
};

/** Sebab sebuah tindakan ditolak, agar halaman dapat menampilkan pesan tepat. */
export type ProviderFailure =
  | 'invalid-name'
  | 'invalid-prefix'
  | 'duplicate-prefix'
  | 'invalid-api-type'
  | 'invalid-base-url'
  | 'invalid-key-env'
  | 'invalid-image-part'
  /**
   * Kunci enkripsi belum terpasang di lingkungan server.
   *
   * Ditolak, bukan disimpan apa adanya: menyimpan kunci tanpa enkripsi karena
   * "konfigurasinya belum lengkap" akan menghasilkan rahasia terbaca yang
   * tampak sah, dan tidak ada yang akan tahu sampai suatu saat basis datanya
   * tersalin ke tempat lain.
   */
  | 'secrets-unavailable'
  | 'not-found'
  | 'in-use';

export type ProviderResult =
  | { ok: true; providerId: string }
  | { ok: false; reason: ProviderFailure; detail?: string; usedBy?: number };

type Prepared = {
  name: string;
  prefix: string;
  apiType: ApiType;
  baseUrl: string;
  apiKeyEnv: string;
  imagePart: ImagePart;
  isActive: boolean;
  notes: string;
};

/** Hasil `sealKey()`: kunci terenkripsi, "tidak diubah", atau ditolak. */
type SealedKey =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'secrets-unavailable' };

export class ProvidersRepository {
  constructor(private readonly db: Database) {}

  /**
   * Seluruh provider, terurut.
   *
   * Jumlah modelnya dihitung lewat satu kueri `GROUP BY` terpisah, bukan
   * sub-kueri berkorelasi: pg-mem tidak dapat sub-kueri yang merujuk tabel
   * induk — pola yang sama seperti master genre dan lokasi.
   */
  async list(): Promise<ProviderRow[]> {
    const { rows } = await this.db.query<{
      provider_id: string;
      name: string;
      prefix: string;
      api_type: string;
      base_url: string;
      api_key_env: string;
      api_key_enc: string;
      image_part: string;
      position: number;
      is_active: boolean;
      notes: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT provider_id, name, prefix, api_type, base_url, api_key_env, api_key_enc,
              image_part, position, is_active, notes, created_at, updated_at
       FROM providers
       ORDER BY position ASC, provider_id ASC`,
    );

    const { rows: counts } = await this.db.query<{ provider_id: string; total: number }>(
      `SELECT provider_id, count(*)::int AS total
       FROM model_configs
       WHERE provider_id IS NOT NULL
       GROUP BY provider_id`,
    );
    const byProvider = new Map(counts.map((row) => [row.provider_id, row.total]));

    return rows.map((row) => ({
      providerId: row.provider_id,
      name: row.name,
      prefix: row.prefix,
      apiType: asApiType(row.api_type),
      baseUrl: row.base_url,
      apiKeyEnv: row.api_key_env,
      imagePart: asImagePart(row.image_part),
      position: row.position,
      isActive: row.is_active,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      modelCount: byProvider.get(row.provider_id) ?? 0,
      hasStoredKey: row.api_key_enc.length > 0,
      keyPresent: row.api_key_enc.length > 0 || isKeyPresent(row.api_key_env),
      keySource: keySourceOf(row.api_key_enc, row.api_key_env),
    }));
  }

  async find(providerId: string): Promise<ProviderRow | null> {
    const all = await this.list();
    return all.find((row) => row.providerId === providerId) ?? null;
  }

  /** Provider yang pantas ditawarkan pada formulir model: yang aktif saja. */
  async listOfferable(): Promise<ProviderRow[]> {
    return (await this.list()).filter((row) => row.isActive);
  }

  async create(input: ProviderInput): Promise<ProviderResult> {
    const prepared = await this.prepare(input);
    if ('reason' in prepared) {
      return prepared;
    }

    const sealed = this.sealKey(input.apiKey);
    if (!sealed.ok) {
      return sealed;
    }

    const providerId = newProviderId();
    const { rows } = await this.db.query<{ next_position: number }>(
      'SELECT coalesce(max(position), 0)::int + 1 AS next_position FROM providers',
    );
    await this.db.query(
      `INSERT INTO providers (
         provider_id, name, prefix, api_type, base_url, api_key_env, api_key_enc, image_part,
         position, is_active, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        providerId,
        prepared.name,
        prepared.prefix,
        prepared.apiType,
        prepared.baseUrl,
        prepared.apiKeyEnv,
        sealed.value ?? '',
        prepared.imagePart,
        rows[0]?.next_position ?? 1,
        prepared.isActive,
        prepared.notes,
      ],
    );

    return { ok: true, providerId };
  }

  /**
   * Mengubah provider.
   *
   * `prefix` BOLEH diubah, dan itu berbeda dari genre yang id-nya terkunci.
   * Alasannya: prefix bukan identitas baris ini — ia bagian dari cara model
   * menyebut dirinya, dan model menunjuk provider lewat `provider_id`, bukan
   * lewat prefix. Mengganti prefix karena itu tidak memutus apa pun.
   */
  async update(providerId: string, input: ProviderInput): Promise<ProviderResult> {
    const prepared = await this.prepare(input, providerId);
    if ('reason' in prepared) {
      return prepared;
    }

    const sealed = this.sealKey(input.apiKey);
    if (!sealed.ok) {
      return sealed;
    }

    const { rowCount } = await this.db.query(
      `UPDATE providers SET
         name = $2, prefix = $3, api_type = $4, base_url = $5,
         api_key_env = $6, image_part = $7, is_active = $8, notes = $9, updated_at = now()
       WHERE provider_id = $1`,
      [
        providerId,
        prepared.name,
        prepared.prefix,
        prepared.apiType,
        prepared.baseUrl,
        prepared.apiKeyEnv,
        prepared.imagePart,
        prepared.isActive,
        prepared.notes,
      ],
    );

    if (rowCount === 0) {
      return { ok: false, reason: 'not-found' };
    }

    // Kuncinya hanya ditulis bila benar-benar diisi. Bidang yang dibiarkan
    // kosong pada formulir berarti "pertahankan yang sudah ada" — bukan
    // "hapus kuncinya", karena menghapusnya butuh aksi tersendiri yang
    // disengaja.
    if (sealed.value !== null) {
      await this.db.query(
        'UPDATE providers SET api_key_enc = $2, updated_at = now() WHERE provider_id = $1',
        [providerId, sealed.value],
      );
    }

    return { ok: true, providerId };
  }

  /**
   * Menghapus kunci tersimpan tanpa menyentuh kolom lain.
   *
   * Aksi tersendiri, bukan efek samping menyimpan formulir: menghapus kunci
   * berarti provider itu tidak dapat dipanggil lagi, dan itu keputusan yang
   * harus disengaja.
   */
  async clearKey(providerId: string): Promise<ProviderResult> {
    const { rowCount } = await this.db.query(
      `UPDATE providers SET api_key_enc = '', updated_at = now() WHERE provider_id = $1`,
      [providerId],
    );
    return rowCount > 0
      ? { ok: true, providerId }
      : { ok: false, reason: 'not-found' };
  }

  /**
   * Kunci API yang dipakai memanggil provider ini.
   *
   * Dipanggil JALUR CERITA sesaat sebelum permintaan dikirim — bukan panel,
   * dan hasilnya tidak boleh berakhir di HTML mana pun. Yang tersimpan menang;
   * bila kosong, jatuh ke variabel lingkungan yang disebutkan.
   */
  async apiKeyFor(providerId: string): Promise<string | null> {
    const provider = await this.find(providerId);
    if (!provider) {
      return null;
    }

    if (provider.hasStoredKey) {
      const { rows } = await this.db.query<{ api_key_enc: string }>(
        'SELECT api_key_enc FROM providers WHERE provider_id = $1',
        [providerId],
      );
      return decryptSecret(rows[0]?.api_key_enc ?? '');
    }

    const raw = process.env[provider.apiKeyEnv];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
  }

  /**
   * Mengenkripsi kunci baru, atau `null` bila tidak ada yang diubah.
   *
   * Gagal bila kunci enkripsi belum terpasang di lingkungan — dan itu
   * DITOLAK, bukan dibiarkan tersimpan apa adanya.
   */
  private sealKey(raw: string | undefined): SealedKey {
    if (raw === undefined || raw.length === 0) {
      return { ok: true, value: null };
    }
    try {
      return { ok: true, value: encryptSecret(raw) };
    } catch (error) {
      if (error instanceof SecretsUnavailableError) {
        return { ok: false, reason: 'secrets-unavailable' };
      }
      throw error;
    }
  }

  /**
   * Menghapus provider.
   *
   * Ditolak bila masih ada model yang menunjuknya: menghapusnya akan membuat
   * model itu kehilangan alamat tujuannya, dan `ON DELETE RESTRICT` sudah
   * menolaknya di tingkat basis data. Pemeriksaan di sini membuat alasannya
   * dapat dibaca admin.
   */
  async remove(providerId: string): Promise<ProviderResult> {
    const used = await this.modelCount(providerId);
    if (used > 0) {
      return { ok: false, reason: 'in-use', usedBy: used };
    }

    const { rowCount } = await this.db.query('DELETE FROM providers WHERE provider_id = $1', [
      providerId,
    ]);
    return rowCount > 0
      ? { ok: true, providerId }
      : { ok: false, reason: 'not-found' };
  }

  async modelCount(providerId: string): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM model_configs WHERE provider_id = $1',
      [providerId],
    );
    return rows[0]?.total ?? 0;
  }

  /** Menggeser satu provider satu langkah. Urutan menentukan urutan di formulir. */
  async move(providerId: string, direction: 'up' | 'down'): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ provider_id: string }>(
        'SELECT provider_id FROM providers ORDER BY position ASC, provider_id ASC',
      );
      const ids = rows.map((row) => row.provider_id);
      const index = ids.indexOf(providerId);
      if (index < 0) {
        return;
      }
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= ids.length) {
        return;
      }
      ids.splice(target, 0, ...ids.splice(index, 1));

      for (const [position, each] of ids.entries()) {
        await client.query('UPDATE providers SET position = $2 WHERE provider_id = $1', [
          each,
          position + 1,
        ]);
      }
    });
  }

  /**
   * Menyaring dan menormalkan isian sebelum menyentuh basis data.
   *
   * Mengembalikan `reason` alih-alih melempar, supaya halaman dapat menjelaskan
   * penolakannya — dan supaya tidak ada satu pun jalur simpan yang dapat
   * menyelundupkan alamat yang tidak dapat dipanggil.
   */
  private async prepare(
    input: ProviderInput,
    selfId?: string,
  ): Promise<Prepared | { ok: false; reason: ProviderFailure; detail?: string }> {
    const name = clamp(input.name, MAX_PROVIDER_NAME);
    if (name.length === 0) {
      return { ok: false, reason: 'invalid-name' };
    }

    const prefix = input.prefix.trim().toLowerCase();
    if (!PREFIX_PATTERN.test(prefix)) {
      return { ok: false, reason: 'invalid-prefix' };
    }

    const clash = (await this.list()).find(
      (row) => row.prefix === prefix && row.providerId !== selfId,
    );
    if (clash) {
      return { ok: false, reason: 'duplicate-prefix', detail: clash.name };
    }

    if (!isApiType(input.apiType)) {
      return { ok: false, reason: 'invalid-api-type' };
    }

    const baseUrl = normaliseBaseUrl(input.baseUrl);
    if (!baseUrl) {
      return { ok: false, reason: 'invalid-base-url' };
    }

    /*
     * Kosong berarti "belum dipilih" dan jatuh ke bentuk yang paling umum.
     * Tetapi nilai yang DIISI dan tidak dikenal DITOLAK, sama seperti jenis API:
     * diam-diam mengubahnya menjadi 'object' akan menyembunyikan kesalahan, dan
     * kesalahan di sini tidak terlihat sampai modelnya menjawab bahwa ia tidak
     * menerima gambar.
     */
    const imagePartRaw = (input.imagePart ?? '').trim();
    if (imagePartRaw.length > 0 && !isImagePart(imagePartRaw)) {
      return { ok: false, reason: 'invalid-image-part' };
    }
    const imagePart = imagePartRaw.length > 0 ? (imagePartRaw as ImagePart) : 'object';

    const apiKeyEnv = input.apiKeyEnv.trim();
    if (apiKeyEnv.length > 0 && !ENV_NAME_PATTERN.test(apiKeyEnv)) {
      return { ok: false, reason: 'invalid-key-env' };
    }

    return {
      name,
      prefix,
      apiType: input.apiType,
      baseUrl,
      apiKeyEnv,
      imagePart,
      isActive: input.isActive,
      notes: clamp(input.notes ?? '', MAX_PROVIDER_NOTES),
    };
  }
}

/**
 * Dari mana kunci yang akan dipakai berasal.
 *
 * Tiga keadaan, dan halaman menampilkannya berbeda: kunci tersimpan (siap
 * dipanggil), kunci dari variabel lingkungan (juga siap), dan tidak ada sama
 * sekali (belum bisa dipanggil). Menyatukan dua yang pertama akan menutupi
 * perbedaan yang perlu diketahui saat ada masalah.
 */
function keySourceOf(encrypted: string, envName: string): 'stored' | 'env' | 'none' {
  if (encrypted.length > 0) {
    return 'stored';
  }
  if (isKeyPresent(envName)) {
    return 'env';
  }
  return 'none';
}

/**
 * Apakah variabel lingkungan kunci benar-benar terpasang.
 *
 * Yang diperiksa hanya ADA atau TIDAK. Nilainya tidak pernah dikembalikan, dan
 * tidak pernah ikut ke halaman — itulah gunanya menyimpan namanya saja.
 */
function isKeyPresent(envName: string): boolean {
  if (envName.length === 0) {
    return false;
  }
  const value = process.env[envName];
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Memeriksa bentuk base URL dan membuang garis miring di ujungnya.
 *
 * Yang diperiksa hanya bentuknya: skema http/https dan ada host. Panel TIDAK
 * memanggil alamatnya — mencoba menghubungi setiap alamat yang diketik akan
 * membuat panel menggantung karena satu alamat yang tidak menjawab.
 */
function normaliseBaseUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.length === 0 || trimmed.length > MAX_BASE_URL) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (parsed.hostname.length === 0) {
    return null;
  }
  return trimmed;
}

function asImagePart(value: string): ImagePart {
  return isImagePart(value) ? value : 'object';
}

function isImagePart(value: string): value is ImagePart {
  return (IMAGE_PARTS as readonly string[]).includes(value);
}

function asApiType(value: string): ApiType {
  return isApiType(value) ? value : 'chat-completions';
}

function isApiType(value: string): value is ApiType {
  return (API_TYPES as readonly string[]).includes(value);
}

/** Berawalan `prov_` supaya bentuknya dapat dikenali sekilas di URL dan di log. */
function newProviderId(): string {
  return `prov_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
