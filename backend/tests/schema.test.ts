/**
 * Pengujian skema dan migrasi.
 *
 * Yang dibuktikan di sini bukan "migrasi berjalan tanpa galat", melainkan bahwa
 * batasan yang menjadi dasar aturan domain benar-benar ditegakkan database.
 */

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  listMigrationFiles,
  migrationsDirectory,
  runMigrations,
} from '../src/db/migrate';
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
    '007_media.sql',
    '008_asset_metadata.sql',
    '009_genres.sql',
    '010_characters.sql',
    '011_locations.sql',
    '012_lokasi_sederhana.sql',
    '013_providers.sql',
    '014_provider_api_key.sql',
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

  it('memberi jendela tunggu yang cukup panjang saat database belum siap', async () => {
    const { DEFAULT_MIGRATION_ATTEMPTS, DEFAULT_MIGRATION_BACKOFF_MS } = await import(
      '../src/db/migrate'
    );

    let total = 0;
    for (let attempt = 0; attempt < DEFAULT_MIGRATION_ATTEMPTS - 1; attempt += 1) {
      total += DEFAULT_MIGRATION_BACKOFF_MS(attempt);
    }

    /*
     * Jendela ± 23 detik terbukti terlalu pendek pada 5–6 Oktober 2026: saat
     * deploy, database menolak koneksi lebih lama daripada itu, aplikasi keluar,
     * platform mengulanginya lima kali, dan produksi menyajikan 503 selama
     * beberapa menit sebelum kembali ke versi LAMA.
     *
     * Angka ini bukan target performa — ia kebijakan. Menurunkannya kembali akan
     * mengembalikan deploy yang gagal tanpa gejala di kode.
     */
    expect(total, 'jendela tunggu terlalu pendek untuk menutupi database yang belum siap').toBeGreaterThanOrEqual(40_000);
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

  /**
   * Master karakter: ekspresi WAJIB punya gambar.
   *
   * Nama ekspresi tanpa gambar adalah data mati — klien tidak dapat
   * merendernya, dan mesin cerita dapat memilih ekspresi yang tidak punya
   * gambar sama sekali. Aturan itu sudah ditegakkan di kode pada jalur wizard;
   * di sini ia ditegakkan basis data, supaya tidak ada jalur simpan lain yang
   * dapat menyelundupkannya.
   */
  it('menolak ekspresi master yang gambarnya kosong', async () => {
    await ctx.db.query(
      `INSERT INTO characters (character_id, name, position) VALUES ('char_uji', 'Uji', 1)`,
    );
    await expect(
      ctx.db.query(
        `INSERT INTO character_expressions (character_id, position, expression)
         VALUES ('char_uji', 0, 'netral')`,
      ),
    ).rejects.toThrow();
  });

  it('menolak ekspresi master yang menunjuk gambar tidak ada', async () => {
    await ctx.db.query(
      `INSERT INTO characters (character_id, name, position) VALUES ('char_uji2', 'Uji', 1)`,
    );
    await expect(
      ctx.db.query(
        `INSERT INTO character_expressions (character_id, position, expression, media_id)
         VALUES ('char_uji2', 0, 'netral', 'm_tidak_ada')`,
      ),
    ).rejects.toThrow();
  });

  it('menerima ekspresi master bila gambarnya benar-benar tersimpan', async () => {
    await ctx.db.query(
      `INSERT INTO characters (character_id, name, position) VALUES ('char_ok', 'Ok', 1)`,
    );
    await ctx.db.query(
      `INSERT INTO media_blobs (media_id, content_type, byte_size, width, height, content_base64)
       VALUES ('m_uji', 'image/png', 68, 1, 1, 'iVBORw0KGgo=')`,
    );
    await expect(
      ctx.db.query(
        `INSERT INTO character_expressions (character_id, position, expression, media_id)
         VALUES ('char_ok', 0, 'netral', 'm_uji')`,
      ),
    ).resolves.toBeDefined();
  });

  /**
   * Master lokasi: satu lokasi = satu nama, satu kategori, satu gambar.
   *
   * Lokasi tanpa gambar tidak dapat dirender, dan tanpa kategori tidak dapat
   * ditawarkan di pemilih wizard. Keduanya sudah ditolak repository; di sini
   * ditunjukkan bahwa basis data menegakkannya lagi, supaya tidak ada jalur
   * simpan lain yang dapat menyelundupkannya.
   *
   * Setiap uji menyiapkan sendiri bahannya. Uji yang bergantung pada uji
   * sebelumnya lulus atau gagal menurut URUTAN, bukan menurut kebenaran — dan
   * kegagalannya baru terlihat ketika seseorang menjalankan satu uji saja.
   */
  async function seedLocationMaster(
    suffix: string,
  ): Promise<{ category: string; media: string }> {
    const category = `cat_${suffix}`;
    const media = `m_${suffix}`;

    await ctx.db.query(
      `INSERT INTO location_categories (category_id, name, position) VALUES ($1, 'era uji', 1)`,
      [category],
    );
    await ctx.db.query(
      `INSERT INTO media_blobs (media_id, content_type, byte_size, width, height, content_base64)
       VALUES ($1, 'image/png', 68, 1, 1, 'iVBORw0KGgo=')`,
      [media],
    );

    return { category, media };
  }

  const insertLocation = (id: string, category: string, media: string) =>
    ctx.db.query(
      `INSERT INTO locations (location_id, name, category_id, media_id)
       VALUES ($1, 'Aula', $2, $3)`,
      [id, category, media],
    );

  it('menolak lokasi master tanpa gambar', async () => {
    const { category } = await seedLocationMaster('tanpa_gambar');

    await expect(
      ctx.db.query(
        `INSERT INTO locations (location_id, name, category_id, media_id)
         VALUES ('loc_tanpa_gambar', 'Aula', $1, null)`,
        [category],
      ),
    ).rejects.toThrow();
  });

  it('menolak lokasi master yang menunjuk gambar tidak ada', async () => {
    const { category } = await seedLocationMaster('media_hantu');

    await expect(insertLocation('loc_media_hantu', category, 'm_tidak_ada')).rejects.toThrow();
  });

  it('menolak lokasi master yang kategorinya tidak ada', async () => {
    const { media } = await seedLocationMaster('kategori_hantu');

    await expect(insertLocation('loc_kategori_hantu', 'cat_hantu', media)).rejects.toThrow();
  });

  it('menolak menghapus kategori master yang masih dipakai lokasi', async () => {
    const { category, media } = await seedLocationMaster('restrict');
    await insertLocation('loc_restrict', category, media);

    // ON DELETE RESTRICT: menghapus kategori akan memutus seluruh lokasi di era
    // itu sekaligus, jadi basis data menolaknya lebih dulu.
    await expect(
      ctx.db.query(`DELETE FROM location_categories WHERE category_id = $1`, [category]),
    ).rejects.toThrow();
  });

  /**
   * Tautan dari sisi dunia: latar yang dipungut menunjuk master, dan kunci
   * asingnya MENAHAN penghapusan. Tanpa ini, menghapus lokasi master akan
   * memutus latar di cerita yang sudah terbit.
   */
  it('menahan penghapusan lokasi master yang sudah dipungut dunia', async () => {
    const { category, media } = await seedLocationMaster('dipakai');
    await insertLocation('loc_dipakai', category, media);
    await ctx.db.query(
      `INSERT INTO world_assets (
         world_id, world_version, asset_id, kind, label, uri,
         master_location_id, master_category_id
       ) VALUES ('w_bosku-mantan', 7, 'bg_pungut', 'background', 'Aula', 'asset://x',
                 'loc_dipakai', $1)`,
      [category],
    );

    await expect(
      ctx.db.query(`DELETE FROM locations WHERE location_id = 'loc_dipakai'`),
    ).rejects.toThrow();

    await ctx.db.query(
      `DELETE FROM world_assets WHERE world_id = 'w_bosku-mantan' AND asset_id = 'bg_pungut'`,
    );
    await expect(
      ctx.db.query(`DELETE FROM locations WHERE location_id = 'loc_dipakai'`),
    ).resolves.toBeDefined();
  });

  /**
   * Migrasi 012 memindahkan gambar latar ke `locations` lalu membuang tabel
   * latarnya.
   *
   * Itu satu-satunya bagian perubahan ini yang dapat MENGHILANGKAN data, dan
   * pada basis data kosong ia tidak membuktikan apa pun. Karena itu keadaannya
   * dibangun ulang di sini: migrasi 001–011 dijalankan dari salinan di folder
   * sementara, diisi bentuk lama, baru 012 dijalankan.
   */
  it('migrasi 012 memindahkan latar lama menjadi lokasi tanpa ada yang hilang', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'fayln-migrasi-'));
    const earlier = listMigrationFiles().filter((name) => name < '012_lokasi_sederhana.sql');
    expect(earlier.length, 'tidak ada migrasi sebelum 012').toBeGreaterThan(0);
    for (const name of earlier) {
      copyFileSync(join(migrationsDirectory(), name), join(directory, name));
    }

    const before = await createTestDatabase(directory);
    try {
      await before.db.query(
        `INSERT INTO location_categories (category_id, name, position)
         VALUES ('cat_dinasti', 'era dinasti', 1), ('cat_kini', 'masa kini', 2)`,
      );
      for (const media of ['m_dinasti', 'm_kini']) {
        await before.db.query(
          `INSERT INTO media_blobs (media_id, content_type, byte_size, width, height, content_base64)
           VALUES ($1, 'image/png', 68, 1, 1, 'iVBORw0KGgo=')`,
          [media],
        );
      }

      // Satu tempat pada DUA era, dan satu tempat yang tidak pernah diberi latar.
      await before.db.query(
        `INSERT INTO locations (location_id, name, position)
         VALUES ('loc_dua_era', 'Aula Kantor', 1), ('loc_tanpa_latar', 'Gudang', 2)`,
      );
      await before.db.query(
        `INSERT INTO location_backgrounds (location_id, category_id, media_id, description)
         VALUES ('loc_dua_era', 'cat_dinasti', 'm_dinasti', 'Aula zaman kerajaan')`,
      );
      await before.db.query(
        `INSERT INTO location_backgrounds (location_id, category_id, media_id, description)
         VALUES ('loc_dua_era', 'cat_kini', 'm_kini', 'Aula kantor modern')`,
      );

      await runMigrations(before.db);

      const { rows } = await before.db.query<{
        location_id: string;
        media_id: string;
        category_id: string;
        description: string;
      }>('SELECT location_id, media_id, category_id, description FROM locations ORDER BY media_id');

      // KEDUA latar selamat. Mana yang mempertahankan id lama tidak ditentukan
      // — bentuk lama memang mengizinkan banyak baris untuk satu lokasi — jadi
      // yang diperiksa adalah kelengkapan datanya, bukan pemenangnya.
      expect(rows.map((row) => row.media_id)).toEqual(['m_dinasti', 'm_kini']);
      expect(rows.map((row) => row.category_id)).toEqual(['cat_dinasti', 'cat_kini']);
      expect(rows.map((row) => row.description)).toEqual([
        'Aula zaman kerajaan',
        'Aula kantor modern',
      ]);
      // Salah satunya mempertahankan id lama, sehingga rujukan dunia tetap sahih.
      expect(rows.some((row) => row.location_id === 'loc_dua_era')).toBe(true);
      // Lokasi tanpa latar dibuang: di bentuk baru ia tidak dapat dirender.
      expect(rows.some((row) => row.location_id === 'loc_tanpa_latar')).toBe(false);

      // Tabel latarnya benar-benar sudah tidak ada.
      await expect(before.db.query('SELECT * FROM location_backgrounds')).rejects.toThrow();
    } finally {
      await before.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  /**
   * Provider model: alamat dan jenis API-nya milik provider, bukan milik model.
   *
   * Yang dijaga basis data di sini: jenis API hanya boleh salah satu dari daftar
   * (kalau tidak, jalur cerita harus menebak bentuk permintaannya), dan provider
   * yang masih dipakai model tidak dapat dihapus — model itu akan kehilangan
   * alamat tujuannya.
   */
  it('menolak jenis API provider yang tidak dikenal', async () => {
    await expect(
      ctx.db.query(
        `INSERT INTO providers (provider_id, name, prefix, api_type, base_url)
         VALUES ('prov_x', 'X', 'x', 'entah-apa', 'https://x.test/v1')`,
      ),
    ).rejects.toThrow();
  });

  it('menolak posisi provider yang negatif', async () => {
    await expect(
      ctx.db.query(
        `INSERT INTO providers (provider_id, name, prefix, api_type, base_url, position)
         VALUES ('prov_y', 'Y', 'y', 'chat-completions', 'https://y.test/v1', -1)`,
      ),
    ).rejects.toThrow();
  });

  it('menolak model yang menunjuk provider tidak ada', async () => {
    await expect(
      ctx.db.query(
        `INSERT INTO model_configs (
           model_id, label, provider_id, model_key, estimated_turn_cost, context_tokens
         ) VALUES ('m_hantu', 'Hantu', 'prov_hantu', 'x', 100, 1000)`,
      ),
    ).rejects.toThrow();
  });

  it('menahan penghapusan provider yang masih dipakai model', async () => {
    await ctx.db.query(
      `INSERT INTO providers (provider_id, name, prefix, api_type, base_url)
       VALUES ('prov_dipakai', 'Dipakai', 'dipakai', 'chat-completions', 'https://d.test/v1')`,
    );
    await ctx.db.query(
      `INSERT INTO model_configs (
         model_id, label, provider_id, model_key, estimated_turn_cost, context_tokens
       ) VALUES ('m_dipakai', 'M', 'prov_dipakai', 'x', 100, 1000)`,
    );

    await expect(
      ctx.db.query(`DELETE FROM providers WHERE provider_id = 'prov_dipakai'`),
    ).rejects.toThrow();

    await ctx.db.query(`DELETE FROM model_configs WHERE model_id = 'm_dipakai'`);
    await expect(
      ctx.db.query(`DELETE FROM providers WHERE provider_id = 'prov_dipakai'`),
    ).resolves.toBeDefined();
  });

  it('menolak penagihan dua kali untuk operasi yang sama (FR-52)', async () => {    await ctx.db.query(
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

  /**
   * Kaskade pada master karakter — diuji untuk MENGETAHUI, bukan untuk dipakai.
   *
   * `charactersRepository.remove()` membuang baris ekspresi lebih dulu di dalam
   * satu transaksi, tidak mengandalkan cascade. Uji ini memastikan apakah
   * cascade benar-benar bekerja di pg-mem; bila tidak, itu justru menegaskan
   * mengapa kode tidak boleh bergantung padanya.
   */
  it('menghapus ekspresi saat karakter master dihapus', async () => {
    await ctx.db.query(
      `INSERT INTO characters (character_id, name, position) VALUES ('char_hapus', 'Hapus', 1)`,
    );
    await ctx.db.query(
      `INSERT INTO media_blobs (media_id, content_type, byte_size, width, height, content_base64)
       VALUES ('m_hapus', 'image/png', 68, 1, 1, 'iVBORw0KGgo=')`,
    );
    await ctx.db.query(
      `INSERT INTO character_expressions (character_id, position, expression, media_id)
       VALUES ('char_hapus', 0, 'netral', 'm_hapus')`,
    );

    await ctx.db.query('DELETE FROM characters WHERE character_id = $1', ['char_hapus']);

    const expressions = await ctx.db.query(
      'SELECT expression FROM character_expressions WHERE character_id = $1',
      ['char_hapus'],
    );
    expect(expressions.rows).toHaveLength(0);
  });
});
