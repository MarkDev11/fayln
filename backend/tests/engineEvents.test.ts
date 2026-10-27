/**
 * Pencatat kejadian mesin cerita dan halaman adminnya.
 *
 * Yang dijaga di sini ada dua:
 *   1. Kejadian mesin BENAR-BENAR JADI DATA - tercatat, terbaca, terhitung -
 *      sehingga pemilik dapat melihat dari panel berapa sering simulator
 *      mengambil alih giliran, tanpa skrip manual.
 *   2. Pencatatan TIDAK PERNAH menggagalkan permintaan: cerita lebih penting
 *      daripada lognya.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { engineList } from '../src/admin/pages/enginePages';
import { EngineEventRepository } from '../src/repositories/engineEventRepository';
import { migrationsDirectory } from '../src/db/migrate';
import { createTestDatabase, type TestDatabase } from './helpers/testDb';

let ctx: TestDatabase;
let repo: EngineEventRepository;

beforeEach(async () => {
  ctx = await createTestDatabase();
  repo = new EngineEventRepository(ctx.db);
});

afterEach(async () => {
  await ctx.close();
});

describe('EngineEventRepository', () => {
  it('mencatat, membaca terbaru lebih dulu, dan menghitung per jenis', async () => {
    await repo.record({ kind: 'engine_failed', detail: 'panggilan gagal: jaringan putus' });
    await repo.record({ kind: 'simulator_used', detail: 'panggilan gagal: jaringan putus' });
    await repo.record({ kind: 'scene_rejected', detail: 'adegan ditolak: npc-tidak-dikenal' });

    const events = await repo.recent(50);

    expect(events.length).toBe(3);
    // Urutan terbalik: yang paling baru di atas.
    expect(events[0]?.kind).toBe('scene_rejected');
    expect(events[2]?.kind).toBe('engine_failed');

    const counts = await repo.countsByKind();
    expect(counts.get('engine_failed')).toBe(1);
    expect(counts.get('simulator_used')).toBe(1);
    expect(counts.get('scene_rejected')).toBe(1);
  });

  it('TIDAK menggagalkan pemanggil saat tabel kejadiannya tidak ada', async () => {
    /*
     * ---------------------------------------------------------------------------
     * JANJI UTAMA PENCATAT INI
     * ---------------------------------------------------------------------------
     * Pencatatan kejadian berjalan DI TENGAH permintaan giliran pemain. Bila
     * pencatatannya bisa melempar, satu tabel yang belum termigrasi atau satu
     * koneksi yang sekat menjadi penggagal cerita - kebalikan dari tujuannya.
     *
     * BUKTI MUTASI: hapus try/catch di `EngineEventRepository.record`, lalu uji
     * ini memerah dengan galat "relation engine_events does not exist".
     *
     * Cara mensimulasikannya: database DENGAN migrasi yang memang TIDAK memuat
     * 023, sehingga tabelnya benar-benar tidak ada.
     */
    const sumber = migrationsDirectory();
    const tujuan = mkdtempSync(join(tmpdir(), 'fayln-migrasi-tanpa-023-'));
    try {
      for (const berkas of readdirSync(sumber)) {
        if (berkas === '023_engine_events.sql') {
          continue;
        }
        copyFileSync(join(sumber, berkas), join(tujuan, berkas));
      }
      mkdirSync(tujuan, { recursive: true });

      const tanpaTabel = await createTestDatabase(tujuan);
      try {
        const repoLain = new EngineEventRepository(tanpaTabel.db);
        // Tidak melempar, meski tabelnya tidak ada.
        await expect(
          repoLain.record({ kind: 'engine_failed', detail: 'uji ketahanan' }),
        ).resolves.toBeUndefined();
      } finally {
        await tanpaTabel.close();
      }
    } finally {
      rmSync(tujuan, { recursive: true, force: true });
    }
  });
});

describe('halaman /admin/mesin', () => {
  it('memperlihatkan hitungan per jenis dan kejadian terakhir beserta rinciannya', async () => {
    /*
     * BUKTI MUTASI: hapus pemanggilan `ctx.engineEvents.recent(...)` atau
     * `countsByKind()` di `enginePages.ts`, lalu uji ini memerah - halaman
     * dirender tanpa data yang seharusnya ia tampilkan.
     */
    await repo.record({ kind: 'engine_failed', detail: 'panggilan gagal: tanpa kunci API' });
    await repo.record({ kind: 'simulator_used', detail: 'panggilan gagal: tanpa kunci API' });

    const halaman = String(
      await engineList({ engineEvents: repo } as Parameters<typeof engineList>[0]),
    );

    // Ringkasan jenisnya ada...
    expect(halaman).toContain('Panggilan model gagal');
    expect(halaman).toContain('Simulator mengambil alih');
    // ...rincian kejadiannya terbaca...
    expect(halaman).toContain('tanpa kunci API');
    // ...dan hitungannya benar (dua kejadian tercatat).
    expect(halaman).toMatch(/<b>2<\/b>/);
  });

  it('menampilkan pesan kosong saat belum ada kejadian sama sekali', async () => {
    const halaman = String(
      await engineList({ engineEvents: repo } as Parameters<typeof engineList>[0]),
    );

    expect(halaman).toContain('Belum ada kejadian');
  });
});
