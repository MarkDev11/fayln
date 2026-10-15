/**
 * Master status hubungan.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA INI ADA
 * ---------------------------------------------------------------------------
 * Sebelumnya daftar status hubungan adalah KONSTANTA DI DALAM KODE, disalin ke
 * lima tempat — konstanta TS, `CHECK` di skema, array di aplikasi pemain, kunci
 * terjemahan, dan arti untuk model. Menambah status kesembilan berarti menyunting
 * kelimanya, dan melewatkan salah satu adalah kegagalan SENYAP: nilainya ditolak
 * basis data, atau tersimpan baik-baik saja lalu tampil "Belum diketahui" di
 * layar pemain tanpa satu pun galat.
 *
 * Di sini ia menjadi satu tabel, dan admin dapat mengelolanya sendiri.
 *
 * ---------------------------------------------------------------------------
 * TIGA KEPUTUSAN YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
 * ---------------------------------------------------------------------------
 *
 * 1. `relation_id` TIDAK DAPAT DIUBAH setelah dibuat.
 *
 *    Ia dirujuk `world_characters.initial_relation`, seluruh kosakata versi dunia
 *    yang sudah diterbitkan, dan nilai `status` di dalam beat perjalanan pemain.
 *    Mengganti nama id berarti menulis ulang riwayat yang justru tidak boleh
 *    berubah. Yang dapat diubah adalah LABEL dan MAKNANYA.
 *
 * 2. MENGHAPUS definisi yang masih dipakai DITOLAK, bukan dipaksa.
 *
 *    "Dipakai" di sini jauh lebih luas daripada "dipakai sebuah dunia". Ia
 *    mencakup: hubungan awal karakter draf, kosakata versi yang sudah diterbitkan,
 *    status awal perjalanan pemain, dan status di dalam beat yang sudah tercatat.
 *    Memeriksa yang pertama saja akan meloloskan penghapusan yang membuat
 *    perjalanan lama kehilangan status yang sedang dipakainya.
 *
 *    Yang sudah tidak diinginkan DINONAKTIFKAN: hilang dari pilihan baru, tetapi
 *    seluruh cerita lama tetap utuh.
 *
 * 3. KOSAKATA DIBEKUKAN PER VERSI DUNIA, bukan dibaca langsung dari master.
 *
 *    Keputusan pemilik produk: perjalanan yang sudah berjalan tetap memakai
 *    definisi lamanya. Membaca master setiap giliran berarti menyunting satu
 *    kalimat arti mengubah cara tokoh bersikap di perjalanan yang sudah berjalan
 *    berjam-jam. Karena itu versi dunia membawa salinannya sendiri, dan master
 *    hanya memengaruhi versi yang diterbitkan SESUDAHNYA.
 *
 * Bentuk `relation_id` diperiksa di sini, bukan dengan `CHECK`: pg-mem tidak
 * mengenal operator `~`, dan `CHECK` seperti itu membuat MIGRASI gagal — bukan
 * sekadar tidak menegakkan apa pun.
 */

import { randomUUID } from 'node:crypto';

import type { Database, DbClient } from '../db/pool';
import type { RelationDefinition } from '../contracts/types';

/** Huruf kecil, angka, garis bawah. Diawali huruf. 2–32 karakter. */
export const RELATION_ID_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

export type RelationRow = RelationDefinition & {
  /** Berapa BANYAK rujukan yang membuat definisi ini tidak dapat dihapus. */
  usageCount: number;
  createdAt: Date | string;
};

export type RelationInput = {
  labelId: string;
  labelEn: string;
  meaning: string;
  /** Contoh sikap opsional: apa yang TERLIHAT di layar, bukan apa yang dirasakan. */
  behaviourHint?: string;
  active: boolean;
};

export type RelationFailure = 'invalid-label' | 'not-found' | 'in-use';

export type RelationResult = { ok: true; relationId?: string } | { ok: false; reason: RelationFailure; usedBy?: number };

const MAX_LABEL = 60;
const MAX_MEANING = 600;
/** Batas contoh sikap: cukup untuk satu kalimat yang konkret, tidak lebih. */
const MAX_HINT = 400;

export class RelationsRepository {
  constructor(private readonly db: Database) {}

