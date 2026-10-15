/**
 * Master status hubungan.
 *
 * ---------------------------------------------------------------------------
 * APA YANG DIJAGA DI SINI, DAN MENGAPA BUKAN DI TEMPAT LAIN
 * ---------------------------------------------------------------------------
 * Sampai 13 Oktober 2026, daftar status hubungan adalah KONSTANTA DI DALAM KODE,
 * disalin ke lima tempat — konstanta TS, `CHECK` di skema, array di aplikasi
 * pemain, kunci terjemahan, dan arti untuk model. Menambah status kesembilan
 * berarti menyunting kelimanya, dan melewatkan salah satu adalah kegagalan
 * SENYAP: nilai ditolak basis data, atau tersimpan baik-baik saja lalu tampil
 * "Belum diketahui" di layar pemain tanpa satu pun galat.
 *
 * Karena itu yang dibuktikan di sini bukan "tabelnya ada", melainkan janji yang
 * membuat fitur ini hidup:
 *
 *   1. status BARU yang dibuat admin benar-benar dapat dipakai sampai ke prompt
 *      dan mesin cerita — tanpa menyentuh kode;
 *   2. status yang masih dipakai cerita TIDAK dapat dihapus, termasuk bila satu-
 *      satunya rujukan ada di dalam beat (JSONB, tanpa kunci asing);
 *   3. kosakata DIBEKUKAN per versi dunia, sehingga menyunting arti sebuah status
 *      tidak menulis ulang perjalanan yang sudah berjalan.
 *
 * Nomor 3 adalah keputusan pemilik produk: "perjalanan yang sudah berjalan tetap
 * memakai definisi lamanya".
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RelationsRepository, freezeRelationVocabulary } from '../src/admin/relationsRepository';
import { WorldDraftRepository } from '../src/admin/worldDraftRepository';
import { JourneyRepository } from '../src/repositories/journeyRepository';
import { cocokkanStatus, periksaAdegan } from '../src/services/aiStoryEngine';
import { buildStoryUserPrompt } from '../src/services/storyPrompt';
import type { AssetManifest, NPCPublicDTO, RelationVocabularyEntry } from '../src/contracts/types';

import { createTestDatabase, type TestDatabase } from './helpers/testDb';

let ctx: TestDatabase;
let relations: RelationsRepository;

beforeEach(async () => {
  ctx = await createTestDatabase();
  relations = new RelationsRepository(ctx.db);
});

afterEach(async () => {
  await ctx.close();
});

/* ------------------------------------------------------------------ */
/* Bahan                                                               */
/* ------------------------------------------------------------------ */

/** Membuat satu versi dunia beserta satu perjalanan di atasnya. */
async function siapkanPerjalanan(
  suffix: string,
  statusVersi: 'draft' | 'published' = 'published',
): Promise<{ worldId: string; journeyId: string }> {
  const worldId = `w_uji_${suffix}`;
  const journeyId = `j_uji_${suffix}`;
  const accountId = `acc_${suffix}`;

  await ctx.db.query('INSERT INTO worlds (world_id) VALUES ($1)', [worldId]);
  await ctx.db.query(
    `INSERT INTO world_versions (
       world_id, world_version, title, synopsis, premise, cover_asset_id,
       status, content_rating, published_at
     ) VALUES ($1, 1, 'Judul', 'Sinopsis', 'Premis', '', $2, 'all', null)`,
    [worldId, statusVersi],
  );
  await ctx.db.query('INSERT INTO accounts (account_id) VALUES ($1)', [accountId]);
  await ctx.db.query(
    `INSERT INTO journeys (
       journey_id, account_id, world_id, world_version, persona_name, persona_age, response_locale
     ) VALUES ($1, $2, $3, 1, 'Arfan', 24, 'id-ID')`,
    [journeyId, accountId, worldId],
  );

  return { worldId, journeyId };
}

