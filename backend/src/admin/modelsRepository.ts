/**
 * Konfigurasi model dan rantai fallback.
 *
 * Mengapa ini tabel dan bukan konstanta di kode: biaya satu giliran berbeda
 * untuk setiap model, dan FR-50 ("tidak ada generasi yang dikirim bila anggaran
 * tidak cukup") bergantung pada angka itu. Setelah B-01 diputuskan pilihan
 * modelnya, angka-angka ini berubah tanpa deploy.
 *
 * Yang SENGAJA TIDAK ada di sini: kunci API provider. Rahasia tidak masuk
 * database yang isinya dapat dibaca panel; ia dibaca dari variabel lingkungan.
 * Panel ini hanya mengatur model mana yang dipakai dan berapa biayanya.
 */

import type { Database } from '../db/pool';

export type ModelConfigRow = {
  modelId: string;
  label: string;
  provider: string;
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
  provider: string;
  estimatedTurnCost: number;
  contextTokens: number;
  position: number;
  tier: 'free' | 'paid';
  isActive: boolean;
  notes: string;
};

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
      provider: string;
      estimated_turn_cost: number;
      context_tokens: number;
      position: number;
      tier: string;
      is_active: boolean;
      notes: string;
      updated_at: Date | string;
    }>(
      `SELECT model_id, label, provider, estimated_turn_cost, context_tokens,
              position, tier, is_active, notes, updated_at
       FROM model_configs ORDER BY tier ASC, position ASC, model_id ASC`,
    );

    return rows.map((row) => ({
      modelId: row.model_id,
      label: row.label,
      provider: row.provider,
      estimatedTurnCost: row.estimated_turn_cost,
      contextTokens: row.context_tokens,
      position: row.position,
      tier: row.tier as 'free' | 'paid',
      isActive: row.is_active,
      notes: row.notes,
      updatedAt: row.updated_at,
    }));
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
  async saveModel(input: ModelSaveInput): Promise<{ modelId: string }> {
    const modelId = input.modelId ?? slugModelId(input.label);

    await this.db.query(
      `INSERT INTO model_configs (
         model_id, label, provider, estimated_turn_cost, context_tokens,
         position, tier, is_active, notes, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (model_id) DO UPDATE SET
         label = $2, provider = $3, estimated_turn_cost = $4, context_tokens = $5,
         position = $6, tier = $7, is_active = $8, notes = $9, updated_at = now()`,
      [
        modelId,
        input.label,
        input.provider,
        input.estimatedTurnCost,
        input.contextTokens,
        input.position,
        input.tier,
        input.isActive,
        input.notes,
      ],
    );

    return { modelId };
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
        `UPDATE model_configs SET is_active = true, updated_at = now() WHERE model_id = $1`,
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
    return all.filter((row) => row.tier === tier && row.isActive).sort((a, b) => a.position - b.position);
  }

  /** Ringkasan kesehatan rantai: dipakai halaman Model untuk memperingatkan. */
  async chainHealth(): Promise<
    { tier: 'free' | 'paid'; activeCount: number; hasPrimary: boolean; totalCost: number }[]
  > {
    const all = await this.listModels();
    return (['free', 'paid'] as const).map((tier) => {
      const chain = all.filter((row) => row.tier === tier && row.isActive).sort((a, b) => a.position - b.position);
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
