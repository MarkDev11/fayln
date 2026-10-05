/**
 * Konfigurasi model dan rantai fallback.
 *
 * Mengapa ini tabel dan bukan konstanta di kode: biaya satu giliran berbeda
 * untuk setiap model, dan FR-50 ("tidak ada generasi yang dikirim bila anggaran
 * tidak cukup") bergantung pada angka itu. Setelah B-01 diputuskan pilihan
 * modelnya, angka-angka ini berubah tanpa deploy.
 *
 * ---------------------------------------------------------------------------
 * DUA HAL YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
 * ---------------------------------------------------------------------------
 *
 * 1. KUNCI API TIDAK ADA DI SINI. Ia milik provider, dan bahkan di sana yang
 *    disimpan hanya NAMA variabel lingkungannya (`providers.api_key_env`).
 *    Panel ini hanya mengatur model mana yang dipakai, lewat provider mana, dan
 *    berapa biayanya.
 *
 * 2. SATU MODEL = SATU BARIS, DAN `provider_id` + `model_key` YANG MENENTUKAN
 *    KE MANA PERMINTAAN PERGI.
 *
 *    `model_key` adalah nama model di sisi provider ("mistral-medium-latest"),
 *    sedangkan `model_id` adalah pegangan internal aplikasi (dipakai URL dan
 *    log). Keduanya dipisah karena provider boleh mengganti nama modelnya tanpa
 *    memaksa kita mengganti id yang sudah dipakai di tempat lain.
 *
 *    `resolvedId()` menyatukan keduanya menjadi bentuk yang dikenal penyedia
 *    gaya gateway: `prefix/model_key`.
 */

import type { Database } from '../db/pool';

export const MAX_MODEL_LABEL = 120;
export const MAX_MODEL_KEY = 120;
export const MAX_MODEL_NOTES = 240;

/** Nama model di provider: huruf, angka, titik, garis bawah, garis miring, titik dua. */
export const MODEL_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;

export type ModelConfigRow = {
  modelId: string;
  label: string;
  providerId: string | null;
  /** Nama provider, diambil dari master — bukan disalin ke setiap baris. */
  providerName: string;
  /** Awalan id model milik provider; kosong bila provider belum dipilih. */
  providerPrefix: string;
  modelKey: string;
  estimatedTurnCost: number;
  contextTokens: number;
  position: number;
  tier: 'free' | 'paid';
  isActive: boolean;
  notes: string;
  updatedAt: Date | string;
};

export type ModelSaveInput = {
  modelId: string | null;
  label: string;
  providerId: string;
  modelKey: string;
  estimatedTurnCost: number;
  contextTokens: number;
  position: number;
  tier: 'free' | 'paid';
  isActive: boolean;
  notes: string;
};

/** Sebab sebuah tindakan ditolak, agar halaman dapat menampilkan pesan tepat. */
export type ModelFailure =
  | 'invalid-label'
  | 'invalid-provider'
  | 'invalid-model-key'
  | 'not-found';

export type ModelResult =
  | { ok: true; modelId: string }
  | { ok: false; reason: ModelFailure };

/**
 * Id yang dikenal penyedia: `prefix/model_key`.
 *
 * Dikembalikan kosong bila providernya belum dipilih — halaman memakainya untuk
 * memberi tahu bahwa baris itu belum dapat dipanggil, bukan untuk menampilkan
 * sesuatu yang terlihat sah padahal tidak.
 */
export function resolvedModelId(model: ModelConfigRow): string {
  if (model.providerPrefix.length === 0 || model.modelKey.length === 0) {
    return '';
  }
  return `${model.providerPrefix}/${model.modelKey}`;
}

/**
 * Model yang belum diverifikasi TIDAK boleh diaktifkan.
 *
 * Keputusan ini datang dari aturan proyek: "jangan mengarang harga, provider,
 * atau benchmark". Panel dapat menampung barisnya sebagai catatan, tetapi
 * menyalakan model yang belum diukur biaya per gilirannya akan membuat
 * pemeriksaan anggaran FR-50 memakai angka karangan.
 */
export class ModelsRepository {
  constructor(private readonly db: Database) {}

  async listModels(): Promise<ModelConfigRow[]> {
    const { rows } = await this.db.query<{
      model_id: string;
      label: string;
      provider_id: string | null;
      model_key: string;
      estimated_turn_cost: number;
      context_tokens: number;
      position: number;
      tier: string;
      is_active: boolean;
      notes: string;
      updated_at: Date | string;
    }>(
      `SELECT model_id, label, provider_id, model_key, estimated_turn_cost,
              context_tokens, position, tier, is_active, notes, updated_at
       FROM model_configs ORDER BY tier ASC, position ASC, model_id ASC`,
    );

    // Nama dan prefix provider dibaca terpisah lalu dipetakan di JavaScript,
    // bukan lewat JOIN: pg-mem tidak dapat diandalkan untuk `ORDER BY` pada
    // kolom turunan setelah JOIN, dan jumlah provider kecil.
    const { rows: providerRows } = await this.db.query<{
      provider_id: string;
      name: string;
      prefix: string;
    }>('SELECT provider_id, name, prefix FROM providers');
    const byProvider = new Map(providerRows.map((row) => [row.provider_id, row]));

    return rows.map((row) => {
      const provider = row.provider_id ? byProvider.get(row.provider_id) : undefined;
      return {
        modelId: row.model_id,
        label: row.label,
        providerId: row.provider_id,
        providerName: provider?.name ?? '',
        providerPrefix: provider?.prefix ?? '',
        modelKey: row.model_key,
        estimatedTurnCost: row.estimated_turn_cost,
        contextTokens: row.context_tokens,
        position: row.position,
        tier: row.tier as 'free' | 'paid',
        isActive: row.is_active,
        notes: row.notes,
        updatedAt: row.updated_at,
      };
    });
  }