/** Menyisipkan satu beat `relationshipDelta` lengkap dengan rantai kuncinya. */
async function sisipkanBeat(
  journeyId: string,
  status: string,
  urutan = 1,
): Promise<void> {
  const operationId = `op_${journeyId}_${String(urutan)}`;
  const turnId = `turn_${journeyId}_${String(urutan)}`;

  await ctx.db.query(
    `INSERT INTO operations (operation_id, account_id, journey_id, kind, state)
     SELECT $1, j.account_id, j.journey_id, 'submit_choice', 'succeeded'
     FROM journeys j WHERE j.journey_id = $2`,
    [operationId, journeyId],
  );
  await ctx.db.query(
    `INSERT INTO turns (turn_id, journey_id, revision, operation_id, input_kind)
     VALUES ($1, $2, $3, $4, 'option')`,
    [turnId, journeyId, urutan, operationId],
  );
  await ctx.db.query(
    `INSERT INTO beats (beat_id, turn_id, journey_id, sequence, event)
     VALUES ($1, $2, $3, 1, $4::jsonb)`,
    [
      `b_${journeyId}_${String(urutan)}`,
      turnId,
      journeyId,
      JSON.stringify({ type: 'relationshipDelta', npcId: 'npc_rina', status, reasonPublic: 'Sebab.' }),
    ],
  );
}

/* ------------------------------------------------------------------ */
/* Master                                                              */
/* ------------------------------------------------------------------ */

