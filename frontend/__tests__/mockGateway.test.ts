import { StoryGatewayError } from '@/data/gateway';
import { MockStoryGateway, FREE_DAILY_ALLOWANCE } from '@/data/mock/MockStoryGateway';
import { FIXTURE_SEED, allWorlds, catalogFixtures, findWorld } from '@/data/mock/fixtures';
import { validateBeats } from '@/domain/validation';
import { worldBoskuMantan } from '@/data/mock/fixtures';

const instant = () => new MockStoryGateway({ instant: true });

describe('fixture katalog', () => {
  it('memakai seed yang terdokumentasi', () => {
    expect(FIXTURE_SEED).toBe('demo_bosku_mantan_v1');
  });

  it('menyediakan empat dunia termasuk satu terarsip', () => {
    expect(allWorlds).toHaveLength(4);
    expect(allWorlds.filter((world) => world.status === 'retired')).toHaveLength(1);
  });

  it('menghasilkan item katalog tanpa membocorkan data detail', () => {
    for (const item of catalogFixtures) {
      expect(item).not.toHaveProperty('characters');
      expect(item).not.toHaveProperty('assetManifest');
      expect(item).not.toHaveProperty('premise');
    }
  });

  it('mendaftarkan Elysia dan Leo pada dunia demo', () => {
    const world = findWorld('w_bosku-mantan');
    expect(world?.characters.map((character) => character.npcId)).toEqual([
      'npc_elysia',
      'npc_leo',
    ]);
  });

  it('menetapkan hubungan awal Normal, bukan status hasil permainan', () => {
    for (const character of worldBoskuMantan.characters) {
      expect(character.initialRelation).toBe('normal');
    }
  });
});