  /**
   * Seluruh definisi beserta jumlah rujukannya.
   *
   * Dihitung lewat kueri terpisah per tabel, bukan satu kueri gabungan dengan
   * sub-kueri berkorelasi: pg-mem tidak dapat sub-kueri yang merujuk tabel induk,
   * dan jumlah definisi kecil sehingga selisihnya tidak terasa.
   */
  async list(): Promise<RelationRow[]> {
    const { rows } = await this.db.query<{
      relation_id: string;
      label_id: string;
      label_en: string;
      meaning: string;
      behaviour_hint: string;
      position: number;
      active: boolean;
      created_at: Date | string;
    }>(
      `SELECT relation_id, label_id, label_en, meaning, behaviour_hint, position, active, created_at
       FROM relation_definitions
       ORDER BY position ASC, relation_id ASC`,
    );

    const usage = await this.usageCounts();

    return rows.map((row) => ({
      relationId: row.relation_id,
      labelId: row.label_id,
      labelEn: row.label_en,
      meaning: row.meaning,
      behaviourHint: row.behaviour_hint,
      position: row.position,
      active: row.active,
      usageCount: usage.get(row.relation_id) ?? 0,
      createdAt: row.created_at,
    }));
  }

  /**
   * Definisi yang pantas ditawarkan pada formulir, untuk satu pilihan tertentu.
   *
   * Isinya: seluruh definisi AKTIF, ditambah definisi yang SUDAH dipilih walau
   * sudah nonaktif. Penambahan itu bukan kelonggaran — tanpanya, membuka kembali
   * karakter yang memakai status nonaktif akan menghilangkan pilihannya tanpa
   * suara, dan menyimpan formulir itu diam-diam mengganti hubungan awalnya.
   */
  async listOfferable(selected: readonly string[] = []): Promise<RelationRow[]> {
    const chosen = new Set(selected);
    return (await this.list()).filter((item) => item.active || chosen.has(item.relationId));
  }

  async find(relationId: string): Promise<RelationRow | null> {
    const all = await this.list();
    return all.find((item) => item.relationId === relationId) ?? null;
  }

  /**
   * Menyaring daftar id menjadi yang benar-benar ADA di master.
   *
   * Yang diperiksa adalah keberadaan, bukan keaktifan: menyunting dunia lama yang
   * memakai status nonaktif tidak boleh membuang status itu diam-diam.
   */
  async existingIds(candidates: readonly string[]): Promise<string[]> {
    if (candidates.length === 0) {
      return [];
    }
    const known = new Set((await this.list()).map((item) => item.relationId));
    return [...new Set(candidates)].filter((id) => known.has(id));
  }

