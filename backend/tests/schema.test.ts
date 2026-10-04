/**
 * Pengujian skema dan migrasi.
 *
 * Yang dibuktikan di sini bukan "migrasi berjalan tanpa galat", melainkan bahwa
 * batasan yang menjadi dasar aturan domain benar-benar ditegakkan database.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { createTestDatabase, type TestDatabase } from './helpers/testDb';

let ctx: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDatabase();
});

afterEach(async () => {
  await ctx.close();
});

describe('migrasi', () => {
  /**
   * Daftar ini sengaja ditulis lengkap, bukan dihitung dari direktori.
   *
   * Menghitung berkas akan membuat uji ini selalu lulus tanpa memberi tahu
   * apa pun: migrasi yang tertinggal tidak akan terdeteksi. Dengan daftar
   * eksplisit, menambah migrasi baru memaksa seseorang memperbarui uji ini —
   * dan pada saat itu pula urutannya terlihat.
   */
  const EXPECTED_MIGRATIONS = [
    '001_init.sql',
    '002_seed_reference.sql',
    '003_asset_paths.sql',
    '004_admin.sql',
    '005_seed_top_weekly.sql',
    '006_seed_timeline.sql',
  ];

  it('menerapkan seluruh berkas migrasi pada database kosong', async () => {
    const { rows } = await ctx.db.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name ASC',
    );
    expect(rows.map((row) => row.name)).toEqual(EXPECTED_MIGRATIONS);
  });

  it('aman dijalankan ulang tanpa menerapkan apa pun lagi', async () => {
    const { runMigrations } = await import('../src/db/migrate');
    const result = await runMigrations(ctx.db);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(EXPECTED_MIGRATIONS.length);
  });
});

/**
 * Database dapat belum siap tepat saat aplikasi bangun — di blitz.cloud keduanya
 * kadang bangun bersamaan, dan sesaat muncul `ECONNREFUSED`. Sebelum perbaikan ini,
 * satu galat seperti itu membuat proses keluar dan platform menandai aplikasi
 * rusak. Pengujian berikut menjaga agar perilaku itu tidak kembali.
 */