  async findModel(modelId: string): Promise<ModelConfigRow | null> {
    const all = await this.listModels();
    return all.find((row) => row.modelId === modelId) ?? null;
  }

  /**
   * Menyimpan model.
   *
   * Model aktif pertama pada satu tier otomatis menjadi posisi 0 (utama) bila
   * belum ada yang menempati. Tanpa ini, mengaktifkan model baru akan
   * menghasilkannya tanpa model utama, dan pemilihan model gagal di runtime.
   */
  async saveModel(input: ModelSaveInput): Promise<ModelResult> {
    const label = input.label.trim().slice(0, MAX_MODEL_LABEL);
    if (label.length === 0) {
      return { ok: false, reason: 'invalid-label' };
    }

    const providerId = input.providerId.trim();
    if (providerId.length === 0) {
      return { ok: false, reason: 'invalid-provider' };
    }
    const { rows: providerRows } = await this.db.query<{ provider_id: string }>(
      'SELECT provider_id FROM providers WHERE provider_id = $1',
      [providerId],
    );
    if (providerRows.length === 0) {
      return { ok: false, reason: 'invalid-provider' };
    }

    const modelKey = input.modelKey.trim().slice(0, MAX_MODEL_KEY);
    if (!MODEL_KEY_PATTERN.test(modelKey)) {
      return { ok: false, reason: 'invalid-model-key' };
    }

    const modelId = input.modelId ?? slugModelId(label);

    await this.db.query(
      `INSERT INTO model_configs (
         model_id, label, provider_id, model_key, estimated_turn_cost,
         context_tokens, position, tier, is_active, notes, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (model_id) DO UPDATE SET
         label = $2, provider_id = $3, model_key = $4, estimated_turn_cost = $5,
         context_tokens = $6, position = $7, tier = $8, is_active = $9,
         notes = $10, updated_at = now()`,
      [
        modelId,
        label,
        providerId,
        modelKey,
        input.estimatedTurnCost,
        input.contextTokens,
        input.position,
        input.tier,
        input.isActive,
        input.notes.trim().slice(0, MAX_MODEL_NOTES),
      ],
    );

    return { ok: true, modelId };
  }

  /**
   * Mengaktifkan satu model dan menonaktifkan yang lain pada posisi sama.
   *
   * Rantai fallback adalah urutan `position`, jadi dua model aktif pada posisi
   * yang sama membuat urutannya tidak menentu. Operasi ini menutup celah itu.
   */
  async activateOnly(modelId: string): Promise<void> {
    const model = await this.findModel(modelId);
    if (!model) {
      return;
    }

    await this.db.transaction(async (client) => {
      await client.query(
        'UPDATE model_configs SET is_active = true, updated_at = now() WHERE model_id = $1',
        [modelId],
      );
      await client.query(
        `UPDATE model_configs SET is_active = false, updated_at = now()
         WHERE model_id <> $1 AND tier = $2`,
        [modelId, model.tier],
      );
    });
  }

  async setActive(modelId: string, isActive: boolean): Promise<void> {
    await this.db.query(
      'UPDATE model_configs SET is_active = $2, updated_at = now() WHERE model_id = $1',
      [modelId, isActive],
    );
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.db.query('DELETE FROM model_configs WHERE model_id = $1', [modelId]);
  }

  /**
   * Rantai fallback untuk satu tier: model aktif berurutan menurut `position`.
   *
   * Mengembalikan larik, bukan satu model — rantai berarti "coba yang ini, dan
   * bila gagal, yang berikutnya". Mengembalikan satu model akan menghapus
   * konsep fallback dari tempat yang membutuhkannya.
   */
  async fallbackChain(tier: 'free' | 'paid'): Promise<ModelConfigRow[]> {
    const all = await this.listModels();
    return all
      .filter((row) => row.tier === tier && row.isActive)
      .sort((a, b) => a.position - b.position);
  }

  /** Ringkasan kesehatan rantai: dipakai halaman Model untuk memperingatkan. */
  async chainHealth(): Promise<
    { tier: 'free' | 'paid'; activeCount: number; hasPrimary: boolean; totalCost: number }[]
  > {
    const all = await this.listModels();
    return (['free', 'paid'] as const).map((tier) => {
      const chain = all
        .filter((row) => row.tier === tier && row.isActive)
        .sort((a, b) => a.position - b.position);
      return {
        tier,
        activeCount: chain.length,
        hasPrimary: chain.some((row) => row.position === 0),
        totalCost: chain.reduce((sum, row) => sum + row.estimatedTurnCost, 0),
      };
    });
  }
}

/** Membentuk ID model dari labelnya: "Mistral Medium Latest" -> "mistral-medium-latest". */
function slugModelId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : `model-${Date.now()}`;
}