  /**
   * Menambah satu definisi.
   *
   * ID DIBUAT SISTEM dari labelnya, bukan diminta dari admin: id adalah urusan
   * mesin, label adalah urusan manusia. Nama yang menabrak id yang sudah ada
   * mendapat akhiran acak, bukan penolakan — admin menambah "Dingin" dua kali
   * berarti ia ingin dua baris, bukan ingin diberi pelajaran tentang id.
   */
  async create(input: RelationInput): Promise<RelationResult> {
    const labelId = input.labelId.trim();
    if (labelId.length === 0) {
      return { ok: false, reason: 'invalid-label' };
    }

    const relationId = await this.uniqueId(labelId);

    const { rows } = await this.db.query<{ next_position: number }>(
      'SELECT coalesce(max(position), 0)::int + 1 AS next_position FROM relation_definitions',
    );

    await this.db.query(
      `INSERT INTO relation_definitions
         (relation_id, label_id, label_en, meaning, behaviour_hint, position, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        relationId,
        clamp(labelId, MAX_LABEL),
        clamp(input.labelEn, MAX_LABEL) || clamp(labelId, MAX_LABEL),
        clamp(input.meaning, MAX_MEANING),
        clamp(input.behaviourHint ?? '', MAX_HINT),
        rows[0]?.next_position ?? 1,
        input.active,
      ],
    );

    return { ok: true, relationId };
  }

  /**
   * Mengubah label, arti, dan keaktifan. ID TIDAK diubah — lihat catatan di
   * kepala berkas.
   */
  /**
   * Mengubah label, arti, dan keaktifan. Id TIDAK diubah — lihat catatan di
   * kepala berkas.
   *
   * `meaning` **opsional**, dan bila tidak dikirim artinya DIPERTAHANKAN.
   *
   * ---------------------------------------------------------------------------
   * MENGAPA
   * ---------------------------------------------------------------------------
   * Halaman mengirim DUA formulir terpisah per baris: satu untuk label dan
   * keadaan, satu lagi untuk arti. Bentuk pertama mewajibkan `meaning` ikut
   * terkirim, padahal formulir label tidak memilikinya — sehingga setiap klik
   * "Simpan" pada baris itu ditolak skema dan dialihkan ke
   * `?notice=relation-invalid` tanpa galat yang dapat dibaca.
   *
   * Akibatnya lebih dari "perubahan hilang": definisi yang sudah dipakai tidak
   * dapat dihapus dan tombol hapusnya disembunyikan, jadi menyunting label dan
   * keadaan adalah SATU-SATUNYA jalan menonaktifkan sebuah status. Tombol itu
   * mati berarti janji "dapat menambah atau mengurangi" hanya terpenuhi separuh.
   */
  async update(
    relationId: string,
    input: {
      labelId: string;
      labelEn: string;
      meaning?: string;
      /** Tidak dikirim berarti pertahankan; string kosong berarti hapus petunjuk. */
      behaviourHint?: string;
      active: boolean;
    },
  ): Promise<RelationResult> {
    const labelId = input.labelId.trim();
    if (labelId.length === 0) {
      return { ok: false, reason: 'invalid-label' };
    }

    const arti = input.meaning === undefined ? null : clamp(input.meaning, MAX_MEANING);
    const contoh = input.behaviourHint === undefined ? null : clamp(input.behaviourHint, MAX_HINT);

    const { rowCount } = await this.db.query(
      `UPDATE relation_definitions
       SET label_id = $2, label_en = $3, meaning = coalesce($4, meaning),
           behaviour_hint = coalesce($6, behaviour_hint),
           active = $5, updated_at = now()
       WHERE relation_id = $1`,
      [
        relationId,
        clamp(labelId, MAX_LABEL),
        clamp(input.labelEn, MAX_LABEL) || clamp(labelId, MAX_LABEL),
        arti,
        input.active,
        contoh,
      ],
    );

    return rowCount > 0 ? { ok: true } : { ok: false, reason: 'not-found' };
  }

  /**
   * Menghapus definisi.
   *
   * Ditolak bila masih dirujuk di mana pun. Pemeriksaannya dilakukan SEBELUM
   * `DELETE` supaya alasannya dapat disebutkan; kunci asing tetap menjadi jaring
   * pengaman bila ada yang menyisipkan di antara pemeriksaan dan penghapusan.
   */
  async remove(relationId: string): Promise<RelationResult> {
    const used = await this.usageCount(relationId);
    if (used > 0) {
      return { ok: false, reason: 'in-use', usedBy: used };
    }

    const { rowCount } = await this.db.query('DELETE FROM relation_definitions WHERE relation_id = $1', [
      relationId,
    ]);
    return rowCount > 0 ? { ok: true } : { ok: false, reason: 'not-found' };
  }

  /**
   * Menggeser satu definisi satu langkah ke atas atau ke bawah.
   *
   * Urutan ditulis ulang seluruhnya dari daftar yang sudah diurutkan, bukan
   * dengan menukar dua angka: menukar dua angka menjadi salah begitu ada dua
   * baris berposisi sama.
   */
  async move(relationId: string, direction: 'up' | 'down'): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ relation_id: string }>(
        'SELECT relation_id FROM relation_definitions ORDER BY position ASC, relation_id ASC',
      );
      const ids = rows.map((row) => row.relation_id);
      const index = ids.indexOf(relationId);
      if (index < 0) {
        return;
      }
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= ids.length) {
        return;
      }
      ids.splice(target, 0, ...ids.splice(index, 1));

      for (const [position, id] of ids.entries()) {
        await client.query('UPDATE relation_definitions SET position = $2 WHERE relation_id = $1', [
          id,
          position + 1,
        ]);
      }
    });
  }

  /** Membekukan kosakata satu versi dunia dari master. Lihat catatan di atas. */
  async freeze(worldId: string, worldVersion: number): Promise<number> {
    return this.db.transaction((client) => freezeRelationVocabulary(client, worldId, worldVersion));
  }

  /**
   * Berapa banyak rujukan yang membuat definisi ini tidak dapat dihapus.
   *
   * Empat sumbernya sengaja disebut satu per satu: memeriksa "dipakai sebuah
   * dunia" saja akan meloloskan penghapusan yang membuat perjalanan lama
   * kehilangan status yang sedang dipakainya.
   */
  async usageCount(relationId: string): Promise<number> {
    const counts = await this.usageCounts();
    return counts.get(relationId) ?? 0;
  }

  private async usageCounts(): Promise<Map<string, number>> {
    const total = new Map<string, number>();

    const tambah = (
      rows: { key: string; total: number }[],
    ): void => {
      for (const row of rows) {
        total.set(row.key, (total.get(row.key) ?? 0) + row.total);
      }
    };

    const karakter = await this.db.query<{ key: string; total: number }>(
      `SELECT initial_relation AS key, count(*)::int AS total
       FROM world_characters GROUP BY initial_relation`,
    );
    tambah(karakter.rows);

    const kosakata = await this.db.query<{ key: string; total: number }>(
      `SELECT relation_id AS key, count(*)::int AS total
       FROM world_relationship_definitions GROUP BY relation_id`,
    );
    tambah(kosakata.rows);

    const awal = await this.db.query<{ key: string; total: number }>(
      `SELECT status AS key, count(*)::int AS total
       FROM journey_relations_baseline GROUP BY status`,
    );
    tambah(awal.rows);

    /*
     * Status juga hidup di dalam beat, dan itu JSONB — tidak ada kunci asing yang
     * menahannya. Menghapus definisi yang masih dipakai di sana membuat riwayat
     * perjalanan menunjuk id yang tidak ada lagi.
     */
    const beat = await this.db.query<{ key: string; total: number }>(
      `SELECT event->>'status' AS key, count(*)::int AS total
       FROM beats
       WHERE event->>'type' = 'relationshipDelta'
       GROUP BY event->>'status'`,
    );
    tambah(beat.rows.filter((row) => typeof row.key === 'string' && row.key.length > 0));

    return total;
  }

  /** ID unik dari label; yang menabrak diberi akhiran acak, bukan ditolak. */
  private async uniqueId(labelId: string): Promise<string> {
    const dasar =
      `rel_${labelId
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24)}`.replace(/_+$/, '');

    const kandidat = RELATION_ID_PATTERN.test(dasar) ? dasar : `rel_${randomUUID().slice(0, 8)}`;

    const { rows } = await this.db.query<{ relation_id: string }>(
      'SELECT relation_id FROM relation_definitions WHERE relation_id = $1',
      [kandidat],
    );
    if (rows.length === 0) {
      return kandidat;
    }
    return `${kandidat.slice(0, 24)}_${randomUUID().replace(/-/g, '').slice(0, 4)}`;
  }
}

/**
 * Membekukan kosakata satu versi dunia.
 *
 * Isinya: seluruh definisi AKTIF, ditambah definisi apa pun yang SEDANG dipakai
 * karakter di versi itu. Yang kedua bukan kelonggaran: karakter yang memakai
 * status yang baru saja dinonaktifkan tetap harus punya namanya, atau adegan
 * berikutnya kehilangan daftar status yang sah untuk tokoh itu.
 *
 * Dijalankan di dalam transaksi pemanggil supaya versi dunia tidak pernah
 * setengah terbit dengan kosakata yang belum lengkap.
 */
export async function freezeRelationVocabulary(
  client: DbClient,
  worldId: string,
  worldVersion: number,
): Promise<number> {
  await client.query(
    'DELETE FROM world_relationship_definitions WHERE world_id = $1 AND world_version = $2',
    [worldId, worldVersion],
  );

  const { rows } = await client.query<{ total: number }>(
    `INSERT INTO world_relationship_definitions
       (world_id, world_version, relation_id, label_id, label_en, meaning,
        behaviour_hint, position)
     SELECT $1, $2::int, d.relation_id, d.label_id, d.label_en, d.meaning,
            d.behaviour_hint, d.position
     FROM relation_definitions d
     WHERE d.active = true
        OR d.relation_id IN (
             SELECT initial_relation FROM world_characters
             WHERE world_id = $1 AND world_version = $2::int
           )
     RETURNING 1 AS total`,
    [worldId, worldVersion],
  );

  return rows.length;
}

/**
 * Label kosong diisi id-nya.
 *
 * Kolomnya `NOT NULL`, dan definisi tanpa label akan tampil sebagai baris kosong
 * di panel — lebih buruk daripada menampilkan id apa adanya.
 */
function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