describe('percobaan ulang migrasi saat database belum siap', () => {
  it('berhasil setelah beberapa kali ECONNREFUSED', async () => {
    const { runMigrations } = await import('../src/db/migrate');
    const { db } = ctx;

    let calls = 0;
    const flaky = {
      kind: 'injected' as const,
      async query<T>(text: string, values?: readonly unknown[]) {
        calls += 1;
        if (calls <= 3) {
          const error = new Error('connect ECONNREFUSED 10.43.45.100:5432') as Error & {
            code: string;
          };
          error.code = 'ECONNREFUSED';
          throw error;
        }
        return db.query<T>(text, values);
      },
      transaction: db.transaction,
      close: db.close,
    };

    // Jeda disuntikkan sebagai nol: yang diuji adalah logika percobaan ulang,
    // bukan lamanya penantian.
    const result = await runMigrations(flaky, undefined, {
      attempts: 6,
      backoffMs: () => 0,
    });
    expect(result.applied).toEqual([]);
    expect(calls).toBeGreaterThan(3);
  });

  it('menyerah setelah percobaan habis, bukan menggantung', async () => {
    const { runMigrations } = await import('../src/db/migrate');

    const alwaysDown = {
      kind: 'injected' as const,
      async query(): Promise<never> {
        const error = new Error('connect ECONNREFUSED') as Error & { code: string };
        error.code = 'ECONNREFUSED';
        throw error;
      },
      async transaction(): Promise<never> {
        throw new Error('tidak dipakai');
      },
      async close(): Promise<void> {
        return undefined;
      },
    };

    // attempts = 1 supaya tidak ada penantian sama sekali.
    await expect(
      runMigrations(alwaysDown, undefined, { attempts: 1, backoffMs: () => 0 }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('tidak mencoba ulang galat SQL yang sebenarnya', async () => {
    const { runMigrations } = await import('../src/db/migrate');

    let calls = 0;
    const brokenSql = {
      kind: 'injected' as const,
      async query(): Promise<never> {
        calls += 1;
        const error = new Error('syntax error at or near "SELEC"') as Error & { code: string };
        // Kode galat sintaks PostgreSQL: bukan masalah koneksi.
        error.code = '42601';
        throw error;
      },
      async transaction(): Promise<never> {
        throw new Error('tidak dipakai');
      },
      async close(): Promise<void> {
        return undefined;
      },
    };

    await expect(
      runMigrations(brokenSql, undefined, { attempts: 5, backoffMs: () => 0 }),
    ).rejects.toThrow(/syntax error/);
    // Percobaan ulang akan menyamarkan kesalahan; pastikan hanya dipanggil sekali.
    expect(calls).toBe(1);
  });
});

describe('jalur aset', () => {
  it('mengubah penanda asset:// menjadi jalur yang disajikan', async () => {
    const { rows } = await ctx.db.query<{ uri: string }>(
      'SELECT uri FROM world_assets ORDER BY asset_id ASC',
    );
    expect(rows.every((row) => row.uri.startsWith('/assets/'))).toBe(true);
    expect(rows.some((row) => row.uri.startsWith('asset://'))).toBe(false);
  });

  it('menempatkan setiap aset pada folder yang sesuai jenisnya', async () => {
    const { rows } = await ctx.db.query<{ kind: string; uri: string }>(
      'SELECT kind, uri FROM world_assets ORDER BY asset_id ASC',
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.uri.startsWith(`/assets/${row.kind}/`)).toBe(true);
      expect(row.uri.endsWith('.png')).toBe(true);
    }
  });
});

describe('data rujukan', () => {
  it('memuat empat dunia termasuk satu yang terarsip', async () => {
    const { rows } = await ctx.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM world_versions WHERE status <> 'draft'`,
    );
    expect(Number(rows[0]?.count)).toBe(4);

    const retired = await ctx.db.query<{ world_id: string }>(
      `SELECT world_id FROM world_versions WHERE status = 'retired'`,
    );
    expect(retired.rows.map((row) => row.world_id)).toEqual(['w_arsip-lama']);
  });

  it('mendaftarkan Elysia dan Leo dengan ekspresinya', async () => {
    const characters = await ctx.db.query<{ npc_id: string; name: string }>(
      `SELECT npc_id, name FROM world_characters
       WHERE world_id = 'w_bosku-mantan' ORDER BY position ASC`,
    );
    expect(characters.rows.map((row) => row.npc_id)).toEqual(['npc_elysia', 'npc_leo']);

    const expressions = await ctx.db.query<{ expression: string }>(
      `SELECT expression FROM world_character_expressions
       WHERE world_id = 'w_bosku-mantan' AND npc_id = 'npc_elysia'
       ORDER BY position ASC`,
    );
    expect(expressions.rows.map((row) => row.expression)).toEqual([
      'netral',
      'kesal',
      'tercengang',
      'tersenyum_tipis',
    ]);
  });
});

describe('batasan yang menegakkan aturan domain', () => {
  /** Versi terbit setiap dunia pada data rujukan. */
  const WORLD_VERSIONS: Record<string, number> = {
    'w_bosku-mantan': 7,
    'w_lentera-terakhir': 3,
    'w_rapat-tengah-malam': 1,
    'w_arsip-lama': 2,
  };

  const insertJourney = (journeyId: string, worldId = 'w_bosku-mantan') =>
    ctx.db.query(
      `INSERT INTO journeys (
         journey_id, account_id, world_id, world_version,
         persona_name, persona_age, response_locale
       ) VALUES ($1, 'acc_demo', $2, $3, 'Arfan', 24, 'id-ID')`,
      [journeyId, worldId, WORLD_VERSIONS[worldId]],
    );

  it('menolak dua perjalanan aktif untuk dunia yang sama (D-12)', async () => {
    await insertJourney('j_pertama');
    await expect(insertJourney('j_kedua')).rejects.toThrow();
  });

  it('mengizinkan perjalanan pada dunia berbeda', async () => {
    await insertJourney('j_satu', 'w_bosku-mantan');
    await expect(insertJourney('j_dua', 'w_lentera-terakhir')).resolves.toBeDefined();
  });

  it('menolak usia persona di luar rentang', async () => {
    await expect(
      ctx.db.query(
        `INSERT INTO journeys (
           journey_id, account_id, world_id, world_version,
           persona_name, persona_age, response_locale
         ) VALUES ('j_muda', 'acc_demo', 'w_bosku-mantan', 7, 'Anak', 10, 'id-ID')`,
      ),
    ).rejects.toThrow();
  });

  it('menolak status dunia yang tidak dikenal', async () => {
    await expect(
      ctx.db.query(
        `INSERT INTO world_versions (
           world_id, world_version, title, synopsis, premise,
           cover_asset_id, status, content_rating
         ) VALUES ('w_x', 1, 'X', 'X', 'X', 'a', 'entah', 'all')`,
      ),
    ).rejects.toThrow();
  });

  it('menolak portrait tanpa pemilik atau ekspresi', async () => {
    await expect(
      ctx.db.query(
        `INSERT INTO world_assets (world_id, world_version, asset_id, kind, label, uri)
         VALUES ('w_bosku-mantan', 7, 'p_tanpa_pemilik', 'portrait', 'Tanpa pemilik', 'asset://x')`,
      ),
    ).rejects.toThrow();
  });

  it('menolak penagihan dua kali untuk operasi yang sama (FR-52)', async () => {
    await ctx.db.query(
      `INSERT INTO operations (operation_id, account_id, kind, state)
       VALUES ('op_sama', 'acc_demo', 'submit_choice', 'running')`,
    );
    await ctx.db.query(
      `INSERT INTO usage_days (account_id, usage_date, tier) VALUES ('acc_demo', '2026-09-30', 'free')`,
    );

    const insertEntry = (entryId: string) =>
      ctx.db.query(
        `INSERT INTO usage_entries (
           entry_id, account_id, usage_date, operation_id,
           prompt_tokens, completion_tokens, charged_total
         ) VALUES ($1, 'acc_demo', '2026-09-30', 'op_sama', 10, 5, 15)`,
        [entryId],
      );

    await insertEntry('ue_1');
    await expect(insertEntry('ue_2')).rejects.toThrow();
  });

  it('menolak dua turn untuk operasi yang sama', async () => {
    await ctx.db.query(
      `INSERT INTO operations (operation_id, account_id, kind, state)
       VALUES ('op_turn', 'acc_demo', 'submit_choice', 'running')`,
    );
    await insertJourney('j_turn');

    const insertTurn = (turnId: string) =>
      ctx.db.query(
        `INSERT INTO turns (turn_id, journey_id, revision, operation_id, input_kind)
         VALUES ($1, 'j_turn', 1, 'op_turn', 'option')`,
        [turnId],
      );

    await insertTurn('t_1');
    await expect(insertTurn('t_2')).rejects.toThrow();
  });
});

describe('kaskade penghapusan', () => {
  it('menghapus beat dan baseline saat perjalanan dihapus', async () => {
    await ctx.db.query(
      `INSERT INTO journeys (
         journey_id, account_id, world_id, world_version,
         persona_name, persona_age, response_locale
       ) VALUES ('j_hapus', 'acc_demo', 'w_bosku-mantan', 7, 'Arfan', 24, 'id-ID')`,
    );
    await ctx.db.query(
      `INSERT INTO journey_relations_baseline (journey_id, npc_id, status, reason_public)
       VALUES ('j_hapus', 'npc_elysia', 'normal', 'Awal.')`,
    );
    await ctx.db.query(
      `INSERT INTO operations (operation_id, account_id, journey_id, kind, state)
       VALUES ('op_hapus', 'acc_demo', 'j_hapus', 'create_journey', 'succeeded')`,
    );
    await ctx.db.query(
      `INSERT INTO turns (turn_id, journey_id, revision, operation_id, input_kind)
       VALUES ('t_hapus', 'j_hapus', 1, 'op_hapus', 'opening')`,
    );
    await ctx.db.query(
      `INSERT INTO beats (beat_id, turn_id, journey_id, sequence, event)
       VALUES ('b_hapus', 't_hapus', 'j_hapus', 1, '{"type":"narrate","text":"Halo."}')`,
    );

    await ctx.db.query('DELETE FROM journeys WHERE journey_id = $1', ['j_hapus']);

    const beats = await ctx.db.query('SELECT beat_id FROM beats WHERE journey_id = $1', ['j_hapus']);
    const baseline = await ctx.db.query('SELECT npc_id FROM journey_relations_baseline WHERE journey_id = $1', [
      'j_hapus',
    ]);
    expect(beats.rows).toHaveLength(0);
    expect(baseline.rows).toHaveLength(0);
  });
});