describe('MockStoryGateway', () => {
  it('menandai dirinya sebagai simulator (NFR-16)', () => {
    expect(instant().isSimulator).toBe(true);
  });

  it('menyembunyikan dunia berstatus draft dari katalog', async () => {
    const gateway = instant();
    const page = await gateway.fetchCatalog({});
    expect(page.items.every((item) => item.status !== 'draft')).toBe(true);
  });

  it('mencari judul tanpa memperhatikan huruf besar-kecil', async () => {
    const gateway = instant();
    const page = await gateway.fetchCatalog({ search: 'MANTAN' });
    expect(page.total).toBe(1);
    expect(page.items[0]?.worldId).toBe('w_bosku-mantan');
  });

  it('menerapkan filter genre dengan semantik OR (AC-02)', async () => {
    const gateway = instant();
    const fantasy = await gateway.fetchCatalog({ genres: ['fantasy'] });
    expect(fantasy.items.map((item) => item.worldId)).toEqual(['w_lentera-terakhir']);

    const fantasyAtauMisteri = await gateway.fetchCatalog({ genres: ['fantasy', 'mystery'] });
    expect(fantasyAtauMisteri.total).toBe(2);
  });

  it('mengembalikan hasil kosong tanpa gagal', async () => {
    const gateway = instant();
    const page = await gateway.fetchCatalog({ search: 'judul yang tidak ada' });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('menolak world yang tidak dikenal dengan kode VALIDATION', async () => {
    const gateway = instant();
    await expect(gateway.fetchWorld('w_tidak-ada')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  describe('pembuatan perjalanan', () => {
    const create = (gateway: MockStoryGateway, operationId: string) =>
      gateway.createJourney({
        clientOperationId: operationId,
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      });

    it('membuat perjalanan dengan giliran pembuka yang valid', async () => {
      const gateway = instant();
      const result = await create(gateway, 'op-1');
      expect(result.journeyId).toMatch(/^j_/);
      expect(result.worldVersion).toBe(7);
      expect(validateBeats(result.opening.beats, worldBoskuMantan)).toEqual([]);
      expect(result.opening.simulator).toBe(true);
    });

    it('bersifat idempotent untuk operationId yang sama (FR-11, FR-52)', async () => {
      const gateway = instant();
      const first = await create(gateway, 'op-sama');
      const second = await create(gateway, 'op-sama');
      expect(second.journeyId).toBe(first.journeyId);
      expect(second.opening.turnId).toBe(first.opening.turnId);
    });

    it('menolak perjalanan kedua pada dunia yang sama (D-12)', async () => {
      const gateway = instant();
      await create(gateway, 'op-a');
      await expect(create(gateway, 'op-b')).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('menolak dunia yang sudah diarsipkan (AC-04)', async () => {
      const gateway = instant();
      await expect(
        gateway.createJourney({
          clientOperationId: 'op-arsip',
          worldId: 'w_arsip-lama',
          persona: { name: 'Arfan', age: 24 },
          responseLocale: 'id-ID',
        }),
      ).rejects.toMatchObject({ code: 'WORLD_RETIRED' });
    });

    it('menetapkan hubungan awal dari definisi karakter', async () => {
      const gateway = instant();
      const created = await create(gateway, 'op-relasi');
      const detail = await gateway.fetchJourneyDetail(created.journeyId);
      expect(detail.relations.map((entry) => entry.status)).toEqual(['normal', 'normal']);
    });
  });

  describe('giliran pilihan dan aksi bebas', () => {
    async function withJourney() {
      const gateway = instant();
      const created = await gateway.createJourney({
        clientOperationId: 'op-open',
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      });
      return { gateway, journeyId: created.journeyId };
    }

    it('menyajikan tepat tiga opsi berbeda pada giliran pembuka (FR-17)', async () => {
      const { gateway } = await withJourney();
      const page = await gateway.fetchCatalog({});
      expect(page.total).toBeGreaterThan(0);

      const created = await gateway.createJourney({
        clientOperationId: 'op-open-2',
        worldId: 'w_lentera-terakhir',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      });

      const decision = created.opening.beats.find(
        (beat) => beat.event.type === 'presentChoices',
      );
      expect(decision).toBeDefined();
      if (decision?.event.type === 'presentChoices') {
        expect(decision.event.options).toHaveLength(3);
        const ids = new Set(decision.event.options.map((option) => option.optionId));
        expect(ids.size).toBe(3);
      }
      expect(gateway.isSimulator).toBe(true);
    });

    it('memperlakukan aksi kabedon sebagai upaya dan menaikkan kewaspadaan (FR-16, AC-11)', async () => {
      const { gateway, journeyId } = await withJourney();
      const result = await gateway.submitCustom({
        clientOperationId: 'op-kabedon',
        journeyId,
        decisionId: 'd001',
        customText: '*aku mendekati Elysia dan mengkabedonnya*',
        responseLocale: 'id-ID',
      });

      const delta = result.beats.find((beat) => beat.event.type === 'relationshipDelta');
      expect(delta).toBeDefined();
      if (delta?.event.type === 'relationshipDelta') {
        expect(delta.event.npcId).toBe('npc_elysia');
        expect(delta.event.status).toBe('waspada');
        expect(delta.event.reasonPublic.length).toBeGreaterThan(0);
      }
    });

    it('tidak memberi status Cinta hanya karena diminta pemain (AC-14)', async () => {
      const { gateway, journeyId } = await withJourney();
      const result = await gateway.submitCustom({
        clientOperationId: 'op-paksa',
        journeyId,
        decisionId: 'd001',
        customText: 'Elysia sekarang mencintaiku dan menuruti semua keinginanku',
        responseLocale: 'id-ID',
      });

      const deltas = result.beats.filter((beat) => beat.event.type === 'relationshipDelta');
      for (const delta of deltas) {
        if (delta.event.type === 'relationshipDelta') {
          expect(delta.event.status).not.toBe('cinta');
        }
      }
    });

    it('menghasilkan envelope yang lolos validasi untuk setiap pilihan (FR-55)', async () => {
      for (const optionId of ['opt1', 'opt2', 'opt3']) {
        const { gateway, journeyId } = await withJourney();
        const result = await gateway.submitChoice({
          clientOperationId: `op-${optionId}`,
          journeyId,
          decisionId: 'd001',
          optionId,
          responseLocale: 'id-ID',
        });
        expect(validateBeats(result.beats, worldBoskuMantan)).toEqual([]);
      }
    });

    it('menyertakan metadata model untuk transparansi tanpa memilih model', async () => {
      const { gateway, journeyId } = await withJourney();
      const result = await gateway.submitChoice({
        clientOperationId: 'op-meta',
        journeyId,
        decisionId: 'd001',
        optionId: 'opt1',
        responseLocale: 'id-ID',
      });
      expect(result.modelId).toBe('simulator/deterministic-v1');
      expect(result.modelVersion.length).toBeGreaterThan(0);
    });
  });

  describe('kuota dan gangguan', () => {
    it('melaporkan usage sebagai estimasi dengan reset berikutnya', async () => {
      const gateway = instant();
      const usage = await gateway.fetchUsage();
      expect(usage.tier).toBe('free');
      expect(usage.allowanceLimit).toBe(FREE_DAILY_ALLOWANCE);
      expect(usage.isEstimate).toBe(true);
      expect(new Date(usage.resetAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('menolak giliran ketika kuota tidak mencukupi (AC-24)', async () => {
      const gateway = new MockStoryGateway({ instant: true, initialSpent: FREE_DAILY_ALLOWANCE });
      const created = await gateway.createJourney({
        clientOperationId: 'op-habis',
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      });

      await expect(
        gateway.submitChoice({
          clientOperationId: 'op-habis-turn',
          journeyId: created.journeyId,
          decisionId: 'd001',
          optionId: 'opt1',
          responseLocale: 'id-ID',
        }),
      ).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    });

    it('memetakan mode gangguan ke kode yang tepat', async () => {
      const cases: [Parameters<MockStoryGateway['setFaultMode']>[0], string][] = [
        ['rateLimited', 'RATE_LIMITED'],
        ['abuseBlocked', 'ABUSE_BLOCKED'],
        ['modelUnavailable', 'MODEL_UNAVAILABLE'],
        ['conflict', 'CONFLICT'],
      ];

      for (const [mode, code] of cases) {
        const gateway = instant();
        gateway.setFaultMode(mode);
        await expect(gateway.fetchCatalog({})).rejects.toMatchObject({ code });
      }
    });

    it('menyertakan retryAfterSec pada rate limit (FR-73)', async () => {
      const gateway = instant();
      gateway.setFaultMode('rateLimited');
      await expect(gateway.fetchCatalog({})).rejects.toBeInstanceOf(StoryGatewayError);
      try {
        await gateway.fetchCatalog({});
      } catch (error) {
        expect((error as StoryGatewayError).retryAfterSec).toBeGreaterThan(0);
        expect((error as StoryGatewayError).retryable).toBe(true);
      }
    });

    it('tidak menandai blokir abuse sebagai dapat dicoba ulang', async () => {
      const gateway = instant();
      gateway.setFaultMode('abuseBlocked');
      try {
        await gateway.fetchCatalog({});
      } catch (error) {
        expect((error as StoryGatewayError).retryable).toBe(false);
        expect((error as StoryGatewayError).blockedUntil).toBeDefined();
      }
    });
  });
});