describe('master hubungan', () => {
  it('memuat delapan status bawaan, terurut dan aktif', async () => {
    /*
     * Migrasi 021 mengisi delapan nilai lama APA ADANYA — id dan labelnya tidak
     * berubah, supaya perjalanan yang sudah menyimpannya tetap terbaca.
     */
    const daftar = await relations.list();

    expect(daftar.map((item) => item.relationId)).toEqual([
      'normal',
      'hangat',
      'waspada',
      'tegang',
      'renggang',
      'dekat',
      'sayang',
      'cinta',
    ]);
    expect(daftar.every((item) => item.active)).toBe(true);
    expect(daftar.every((item) => item.meaning.trim().length > 0)).toBe(true);
    expect(daftar.map((item) => item.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('membuat ID dari label, dan TIDAK menolak label yang menabrak', async () => {
    /*
     * Admin menambah "Curiga" dua kali berarti ia ingin dua baris — bukan ingin
     * diberi pelajaran tentang id. Karena itu id kedua diberi akhiran, bukan
     * ditolak.
     *
     * BUKTI MUTASI: buat `uniqueId()` selalu mengembalikan id dasar, lalu uji ini
     * memerah pada baris kedua.
     */
    const pertama = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi pemain diam-diam.',
      behaviourHint: 'Menjaga jarak sambil tetap menjawab seperlunya.',
      active: true,
    });
    const kedua = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi dengan cara lain.',
      behaviourHint: 'Mengajukan pertanyaan dari jauh.',
      active: true,
    });

    expect(pertama.ok).toBe(true);
    expect(kedua.ok).toBe(true);
    expect(pertama.relationId).toBe('rel_curiga');
    expect(kedua.relationId).not.toBe(pertama.relationId);
  });

  it('TIDAK mengubah ID saat label dan artinya disunting', async () => {
    // Id dirujuk hubungan awal karakter, kosakata versi terbit, dan beat
    // perjalanan pemain. Menggantinya berarti menulis ulang riwayat.
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });
    expect(dibuat.ok).toBe(true);
    expect((await relations.find(dibuat.relationId ?? ''))?.behaviourHint).toBe(
      'Menjaga jarak sambil mengawasi.',
    );

    const diubah = await relations.update(dibuat.relationId ?? '', {
      labelId: 'Curiga Sekali',
      labelEn: 'Very suspicious',
      meaning: 'Mengawasi tanpa henti.',
      behaviourHint: 'Terus meminta kabar dan menjaga jarak.',
      active: true,
    });
    expect(diubah.ok).toBe(true);

    const baris = await relations.find(dibuat.relationId ?? '');
    expect(baris?.labelId).toBe('Curiga Sekali');
    expect(baris?.meaning).toBe('Mengawasi tanpa henti.');
    expect(baris?.behaviourHint).toBe('Terus meminta kabar dan menjaga jarak.');
  });

  it('menyimpan label dan keadaan TANPA mengirim arti atau contoh sikap, dan keduanya TETAP', async () => {
    /*
     * ---------------------------------------------------------------------------
     * PENJAGA UNTUK TOMBOL "SIMPAN" PADA BARIS
     * ---------------------------------------------------------------------------
     * Halaman mengirim dua formulir terpisah per baris. Formulir label dan
     * keadaan TIDAK memiliki kolom arti atau contoh sikap, jadi ia mengirim
     * {relationId, labelId, labelEn, active} saja.
     *
     * Bentuk pertama mewajibkan `meaning` di skema perubahannya, sehingga
     * formulir itu SELALU ditolak — dan karena definisi yang sudah dipakai tidak
     * dapat dihapus, menyunting label dan keadaan adalah satu-satunya jalan
     * menonaktifkan sebuah status. Tombolnya mati berarti status yang sudah
     * dipakai terkunci selamanya.
     *
     * BUKTI MUTASI: kembalikan `meaning = $4` atau
     * `behaviour_hint = $6` (tanpa `coalesce`) pada
     * `relationsRepository.update`, lalu uji ini memerah pada data yang hilang.
     */
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi pemain diam-diam.',
      behaviourHint: 'Menjaga jarak sambil tetap menjawab seperlunya.',
      active: true,
    });

    const diubah = await relations.update(dibuat.relationId ?? '', {
      labelId: 'Curiga Sekali',
      labelEn: 'Very suspicious',
      active: false,
    });

    expect(diubah.ok).toBe(true);

    const baris = await relations.find(dibuat.relationId ?? '');
    expect(baris?.labelId).toBe('Curiga Sekali');
    expect(baris?.active).toBe(false);
    // Arti dan contoh sikap TIDAK boleh hilang hanya karena formulir tidak mengirimnya.
    expect(baris?.meaning).toBe('Mengawasi pemain diam-diam.');
    expect(baris?.behaviourHint).toBe('Menjaga jarak sambil tetap menjawab seperlunya.');
  });

  it('menolak status hubungan yang tidak ada di master', async () => {
    /*
     * `CHECK` harfiah di migrasi 001 DIGANTI kunci asing ke master. Inilah yang
     * membuat status kesembilan mungkin: `CHECK` menulis nilainya secara
     * harfiah, jadi nilai apa pun yang belum tertulis di situ selalu ditolak.
     */
    const { worldId } = await siapkanPerjalanan('fk');

    await expect(
      ctx.db.query(
        `INSERT INTO world_characters (
           world_id, world_version, npc_id, name, role, public_backstory,
           initial_relation, default_portrait_asset_id, position
         ) VALUES ($1, 1, 'npc_x', 'X', 'peran', '', 'tidak_ada_di_master', '', 1)`,
        [worldId],
      ),
    ).rejects.toThrow();
  });

  it('menerima status BARU tanpa migrasi', async () => {
    // Kebalikan dari uji di atas: begitu statusnya ada di master, basis data
    // menerimanya. Tidak ada `CHECK` yang perlu disunting.
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });
    const { worldId } = await siapkanPerjalanan('baru');

    await ctx.db.query(
      `INSERT INTO world_characters (
         world_id, world_version, npc_id, name, role, public_backstory,
         initial_relation, default_portrait_asset_id, position
       ) VALUES ($1, 1, 'npc_x', 'X', 'peran', '', $2, '', 1)`,
      [worldId, dibuat.relationId],
    );

    const { rows } = await ctx.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM world_characters
       WHERE world_id = $1 AND initial_relation = $2`,
      [worldId, dibuat.relationId],
    );
    expect(rows[0]?.total).toBe(1);
  });

  it('menonaktifkan TIDAK menghapus, dan menyembunyikannya dari pilihan baru', async () => {
    await relations.update('waspada', {
      labelId: 'Waspada',
      labelEn: 'Wary',
      meaning: 'Waspada.',
      active: false,
    });

    expect(await relations.find('waspada')).not.toBeNull();
    const ditawarkan = await relations.listOfferable();
    expect(ditawarkan.map((item) => item.relationId)).not.toContain('waspada');

    /*
     * Tetapi status yang SUDAH dipakai tetap ditawarkan untuk pilihan itu —
     * tanpa ini, membuka kembali karakter lama akan memilih pilihan pertama
     * tanpa suara, dan menyimpannya diam-diam mengubah hubungan awalnya.
     */
    const untukKarakterLama = await relations.listOfferable(['waspada']);
    expect(untukKarakterLama.map((item) => item.relationId)).toContain('waspada');
  });

  it('menghapus status yang belum dipakai', async () => {
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });

    expect((await relations.remove(dibuat.relationId ?? '')).ok).toBe(true);
    expect(await relations.find(dibuat.relationId ?? '')).toBeNull();
  });

  it('menolak menghapus status yang HANYA dirujuk sebuah beat', async () => {
    /*
     * ---------------------------------------------------------------------------
     * MENGAPA UJI INI PENTING
     * ---------------------------------------------------------------------------
     * `beats.event` adalah JSONB. Tidak ada kunci asing yang menahannya, dan
     * tidak ada `CHECK` yang memeriksanya. Pemeriksaan "dipakai sebuah dunia"
     * saja akan MELOLOSKAN penghapusan ini — dan riwayat perjalanan pemain
     * menunjuk status yang tidak ada lagi, sehingga labelnya berubah menjadi id
     * mentah di tengah cerita yang sudah dibaca.
     *
     * BUKTI MUTASI: hapus kueri `beats` dari `usageCounts()`, lalu uji ini
     * memerah.
     */
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });
    const { journeyId } = await siapkanPerjalanan('beat');
    await sisipkanBeat(journeyId, dibuat.relationId ?? '');

    const hasil = await relations.remove(dibuat.relationId ?? '');

    expect(hasil.ok).toBe(false);
    expect(hasil.ok === false && hasil.reason).toBe('in-use');
    expect(await relations.find(dibuat.relationId ?? '')).not.toBeNull();
  });

  it('menolak menghapus status yang dirujuk perjalanan pemain saja', async () => {
    // Sumber rujukan ketiga: hubungan awal yang sudah disalin ke perjalanan.
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });
    const { journeyId } = await siapkanPerjalanan('baseline');
    await ctx.db.query(
      `INSERT INTO journey_relations_baseline (journey_id, npc_id, status, reason_public)
       VALUES ($1, 'npc_rina', $2, 'Hubungan awal.')`,
      [journeyId, dibuat.relationId],
    );

    const hasil = await relations.remove(dibuat.relationId ?? '');
    expect(hasil.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Kosakata yang dibekukan                                             */
/* ------------------------------------------------------------------ */

describe('kosakata dibekukan per versi dunia', () => {
  it('membekukan seluruh status aktif untuk versi itu', async () => {
    const { worldId } = await siapkanPerjalanan('beku');
    await freezeRelationVocabulary(ctx.db, worldId, 1);

    const journeys = new JourneyRepository(ctx.db);
    const kosakata = await journeys.relationshipVocabulary(worldId, 1);

    expect(kosakata).toHaveLength(8);
    expect(kosakata.map((item) => item.relationId)).toContain('waspada');
    expect(kosakata[0]?.meaning.trim().length).toBeGreaterThan(0);
  });

  it('membawa contoh sikap buatan admin ke kosakata yang dibekukan', async () => {
    /*
     * BUKTI MUTASI: hapus `behaviour_hint` dari SELECT/INSERT di
     * `freezeRelationVocabulary()` atau dari pemetaan `journeyRepository`, lalu
     * nilai yang sengaja dibuat di sini hilang dan uji ini memerah.
     */
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi pemain diam-diam.',
      behaviourHint: 'Mundur setengah langkah dan menjawab seperlunya.',
      active: true,
    });
    const { worldId } = await siapkanPerjalanan('beku_hint');
    await freezeRelationVocabulary(ctx.db, worldId, 1);

    const kosakata = await new JourneyRepository(ctx.db).relationshipVocabulary(worldId, 1);
    expect(kosakata.find((item) => item.relationId === dibuat.relationId)?.behaviourHint).toBe(
      'Mundur setengah langkah dan menjawab seperlunya.',
    );
  });

  it('menyertakan status yang SEDANG dipakai walau sudah nonaktif', async () => {
    /*
     * Tanpa aturan ini, karakter yang memakai status yang baru saja
     * dinonaktifkan kehilangan namanya, dan adegan berikutnya kehilangan daftar
     * status yang sah untuk tokoh itu.
     */
    const dibuat = await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });
    const { worldId } = await siapkanPerjalanan('dipakai');
    await ctx.db.query(
      `INSERT INTO world_characters (
         world_id, world_version, npc_id, name, role, public_backstory,
         initial_relation, default_portrait_asset_id, position
       ) VALUES ($1, 1, 'npc_x', 'X', 'peran', '', $2, '', 1)`,
      [worldId, dibuat.relationId],
    );

    await relations.update(dibuat.relationId ?? '', {
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      active: false,
    });
    await freezeRelationVocabulary(ctx.db, worldId, 1);

    const journeys = new JourneyRepository(ctx.db);
    const kosakata = await journeys.relationshipVocabulary(worldId, 1);
    expect(kosakata.map((item) => item.relationId)).toContain(dibuat.relationId);
  });

  it('TIDAK menulis ulang kosakata versi yang sudah terbit saat diterbitkan lagi', async () => {
    /*
     * ---------------------------------------------------------------------------
     * INI JANJI UTAMANYA
     * ---------------------------------------------------------------------------
     * Keputusan pemilik produk: "perjalanan yang sudah berjalan tetap memakai
     * definisi lamanya". Menekan "terbitkan" dua kali adalah perbuatan yang
     * tampak paling tidak berbahaya, dan justru di situlah janji itu paling
     * mudah dilanggar.
     *
     * BUKTI MUTASI: hapus `if (rowCount === 0) return false;` dari
     * `publishDraft`, lalu uji ini memerah.
     */
    const { worldId } = await siapkanPerjalanan('terbit', 'draft');
    const drafts = new WorldDraftRepository(ctx.db);

    expect(await drafts.publishDraft(worldId, 1)).toBe(true);

    const journeys = new JourneyRepository(ctx.db);
    const sebelum = await journeys.relationshipVocabulary(worldId, 1);

    // Dunia disunting SETELAH terbit: status baru ditambahkan ke master.
    await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });

    // Terbitkan lagi — tidak boleh mengubah kosakata versi yang sudah terbit.
    expect(await drafts.publishDraft(worldId, 1)).toBe(false);

    const sesudah = await journeys.relationshipVocabulary(worldId, 1);
    expect(sesudah).toEqual(sebelum);
    expect(sesudah.map((item) => item.relationId)).not.toContain('rel_curiga');
  });

  it('versi dunia LAIN tetap memakai kosakatanya sendiri', async () => {
    // Dua versi dunia yang berbeda tidak saling menimpa.
    const a = await siapkanPerjalanan('a');
    const b = await siapkanPerjalanan('b');
    await freezeRelationVocabulary(ctx.db, a.worldId, 1);

    await relations.create({
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi.',
      behaviourHint: 'Menjaga jarak sambil mengawasi.',
      active: true,
    });
    await freezeRelationVocabulary(ctx.db, b.worldId, 1);

    const journeys = new JourneyRepository(ctx.db);
    const kosakataA = await journeys.relationshipVocabulary(a.worldId, 1);
    const kosakataB = await journeys.relationshipVocabulary(b.worldId, 1);

    expect(kosakataA.map((item) => item.relationId)).not.toContain('rel_curiga');
    expect(kosakataB.map((item) => item.relationId)).toContain('rel_curiga');
  });
});

/* ------------------------------------------------------------------ */
/* Sampai ke prompt dan mesin                                          */
/* ------------------------------------------------------------------ */

const MANIFEST = {
  cover: null,
  backgrounds: [{ assetId: 'bg_kantor', label: 'Kantor', uri: '' }],
  portraits: [{ assetId: 'p_rina', label: 'Rina', uri: '', npcId: 'npc_rina' }],
} as unknown as AssetManifest;

const KARAKTER = [
  {
    npcId: 'npc_rina',
    name: 'Rina',
    role: 'bosmu',
    soul: 'Keras di permukaan.',
    publicBackstory: 'Mantan pacarmu.',
    initialRelation: 'normal',
    expressions: ['senyum'],
    defaultPortraitAssetId: 'p_rina',
  },
] as unknown as NPCPublicDTO[];

function kosakataDenganSembilan(): RelationVocabularyEntry[] {
  return [
    { relationId: 'normal', labelId: 'Normal', labelEn: 'Neutral', meaning: 'Netral.', behaviourHint: '', position: 1 },
    { relationId: 'waspada', labelId: 'Waspada', labelEn: 'Wary', meaning: 'Waspada.', behaviourHint: '', position: 2 },
    {
      relationId: 'rel_curiga',
      labelId: 'Curiga',
      labelEn: 'Suspicious',
      meaning: 'Mengawasi pemain diam-diam, tetapi tetap sopan.',
      behaviourHint: 'Menjaga jarak sambil tetap berbicara sopan.',
      position: 3,
    },
  ];
}

function adegan(status: string) {
  return {
    beats: [
      { type: 'setBackground', assetId: 'bg_kantor' },
      { type: 'narrate', text: 'Kamu menyebut masa lalu di depan tim.' },
      { type: 'relationshipDelta', npcId: 'npc_rina', status, reasonPublic: 'Ia tersinggung.' },
      { type: 'narrate', text: 'Rina menutup buku catatannya.' },
    ],
    decision: {
      prompt: 'Apa yang kamu lakukan?',
      options: [
        { optionId: 'o1', label: 'Minta maaf', description: 'Akui salahmu.' },
        { optionId: 'o2', label: 'Diam', description: 'Biarkan reda.' },
        { optionId: 'o3', label: 'Bercanda', description: 'Cairkan suasana.' },
      ],
    },
  };
}

describe('status kesembilan sampai ke prompt dan mesin', () => {
  it('prompt menyebut status kesembilan BESERTA artinya', async () => {
    const pesan = buildStoryUserPrompt({
      worldTitle: 'Judul',
      premise: 'Premis',
      synopsis: 'Sinopsis',
      persona: { name: 'Arfan', age: 24 },
      backgrounds: [],
      characters: [],
      storySoFar: null,
      recentBeats: [],
      relations: [],
      relationVocabulary: kosakataDenganSembilan().map((item) => ({
        relationId: item.relationId,
        meaning: item.meaning,
        behaviourHint: item.behaviourHint,
      })),
      playerAction: null,
      responseLocale: 'id-ID',
    });

    expect(pesan).toContain('"rel_curiga"');
    expect(pesan).toContain('Mengawasi pemain diam-diam');
  });

  it('mesin menerima status kesembilan', async () => {
    const hasil = periksaAdegan(adegan('rel_curiga'), MANIFEST, KARAKTER, kosakataDenganSembilan());

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    const delta = hasil.events.find((event) => event.type === 'relationshipDelta');
    expect(delta).toMatchObject({ status: 'rel_curiga' });
  });

  it('cocokkanStatus memakai kosakata dunia, bukan daftar bawaan', async () => {
    expect(cocokkanStatus('rel_curiga', kosakataDenganSembilan())).toBe('rel_curiga');
    // Status bawaan yang TIDAK ada di kosakata dunia ini tidak sah di sini.
    expect(cocokkanStatus('cinta', kosakataDenganSembilan())).toBeUndefined();
  });

  it('membuang status yang tidak ada di kosakata TANPA menjatuhkan seluruh adegan', async () => {
    /*
     * Pola "looping" yang sudah empat kali menggigit proyek ini: satu
     * pelanggaran kecil menolak SELURUH adegan, lalu seluruh giliran jatuh ke
     * simulator yang keluarannya sama terus. Kehilangan satu perubahan hubungan
     * jauh lebih ringan.
     */
    const hasil = periksaAdegan(adegan('marah'), MANIFEST, KARAKTER, kosakataDenganSembilan());

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    expect(hasil.events.some((event) => event.type === 'relationshipDelta')).toBe(false);
    expect(hasil.skipped.join(' ')).toContain('status tidak dikenal');
    // Sisa adegannya tetap utuh — ceritanya tidak ikut hilang.
    expect(hasil.events.some((event) => event.type === 'narrate')).toBe(true);
  });
});
