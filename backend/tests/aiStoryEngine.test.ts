/**
 * Mesin cerita berbasis model.
 *
 * Yang dijaga di sini bukan kualitas tulisan model — itu tidak dapat diuji tanpa
 * memanggilnya — melainkan **apa yang terjadi saat model salah**. Model yang
 * mengarang id atau lupa menulis keputusan tidak menghasilkan galat; ia
 * menghasilkan layar rusak atau pemain yang tidak punya jalan melanjutkan.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  aksiPemain,
  AiStoryEngine,
  cocokkanEkspresi,
  cocokkanNpc,
  cocokkanStatus,
  periksaAdegan,
} from '../src/services/aiStoryEngine';
import { cadanganPertanyaan, MAX_SCENE_BEATS } from '../src/services/storyPrompt';
import { DeterministicStoryEngine, karakterDenganEkspresiTampil } from '../src/services/storyEngine';
import type { StoryContext } from '../src/services/storyEngine';
import type { AssetManifest, NPCPublicDTO, RelationVocabularyEntry } from '../src/contracts/types';

/**
 * Kosakata status untuk pengujian.
 *
 * Sejak status hubungan menjadi DATA, `periksaAdegan` dan `cocokkanStatus`
 * tidak lagi membaca daftar di dalam kode: kosakatanya WAJIB dikirim pemanggil.
 * Di produksi yang mengirim adalah `journeyService`, dari salinan yang dibekukan
 * pada versi dunia. Di sini bentuk yang sama disusun tangan.
 *
 * BUKTI MUTASI: kosongkan array ini, lalu uji "menerima status yang sah"
 * memerah — dan itu memang yang diinginkan: tanpa kosakata, tidak ada status
 * yang sah.
 */
const KOSAKATA: RelationVocabularyEntry[] = [
  { relationId: 'normal', labelId: 'Normal', labelEn: 'Neutral', meaning: 'Netral.', behaviourHint: '', position: 1 },
  { relationId: 'hangat', labelId: 'Hangat', labelEn: 'Warm', meaning: 'Hangat.', behaviourHint: '', position: 2 },
  { relationId: 'waspada', labelId: 'Waspada', labelEn: 'Wary', meaning: 'Waspada.', behaviourHint: '', position: 3 },
  { relationId: 'tegang', labelId: 'Tegang', labelEn: 'Tense', meaning: 'Tegang.', behaviourHint: '', position: 4 },
  { relationId: 'renggang', labelId: 'Renggang', labelEn: 'Distant', meaning: 'Renggang.', behaviourHint: '', position: 5 },
  { relationId: 'dekat', labelId: 'Dekat', labelEn: 'Close', meaning: 'Dekat.', behaviourHint: '', position: 6 },
  { relationId: 'sayang', labelId: 'Sayang', labelEn: 'Fond', meaning: 'Sayang.', behaviourHint: '', position: 7 },
  { relationId: 'cinta', labelId: 'Cinta', labelEn: 'In love', meaning: 'Cinta.', behaviourHint: '', position: 8 },
];

const MANIFEST = {
  cover: null,
  backgrounds: [{ assetId: 'bg_kantor', label: 'Kantor', uri: '' }],
  portraits: [{ assetId: 'p_rina_senyum', label: 'Rina senyum', uri: '', npcId: 'npc_rina' }],
} as unknown as AssetManifest;

const KARAKTER = [
  {
    npcId: 'npc_rina',
    name: 'Rina',
    role: 'bosmu',
    soul: 'Keras di permukaan.',
    publicBackstory: 'Mantan pacarmu.',
    initialRelation: 'normal',
    expressions: ['senyum', 'kesal'],
    defaultPortraitAssetId: 'p_rina_senyum',
  },
] as unknown as NPCPublicDTO[];

function adeganSah(): unknown {
  return {
    beats: [
      { type: 'setBackground', assetId: 'bg_kantor' },
      { type: 'narrate', text: 'Kamu duduk di mejamu.' },
      { type: 'showCharacter', npcId: 'npc_rina', expression: 'senyum', assetId: 'p_rina_senyum' },
      { type: 'say', npcId: 'npc_rina', text: 'Kamu yang baru, kan?' },
    ],
    decision: {
      prompt: 'Apa yang kamu lakukan?',
      options: [
        { optionId: 'a', label: 'Berdiri', description: 'Menunjukkan hormat.' },
        { optionId: 'b', label: 'Tetap duduk', description: 'Tenang, tapi bisa terbaca sombong.' },
        { optionId: 'c', label: 'Tersenyum', description: 'Mencairkan suasana.' },
      ],
    },
  };
}

describe('periksaAdegan', () => {
  it('menerima adegan yang sah, dan menambahkan keputusannya sebagai beat', () => {
    const hasil = periksaAdegan(adeganSah(), MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.events).toHaveLength(5);
      expect(hasil.events[4]?.type).toBe('presentChoices');
    }
  });

  it('menolak id latar yang dikarang', () => {
    /*
     * Kegagalan paling sering, dan paling tidak terlihat: nama latar yang
     * terdengar masuk akal tetapi tidak ada di manifest membuat klien
     * menampilkan placeholder — tanpa satu pun galat.
     */
    const adegan = adeganSah() as Record<string, unknown>;
    (adegan.beats as unknown[])[0] = { type: 'setBackground', assetId: 'bg_ruang_rapat_lt12' };

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('asset-tidak-dikenal');
    }
  });

  it('menolak karakter yang tidak ada di dunia', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    (adegan.beats as unknown[])[3] = { type: 'say', npcId: 'npc_budi', text: 'Halo.' };

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('npc-tidak-dikenal');
    }
  });

  it('menolak ekspresi yang bukan milik karakter itu', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    (adegan.beats as unknown[])[2] = {
      type: 'showCharacter',
      npcId: 'npc_rina',
      expression: 'menangis',
      assetId: 'p_rina_senyum',
    };

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('ekspresi-tidak-dikenal');
    }
  });

  it('menolak adegan tanpa keputusan', () => {
    // Tanpa keputusan, pemain TIDAK PUNYA JALAN melanjutkan.
    const adegan = adeganSah() as Record<string, unknown>;
    delete adegan.decision;

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('tanpa-keputusan');
    }
  });

  it('menolak keputusan yang opsinya bukan tiga', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    const keputusan = adegan.decision as Record<string, unknown>;
    keputusan.options = (keputusan.options as unknown[]).slice(0, 2);

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('opsi-bukan-tiga');
    }
  });

  /*
   * Kelebihan beat DIPANGKAS, bukan ditolak.
   *
   * Terukur di produksi 11 Okt 2026: model menulis satu beat lebih banyak dari
   * batas, seluruh adegan ditolak, dan seluruh giliran jatuh ke simulator —
   * padahal adegannya sendiri baik. Kehilangan satu kalimat jauh lebih ringan
   * daripada kehilangan seluruh giliran.
   *
   * BUKTI MERAH: kembalikan `return { ok:false, reason:'terlalu-banyak-beat' }`
   * untuk setiap kelebihan, lalu uji "memangkas" memerah.
   */
  it('memangkas kelebihan beat, bukan menolak adegannya', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    // 11 narasi; adeganSah() sudah punya latar + keputusan sendiri.
    adegan.beats = Array.from({ length: 11 }, (_, i) => ({
      type: 'narrate',
      text: `Kalimat ${i + 1}.`,
    }));

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      // Dipangkas sampai batas, dan pemangkasan itu DILAPORKAN.
      expect(hasil.events.length).toBeLessThanOrEqual(MAX_SCENE_BEATS + 1);
      expect(hasil.skipped.join(' ')).toContain('pangkas');
    }
  });

  it('TIDAK membuang latar saat memangkas', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    const isi = adegan.beats as unknown[];
    // Latar di awal, lalu banyak narasi — latar harus selamat.
    adegan.beats = [
      { type: 'setBackground', assetId: 'bg_kantor' },
      ...Array.from({ length: 12 }, (_, i) => ({ type: 'narrate', text: `Kalimat ${i + 1}.` })),
    ];
    void isi;

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      const latar = hasil.events.filter((e) => e.type === 'setBackground');
      expect(latar).toHaveLength(1);
    }
  });

  it('tetap menolak keluaran yang benar-benar lepas kendali', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    adegan.beats = Array.from({ length: MAX_SCENE_BEATS * 3 + 1 }, () => ({
      type: 'narrate',
      text: 'Sesuatu.',
    }));

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('terlalu-banyak-beat');
    }
  });

  it('menolak presentChoices yang ditulis di dalam beats', () => {
    // Keputusan punya tempatnya sendiri; menaruhnya di beats berarti bentuknya
    // tidak diperiksa, dan pemain bisa menerima opsi yang tidak sah.
    const adegan = adeganSah() as Record<string, unknown>;
    (adegan.beats as unknown[]).push({ type: 'presentChoices', options: [] });

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('event-tidak-dikenal');
    }
  });

  it('membuat ulang optionId, tidak mempercayai id dari model', () => {
    // Id yang bertabrakan antar giliran membuat jawaban pemain menunjuk opsi
    // yang salah — dan itu terjadi tanpa galat apa pun.
    const adegan = adeganSah() as Record<string, unknown>;
    const keputusan = adegan.decision as Record<string, unknown>;
    (keputusan.options as Record<string, unknown>[]).forEach((o) => {
      o.optionId = 'sama';
    });

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      const akhir = hasil.events[hasil.events.length - 1];
      expect(akhir?.type === 'presentChoices' && akhir.options.map((o) => o.optionId)).toEqual([
        'opt1',
        'opt2',
        'opt3',
      ]);
    }
  });
});

describe('aksiPemain', () => {
  const dasar: StoryContext = {
    worldTitle: 'W',
    premise: 'P',
    characters: [],
    manifest: MANIFEST,
    relationVocabulary: KOSAKATA,
    personaName: 'Marky',
    turnOrdinal: 2,
  };

  it('mendahulukan aksi bebas', () => {
    expect(aksiPemain({ ...dasar, customText: 'Menatapnya', optionLabel: 'Berdiri' })).toBe(
      'Menatapnya',
    );
  });

  it('memakai label opsi bila tidak ada aksi bebas', () => {
    expect(aksiPemain({ ...dasar, optionLabel: 'Berdiri' })).toBe('Berdiri');
  });

  it('null bila pemain tidak melakukan apa pun', () => {
    expect(aksiPemain(dasar)).toBeNull();
  });
});

describe('AiStoryEngine', () => {
  const konteks: StoryContext = {
    worldTitle: 'Bosku Mantan Pacarku',
    premise: 'Kamu di kantor.',
    synopsis: 'Hari pertama kerja.',
    characters: KARAKTER,
    manifest: MANIFEST,
    relationVocabulary: KOSAKATA,
    personaName: 'Marky',
    personaAge: 24,
    turnOrdinal: 1,
    beatIdPrefix: 'j1-t1',
  };

  it('memakai hasil model saat adegannya sah', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, scene: adeganSah() });
    const mesin = new AiStoryEngine({ call, fallback: new DeterministicStoryEngine() });

    const hasil = await mesin.generateOpening(konteks);

    expect(hasil.beats.length).toBeGreaterThan(0);
    expect(hasil.beats[0]?.beatId).toBe('j1-t1-b001');
    expect(mesin.isSimulator).toBe(false);
  });

  it('menyerahkan ke simulator saat model gagal — pemain tidak pernah mentok', async () => {
    /*
     * Setiap giliran kini bergantung pada model. Tanpa cadangan, satu kegagalan
     * jaringan menghentikan cerita di tengah dan pemain tidak dapat berbuat apa pun.
     */
    const call = vi.fn().mockResolvedValue({ ok: false, detail: 'jaringan mati' });
    const gagal = vi.fn();
    const mesin = new AiStoryEngine({
      call,
      fallback: new DeterministicStoryEngine(),
      onFailure: gagal,
    });

    const hasil = await mesin.generateOpening(konteks);

    expect(hasil.beats.length).toBeGreaterThan(0);
    expect(gagal).toHaveBeenCalledOnce();
  });

  it('menyerahkan ke simulator saat adegannya DITOLAK, bukan memakainya sebagian', async () => {
    // Adegan setengah benar lebih berbahaya daripada yang jelas gagal, karena
    // yang pertama tidak terlihat rusak.
    const rusak = adeganSah() as Record<string, unknown>;
    (rusak.beats as unknown[])[0] = { type: 'setBackground', assetId: 'bg_karangan' };

    const call = vi.fn().mockResolvedValue({ ok: true, scene: rusak });
    const gagal = vi.fn();
    const mesin = new AiStoryEngine({
      call,
      fallback: new DeterministicStoryEngine(),
      onFailure: gagal,
    });

    const hasil = await mesin.generateTurn({ ...konteks, optionLabel: 'Berdiri' });

    expect(hasil.beats.length).toBeGreaterThan(0);
    expect(gagal).toHaveBeenCalledWith(expect.stringContaining('asset-tidak-dikenal'));
  });
});

/**
 * Kejadian mesin sebagai DATA (tabel engine_events, halaman /admin/mesin).
 *
 * Dulu satu-satunya jejak "model gagal, simulator mengambil alih" adalah log
 * warn yang hilang begitu log platform bergulir. Sekarang mesin melaporkan
 * kejadiannya lewat `onEvent`, dan yang direkam adalah: MENGAPA (engine_failed
 * / scene_rejected) dan APA YANG TERJADI ke pemain (simulator_used).
 *
 * BUKTI MUTASI: hapus panggilan `this.deps.onEvent?.(...)` di
 * `aiStoryEngine.ts` (baik di `tulis` maupun `serahkanKeSimulator`), lalu uji
 * di bawah memerah satu per satu.
 */
describe('kejadian mesin (onEvent)', () => {
  /*
   * Salinan konteks milik blok ini, bukan milik `describe('AiStoryEngine')`
   * di atas: variabel blok itu tidak terlihat di sini, dan mengambilnya lintas
   * blok membuat uji patah dengan `ReferenceError` saat dijalankan terpisah.
   */
  const konteks: StoryContext = {
    worldTitle: 'Bosku Mantan Pacarku',
    premise: 'Kamu di kantor.',
    synopsis: 'Hari pertama kerja.',
    characters: KARAKTER,
    manifest: MANIFEST,
    relationVocabulary: KOSAKATA,
    personaName: 'Marky',
    personaAge: 24,
    turnOrdinal: 1,
    beatIdPrefix: 'j1-t1',
  };

  it('mencatat engine_failed dan simulator_used saat panggilan gagal dua kali', async () => {
    const call = vi.fn().mockResolvedValue({ ok: false, detail: 'jaringan mati' });
    const kejadian: { kind: string; detail: string }[] = [];
    const mesin = new AiStoryEngine({
      call,
      fallback: new DeterministicStoryEngine(),
      onEvent: (event) => kejadian.push(event),
    });

    const hasil = await mesin.generateOpening(konteks);

    // Pemain tetap dilayani simulator...
    expect(hasil.beats.length).toBeGreaterThan(0);
    // ...dua percobaan dilakukan (satu retry)...
    expect(call).toHaveBeenCalledTimes(2);
    // ...dan KEDUA sisi kejadiannya tercatat.
    expect(kejadian.map((item) => item.kind)).toEqual(['engine_failed', 'simulator_used']);
    expect(kejadian[0]?.detail).toContain('jaringan mati');
  });

  it('mencatat scene_rejected dan simulator_used saat adegan ditolak', async () => {
    const rusak = adeganSah() as Record<string, unknown>;
    (rusak.beats as unknown[])[0] = { type: 'setBackground', assetId: 'bg_karangan' };

    const call = vi.fn().mockResolvedValue({ ok: true, scene: rusak });
    const kejadian: { kind: string; detail: string }[] = [];
    const mesin = new AiStoryEngine({
      call,
      fallback: new DeterministicStoryEngine(),
      onEvent: (event) => kejadian.push(event),
    });

    await mesin.generateTurn({ ...konteks, optionLabel: 'Berdiri' });

    expect(kejadian.map((item) => item.kind)).toEqual(['scene_rejected', 'simulator_used']);
    expect(kejadian[0]?.detail).toContain('asset-tidak-dikenal');
  });

  it('mencatat events_skipped saat adegan diterima tetapi sebagian dibuang', async () => {
    // Satu peristiwa berstatus karangan: dibuang, bukan menjatuhkan adegannya.
    const adegan = adeganSah() as Record<string, unknown>;
    (adegan.beats as unknown[]).push({
      type: 'relationshipDelta',
      npcId: 'npc_rina',
      status: 'marah',
      reasonPublic: 'Ia tersinggung.',
    });

    const call = vi.fn().mockResolvedValue({ ok: true, scene: adegan });
    const kejadian: { kind: string; detail: string }[] = [];
    const mesin = new AiStoryEngine({
      call,
      fallback: new DeterministicStoryEngine(),
      onEvent: (event) => kejadian.push(event),
    });

    const hasil = await mesin.generateTurn({ ...konteks, optionLabel: 'Berdiri' });

    // Adegan tetap diterima; kejadiannya bukan kegagalan.
    expect(kejadian.map((item) => item.kind)).toEqual(['events_skipped']);
    expect(kejadian[0]?.detail).toContain('marah');
    expect(hasil.beats.length).toBeGreaterThan(0);
  });

  it('TIDAK mencatat apa pun saat giliran sukses utuh', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, scene: adeganSah() });
    const kejadian: { kind: string; detail: string }[] = [];
    const mesin = new AiStoryEngine({
      call,
      fallback: new DeterministicStoryEngine(),
      onEvent: (event) => kejadian.push(event),
    });

    await mesin.generateOpening(konteks);

    expect(kejadian).toEqual([]);
  });
});

/**
 * Ekspresi bernama frasa berkoma.
 *
 * Panel admin menghasilkan nama ekspresi seperti
 * "senyum, pakaian kantor, mengangkat tangan". Model wajar menuliskan bentuk
 * pendeknya ("senyum"). Dengan pencocokan PERSIS, satu ekspresi yang tidak
 * dikenali membuat SELURUH adegan ditolak, lalu seluruh giliran jatuh ke
 * simulator — dan pemain melihatnya sebagai cerita yang berulang.
 *
 * BUKTI MERAH: kembalikan `npc.expressions.includes(peristiwa.expression)` di
 * `aiStoryEngine.ts` (ganti `cocokkanEkspresi`), lalu uji "menerima bentuk
 * pendek" di bawah memerah dengan `ekspresi-tidak-dikenal`.
 */
describe('cocokkanEkspresi', () => {
  const DAFTAR = [
    'senyum, pakaian kantor, mengangkat tangan',
    'terkejut, pakaian kantor, menutup mulut',
    'serius, jaket dan celana, bersedekap',
  ];

  it('menerima kecocokan persis', () => {
    expect(cocokkanEkspresi(DAFTAR, 'terkejut, pakaian kantor, menutup mulut')).toBe(
      'terkejut, pakaian kantor, menutup mulut',
    );
  });

  it('menerima bentuk pendek lewat segmen pertama', () => {
    expect(cocokkanEkspresi(DAFTAR, 'senyum')).toBe('senyum, pakaian kantor, mengangkat tangan');
    expect(cocokkanEkspresi(DAFTAR, 'serius')).toBe('serius, jaket dan celana, bersedekap');
  });

  it('mengabaikan besar-kecil huruf dan spasi berlebih', () => {
    expect(cocokkanEkspresi(DAFTAR, '  SENYUM  ')).toBe('senyum, pakaian kantor, mengangkat tangan');
  });

  it('menolak yang benar-benar tidak ada', () => {
    expect(cocokkanEkspresi(DAFTAR, 'marah')).toBeUndefined();
    expect(cocokkanEkspresi(DAFTAR, '')).toBeUndefined();
  });

  it('selalu mengembalikan nilai DARI DAFTAR, bukan karangan model', () => {
    const hasil = cocokkanEkspresi(DAFTAR, 'senyum');
    expect(DAFTAR).toContain(hasil);
  });

  it('adegan dengan ekspresi berkoma tetap DITERIMA, bukan jatuh ke simulator', () => {
    const karakterBerkoma = [
      {
        ...KARAKTER[0],
        expressions: ['senyum, pakaian kantor, mengangkat tangan'],
        defaultPortraitAssetId: 'p_rina_senyum',
      },
    ] as unknown as NPCPublicDTO[];

    const hasil = periksaAdegan(
      {
        beats: [
          { type: 'setBackground', assetId: 'bg_kantor' },
          {
            type: 'showCharacter',
            npcId: 'npc_rina',
            // Model menulis bentuk pendeknya saja.
            expression: 'senyum',
            assetId: 'p_rina_senyum',
          },
          { type: 'narrate', text: 'Rina menatapmu.' },
        ],
        decision: {
          prompt: 'Apa yang kamu lakukan?',
          options: [
            { optionId: 'opt1', label: 'Menyapa', description: 'Menyapa balik.' },
            { optionId: 'opt2', label: 'Diam', description: 'Diam saja.' },
            { optionId: 'opt3', label: 'Pergi', description: 'Berjalan pergi.' },
          ],
        },
      },
      MANIFEST,
      karakterBerkoma,
    );

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      const tampil = hasil.events.find((e) => e.type === 'showCharacter');
      // Yang tersimpan adalah nilai SAH dari daftar, bukan "senyum" mentah.
      expect(tampil?.type === 'showCharacter' ? tampil.expression : null).toBe(
        'senyum, pakaian kantor, mengangkat tangan',
      );
    }
  });
});

/**
 * npcId yang ditulis model dengan bentuk sedikit berbeda tetap DITERIMA.
 *
 * `npcId` dibuat panel admin sebagai `npc_${slug(randomUUID()).slice(0, 10)}` —
 * mis. `npc_1120343c-5`. Bentuk itu TERPOTONG di tengah UUID, jadi mudah disalin
 * keliru: tanpa awalan, tanpa tanda hubung, atau dilengkapi kembali menjadi UUID
 * penuh. Pencocokan PERSIS menolak semuanya, dan satu `showCharacter` yang
 * ditolak menjatuhkan SELURUH adegan → seluruh giliran jatuh ke simulator, yang
 * keluarnya sama terus. Terukur di produksi: `"sebab": "adegan ditolak:
 * npc-tidak-dikenal"` dua kali, dan dua putaran uji alur itu memang kembar.
 *
 * BUKTI MERAH: ganti `rujukNpc(...)` di `aiStoryEngine.ts` kembali menjadi
 * `npcSah.has(peristiwa.npcId)`, lalu uji "menerima variasi bentuk" memerah.
 */
describe('cocokkanNpc', () => {
  const DAFTAR = ['npc_1120343c-5', 'npc_334e4efe-6'];

  it('menerima kecocokan persis', () => {
    expect(cocokkanNpc(DAFTAR, 'npc_1120343c-5')).toBe('npc_1120343c-5');
  });

  it('menerima variasi bentuk yang wajar', () => {
    // Tanpa awalan, tanpa tanda hubung, huruf besar, atau UUID yang dilengkapi.
    expect(cocokkanNpc(DAFTAR, '1120343c-5')).toBe('npc_1120343c-5');
    expect(cocokkanNpc(DAFTAR, 'npc_1120343c5')).toBe('npc_1120343c-5');
    expect(cocokkanNpc(DAFTAR, 'NPC_1120343C-5')).toBe('npc_1120343c-5');
    expect(cocokkanNpc(DAFTAR, 'npc_1120343c-5a1b-4c2d-8e3f-000000000000')).toBe(
      'npc_1120343c-5',
    );
  });

  it('TIDAK menebak bila lebih dari satu kandidat cocok', () => {
    const kembar = ['npc_abcdef12-3', 'npc_abcdef12-9'];
    expect(cocokkanNpc(kembar, 'npc_abcdef12')).toBeUndefined();
  });

  it('menolak yang benar-benar tidak ada, dan yang terlalu pendek', () => {
    expect(cocokkanNpc(DAFTAR, 'npc_99999999-9')).toBeUndefined();
    expect(cocokkanNpc(DAFTAR, '')).toBeUndefined();
    expect(cocokkanNpc(DAFTAR, 'npc')).toBeUndefined();
  });

  it('selalu mengembalikan nilai DARI daftar, bukan karangan model', () => {
    const hasil = cocokkanNpc(DAFTAR, 'npc_1120343c5');
    expect(DAFTAR).toContain(hasil);
  });

  it('adegan dengan npcId bervariasi tetap DITERIMA, bukan jatuh ke simulator', () => {
    const karakter = [
      {
        ...KARAKTER[0],
        npcId: 'npc_1120343c-5',
        expressions: ['senyum'],
        defaultPortraitAssetId: 'p_rina_senyum',
      },
    ] as unknown as NPCPublicDTO[];

    const hasil = periksaAdegan(
      {
        beats: [
          { type: 'setBackground', assetId: 'bg_kantor' },
          // Bentuk terpotong tanpa awalan — yang paling mudah ditulis model.
          { type: 'showCharacter', npcId: '1120343c-5', expression: 'senyum', assetId: 'p_rina_senyum' },
          { type: 'narrate', text: 'Rina menatapmu.' },
        ],
        decision: {
          prompt: 'Apa yang kamu lakukan?',
          options: [
            { label: 'Menyapa', description: 'Menyapa balik.' },
            { label: 'Diam', description: 'Diam saja.' },
            { label: 'Pergi', description: 'Berjalan pergi.' },
          ],
        },
      },
      MANIFEST,
      karakter,
    );

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      const tampil = hasil.events.find((e) => e.type === 'showCharacter');
      // Yang tersimpan adalah id SAH dari daftar, bukan yang dikarang model.
      expect(tampil?.type === 'showCharacter' ? tampil.npcId : null).toBe('npc_1120343c-5');
    }
  });

  it('penolakan menyebut NILAI yang ditolak, bukan hanya jenisnya', () => {
    const hasil = periksaAdegan(
      {
        beats: [
          { type: 'setBackground', assetId: 'bg_kantor' },
          { type: 'showCharacter', npcId: 'npc_khayalan', expression: 'senyum', assetId: 'p_rina_senyum' },
          { type: 'narrate', text: 'Halo.' },
        ],
        decision: {
          prompt: 'Apa?',
          options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
        },
      },
      MANIFEST,
      KARAKTER,
      KOSAKATA,
    );

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('npc-tidak-dikenal');
      // Tanpa `detail`, log produksi tak dapat menjelaskan apa pun.
      expect(hasil.detail).toBe('npc_khayalan');
    }
  });
});

/**
 * Pertanyaan penutup cadangan mengikuti BAHASA perjalanan.
 *
 * `decision.prompt` ditulis model; bila ia lupa, backend memakai cadangan.
 * Cadangan itu dulu ditulis mati dalam bahasa Indonesia, sehingga satu kelalaian
 * model menyelipkan pertanyaan berbahasa Indonesia di tengah cerita berbahasa
 * Inggris. Terukur di produksi pada perjalanan `en-US`: "How do you respond?"
 * lalu "Apa yang kamu lakukan berikutnya?" — dua bahasa dalam satu perjalanan.
 *
 * BUKTI MERAH: kembalikan `'Apa yang kamu lakukan?'` sebagai nilai tetap, lalu
 * uji "mengikuti locale" memerah.
 */
describe('cadanganPertanyaan', () => {
  it('mengikuti locale', () => {
    expect(cadanganPertanyaan('en-US')).toBe('What do you do?');
    expect(cadanganPertanyaan('id-ID')).toBe('Apa yang kamu lakukan?');
  });

  it('memakai Bahasa Indonesia bila locale tidak diketahui', () => {
    expect(cadanganPertanyaan(undefined)).toBe('Apa yang kamu lakukan?');
  });

  it('adegan tanpa prompt memakai cadangan sesuai locale perjalanan', () => {
    const adegan = {
      beats: [{ type: 'setBackground', assetId: 'bg_kantor' }],
      decision: { options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] },
    };

    const inggris = periksaAdegan(adegan, MANIFEST, KARAKTER, KOSAKATA, 'en-US');
    expect(inggris.ok).toBe(true);
    if (inggris.ok) {
      const pilihan = inggris.events.find((e) => e.type === 'presentChoices');
      expect(pilihan?.type === 'presentChoices' ? pilihan.prompt : null).toBe('What do you do?');
    }
  });
});

/**
 * Penanda PEMAIN (`@user`) tidak menjatuhkan seluruh adegan.
 *
 * Prompt menyapa pemain sebagai `@user` di seluruh aturannya, jadi model kadang
 * memakai penanda itu sebagai PELAKU sebuah peristiwa. Pemain tidak punya
 * `NPCPublicDTO` — tidak ada potret maupun relasi — sehingga id itu tidak akan
 * pernah cocok. Sebelum ini, SATU peristiwa seperti itu menjatuhkan seluruh
 * adegan, dan seluruh giliran jatuh ke simulator.
 *
 * Ditemukan dari log produksi SETELAH penolakan mulai mencatat nilainya:
 * `"adegan ditolak: npc-tidak-dikenal (@user)"`. Sebelum itu, penyebabnya
 * mustahil diketahui — log hanya berbunyi "npc-tidak-dikenal".
 *
 * BUKTI MERAH: hapus cabang `adalahPemain(...)` di `aiStoryEngine.ts`, lalu uji
 * "adegan tetap DITERIMA" memerah dengan `npc-tidak-dikenal`.
 */
describe('penanda pemain @user', () => {
  const adeganDenganPemain = (): unknown => ({
    beats: [
      { type: 'setBackground', assetId: 'bg_kantor' },
      { type: 'showCharacter', npcId: '@user', expression: 'senyum', assetId: 'p_rina_senyum' },
      { type: 'say', npcId: '@user', text: 'Aku tidak akan tinggal diam.' },
      { type: 'narrate', text: 'Rina mengalihkan pandangan.' },
    ],
    decision: {
      prompt: 'Apa yang kamu lakukan?',
      options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
    },
  });

  it('adegan tetap DITERIMA, bukan jatuh ke simulator', () => {
    const hasil = periksaAdegan(adeganDenganPemain(), MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
  });

  it('peristiwa pemain DIBUANG dan dilaporkan, tidak disembunyikan', () => {
    const hasil = periksaAdegan(adeganDenganPemain(), MANIFEST, KARAKTER, KOSAKATA);

    if (!hasil.ok) throw new Error('seharusnya diterima');
    expect(hasil.skipped).toHaveLength(2);
    expect(hasil.skipped.join(' ')).toContain('@user');
  });

  it('kalimat pemain TETAP dipakai, sebagai narasi — bukan dihilangkan', () => {
    const hasil = periksaAdegan(adeganDenganPemain(), MANIFEST, KARAKTER, KOSAKATA);

    if (!hasil.ok) throw new Error('seharusnya diterima');
    const teks = hasil.events
      .filter((e) => e.type === 'narrate')
      .map((e) => (e.type === 'narrate' ? e.text : ''));
    // Yang ditulis model tidak hilang; hanya bentuknya berubah.
    expect(teks).toContain('Aku tidak akan tinggal diam.');
  });

  it('id yang benar-benar asing TETAP ditolak', () => {
    const hasil = periksaAdegan(
      {
        beats: [
          { type: 'setBackground', assetId: 'bg_kantor' },
          { type: 'showCharacter', npcId: 'npc_khayalan', expression: 'senyum', assetId: 'p_rina_senyum' },
          { type: 'narrate', text: 'Halo.' },
        ],
        decision: { prompt: 'Apa?', options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] },
      },
      MANIFEST,
      KARAKTER,
      KOSAKATA,
    );

    expect(hasil.ok).toBe(false);
  });

  it('adegan yang SELURUH isinya milik pemain tetap ditolak', () => {
    // Tidak menyisakan apa pun untuk ditampilkan — layar akan kosong.
    const hasil = periksaAdegan(
      {
        beats: [{ type: 'showCharacter', npcId: '@user', expression: 'senyum', assetId: 'p_rina_senyum' }],
        decision: { prompt: 'Apa?', options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] },
      },
      MANIFEST,
      KARAKTER,
      KOSAKATA,
    );

    expect(hasil.ok).toBe(false);
  });

  it('mengenali penanda pemain dalam beberapa ejaan', () => {
    for (const penanda of ['@user', 'user', 'PEMAIN', 'Player']) {
      const hasil = periksaAdegan(
        {
          beats: [
            { type: 'setBackground', assetId: 'bg_kantor' },
            { type: 'showCharacter', npcId: penanda, expression: 'senyum', assetId: 'p_rina_senyum' },
            { type: 'narrate', text: 'Halo.' },
          ],
          decision: { prompt: 'Apa?', options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] },
        },
        MANIFEST,
        KARAKTER,
        KOSAKATA,
      );
      expect(hasil.ok, `penanda ${penanda}`).toBe(true);
    }
  });
});

/**
 * Potret dipilih dari EKSPRESI, bukan dari yang dikirim model.
 *
 * Model hanya diberi SATU potret per karakter (yang bawaan) dan daftar nama
 * ekspresi TANPA pasangannya. Ia tidak punya cara mengetahui potret mana yang
 * mewakili "terkejut", jadi ia memakai satu-satunya yang ia tahu. Terukur di
 * produksi 11 Okt 2026: 8 kemunculan karakter, **3 ekspresi berbeda**, tetapi
 * **1 potret saja** — gambarnya tidak pernah berganti meski ekspresinya
 * berganti.
 *
 * Pasangannya sudah ada di manifes, jadi sistem yang memilihkannya: model
 * menentukan MAKNA (ekspresi apa), sistem menentukan BERKAS (potret mana).
 *
 * BUKTI MERAH: kembalikan `assetId: peristiwa.assetId` di `aiStoryEngine.ts`,
 * lalu uji "potret mengikuti ekspresi" memerah.
 */
describe('potret mengikuti ekspresi', () => {
  const MANIFEST_DUA = {
    cover: null,
    backgrounds: [{ assetId: 'bg_kantor', label: 'Kantor', uri: '' }],
    portraits: [
      {
        assetId: 'p_senyum',
        label: 'rina — senyum',
        uri: '',
        npcId: 'npc_rina',
        expression: 'senyum',
      },
      {
        assetId: 'p_terkejut',
        label: 'rina — terkejut',
        uri: '',
        npcId: 'npc_rina',
        expression: 'terkejut',
      },
    ],
  } as unknown as AssetManifest;

  const karakter = () =>
    [
      {
        ...KARAKTER[0],
        expressions: ['senyum', 'terkejut'],
        defaultPortraitAssetId: 'p_senyum',
      },
    ] as unknown as NPCPublicDTO[];

  const adegan = (expression: string, assetId: string): unknown => ({
    beats: [
      { type: 'setBackground', assetId: 'bg_kantor' },
      { type: 'showCharacter', npcId: 'npc_rina', expression, assetId },
      { type: 'narrate', text: 'Rina menatapmu.' },
    ],
    decision: {
      prompt: 'Apa?',
      options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
    },
  });

  it('potret mengikuti ekspresi, bukan yang dikirim model', () => {
    // Model memilih ekspresi "terkejut" tetapi mengirim potret BAWAAN.
    const hasil = periksaAdegan(adegan('terkejut', 'p_senyum'), MANIFEST_DUA, karakter(), KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      const tampil = hasil.events.find((e) => e.type === 'showCharacter');
      expect(tampil?.type === 'showCharacter' ? tampil.expression : null).toBe('terkejut');
      // Yang dipakai potret untuk "terkejut", BUKAN yang dikirim model.
      expect(tampil?.type === 'showCharacter' ? tampil.assetId : null).toBe('p_terkejut');
    }
  });

  it('ekspresi berbeda menghasilkan potret berbeda', () => {
    const a = periksaAdegan(adegan('senyum', 'p_senyum'), MANIFEST_DUA, karakter(), KOSAKATA);
    const b = periksaAdegan(adegan('terkejut', 'p_senyum'), MANIFEST_DUA, karakter(), KOSAKATA);

    const potret = (h: typeof a) => {
      if (!h.ok) throw new Error('seharusnya diterima');
      const t = h.events.find((e) => e.type === 'showCharacter');
      return t?.type === 'showCharacter' ? t.assetId : null;
    };

    expect(potret(a)).not.toBe(potret(b));
  });

  it('memakai potret dari model bila manifes tidak punya pasangannya', () => {
    // Dunia yang ekspresinya belum diunggah gambarnya: jatuh ke potret kiriman.
    const manifesKosong = {
      ...MANIFEST_DUA,
      portraits: [
        { assetId: 'p_lain', label: 'lain', uri: '', npcId: 'npc_lain', expression: 'lain' },
      ],
    } as unknown as AssetManifest;

    const hasil = periksaAdegan(adegan('senyum', 'p_lain'), manifesKosong, karakter(), KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      const tampil = hasil.events.find((e) => e.type === 'showCharacter');
      expect(tampil?.type === 'showCharacter' ? tampil.assetId : null).toBe('p_lain');
    }
  });
});

describe('relationshipDelta — status harus sah, dan yang salah DIBUANG', () => {
  /*
   * Keluhan pemilik produk: "cek fitur hubungan sudah full fungsional apa belum".
   *
   * Jawabannya TIDAK. Akarnya di sini: `status: peristiwa.status as never` —
   * satu `as never` yang mematikan pemeriksaan tipe sekaligus memastikan tidak
   * ada nilai yang diperiksa saat berjalan. Model bebas menulis "marah" atau
   * "tersinggung"; nilainya tersimpan apa adanya, lalu di layar pemain
   * `coerceRelationStatus` mengubahnya menjadi "Belum diketahui". Pemain melihat
   * hubungannya tidak pernah berubah, tanpa satu pun galat di mana pun.
   *
   * BUKTI MUTASI: kembalikan `status: peristiwa.status as never`, lalu uji
   * "membuang status yang tidak dikenal" memerah.
   */
  const adeganDenganStatus = (status: unknown, reasonPublic: unknown = 'Ia tersinggung.') => ({
    beats: [
      { type: 'setBackground', assetId: 'bg_kantor' },
      { type: 'narrate', text: 'Kamu menyebut masa lalu di depan tim.' },
      { type: 'relationshipDelta', npcId: 'npc_rina', status, reasonPublic },
      { type: 'narrate', text: 'Rina menutup buku catatannya.' },
    ],
    decision: {
      prompt: 'Apa yang kamu lakukan?',
      options: [
        { optionId: 'opt1', label: 'Minta maaf', description: 'Akui salahmu.' },
        { optionId: 'opt2', label: 'Diam', description: 'Biarkan reda.' },
        { optionId: 'opt3', label: 'Bercanda', description: 'Cairkan suasana.' },
      ],
    },
  });

  it('menerima status yang sah', () => {
    const hasil = periksaAdegan(adeganDenganStatus('waspada'), MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    const delta = hasil.ok
      ? hasil.events.find((event) => event.type === 'relationshipDelta')
      : undefined;
    expect(delta).toMatchObject({ type: 'relationshipDelta', status: 'waspada' });
  });

  it('membuang status yang tidak dikenal TANPA menjatuhkan seluruh adegan', () => {
    /*
     * Ini pola "looping" yang sudah empat kali menggigit proyek ini: satu
     * pelanggaran kecil menolak SELURUH adegan, lalu seluruh giliran jatuh ke
     * simulator. Kehilangan satu perubahan hubungan jauh lebih ringan.
     */
    const hasil = periksaAdegan(adeganDenganStatus('marah'), MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    expect(hasil.events.some((event) => event.type === 'relationshipDelta')).toBe(false);
    expect(hasil.skipped.join(' ')).toContain('status tidak dikenal');
    // Sisa adegannya tetap utuh — ceritanya tidak ikut hilang.
    expect(hasil.events.some((event) => event.type === 'narrate')).toBe(true);
  });

  it('membuang relationshipDelta tanpa reasonPublic', () => {
    /*
     * `reasonPublic` satu-satunya hal yang membuat perubahan hubungan dapat
     * dipercaya pemain (FR-19). Delta tanpa alasan hanya memunculkan lencana
     * status baru tanpa sebab. Mesin deterministik sudah menegakkan ini; mesin
     * AI belum — sampai sekarang.
     */
    const hasil = periksaAdegan(adeganDenganStatus('tegang', '   '), MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    expect(hasil.events.some((event) => event.type === 'relationshipDelta')).toBe(false);
    expect(hasil.skipped.join(' ')).toContain('reasonPublic');
  });

  it('menormalkan bentuk status yang ditulis dengan spasi atau huruf besar', () => {
    const hasil = periksaAdegan(adeganDenganStatus('  WASPADA '), MANIFEST, KARAKTER, KOSAKATA);

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    const delta = hasil.events.find((event) => event.type === 'relationshipDelta');
    expect(delta).toMatchObject({ status: 'waspada' });
  });
});

describe('cocokkanStatus', () => {
  it('menerima id kosakata apa adanya', () => {
    expect(cocokkanStatus('cinta', KOSAKATA)).toBe('cinta');
    expect(cocokkanStatus('renggang', KOSAKATA)).toBe('renggang');
  });

  it('menerima huruf besar dan spasi di ujung', () => {
    expect(cocokkanStatus('  waspada ', KOSAKATA)).toBe('waspada');
    expect(cocokkanStatus('WASPADA', KOSAKATA)).toBe('waspada');
  });

  it('menerima LABEL, karena model kadang menulis namanya', () => {
    // Model sering menulis "Waspada" (label) alih-alih "waspada" (id). Menolak
    // bentuk itu berarti membuang perubahan yang sebenarnya dimaksud.
    expect(cocokkanStatus('Waspada', KOSAKATA)).toBe('waspada');
    expect(cocokkanStatus('Renggang', KOSAKATA)).toBe('renggang');
  });

  it('TIDAK menyatukan dua id yang berbeda hanya karena tanda pemisahnya', () => {
    /*
     * Bentuk lama membuang spasi, tanda hubung, dan garis bawah sebelum
     * mencocokkan. Itu aman selama daftarnya delapan kata bawaan yang tidak
     * mungkin bertabrakan. Sejak status dibuat admin, tidak lagi: `sangat_dekat`
     * dan `sangatdekat` adalah dua status BERBEDA, dan normalisasi itu membuat
     * keduanya cocok satu sama lain — perubahan tersimpan pada status yang
     * salah, tanpa galat, dan tokoh bersikap tidak sesuai ceritanya.
     *
     * BUKTI MUTASI: kembalikan `.replace(/[\s_-]/g, '')` pada pencocokan, lalu
     * uji ini memerah.
     */
    const kosakataGanda: RelationVocabularyEntry[] = [
      { relationId: 'sangat_dekat', labelId: 'Sangat dekat', labelEn: 'Very close', meaning: 'x', behaviourHint: '', position: 1 },
      { relationId: 'sangatdekat', labelId: 'Sangatdekat', labelEn: 'Veryclose', meaning: 'y', behaviourHint: '', position: 2 },
    ];

    expect(cocokkanStatus('sangat_dekat', kosakataGanda)).toBe('sangat_dekat');
    expect(cocokkanStatus('sangatdekat', kosakataGanda)).toBe('sangatdekat');
    /*
     * "sangat dekat" (pakai spasi) TIDAK dianggap sama dengan salah satu id —
     * ia cocok lewat LABEL "Sangat dekat", dan hasilnya tetap satu id yang pasti.
     * Itu berbeda dari normalisasi lama, yang menyatukan dua ID berbeda.
     */
    expect(cocokkanStatus('sangat dekat', kosakataGanda)).toBe('sangat_dekat');
    // Yang benar-benar asing tetap tidak ditebak.
    expect(cocokkanStatus('sangat menjauh', kosakataGanda)).toBeUndefined();
  });

  it('menerima status yang HANYA ada di kosakata, bukan di daftar bawaan', () => {
    /*
     * Inilah yang membuat status kesembilan mungkin. Bentuk lama mencari di
     * `RELATION_STATUSES` — delapan nilai yang ditulis di dalam kode — sehingga
     * status baru yang sah di master SELALU dibuang di sini.
     */
    const kosakataSembilan: RelationVocabularyEntry[] = [
      ...KOSAKATA,
      { relationId: 'rel_curiga', labelId: 'Curiga', labelEn: 'Suspicious', meaning: 'Curiga.', behaviourHint: '', position: 9 },
    ];

    expect(cocokkanStatus('rel_curiga', kosakataSembilan)).toBe('rel_curiga');
    // Tanpa status itu di kosakata, ia memang tidak sah.
    expect(cocokkanStatus('rel_curiga', KOSAKATA)).toBeUndefined();
  });

  it('TIDAK menebak kata bebas — "marah" bukan "tegang"', () => {
    /*
     * Menggeser kata model ke status terdekat akan menyimpan perubahan yang
     * tidak pernah ia maksud. Lebih baik dibuang dan dilaporkan.
     */
    expect(cocokkanStatus('marah', KOSAKATA)).toBeUndefined();
    expect(cocokkanStatus('tersinggung', KOSAKATA)).toBeUndefined();
    expect(cocokkanStatus('mulai suka', KOSAKATA)).toBeUndefined();
    // Bentuk yang dulu diterima karena tanda pemisahnya dibuang.
    expect(cocokkanStatus('TE GANG', KOSAKATA)).toBeUndefined();
    expect(cocokkanStatus('', KOSAKATA)).toBeUndefined();
    expect(cocokkanStatus(null, KOSAKATA)).toBeUndefined();
    expect(cocokkanStatus(42, KOSAKATA)).toBeUndefined();
  });
});

/**
 * Ekspresi yang ditawarkan ke model harus yang PUNYA potret.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA PENJAGA INI ADA
 * ---------------------------------------------------------------------------
 * Terukur pada pemilik produk: narasi menulis "tatapan sinis", tetapi potretnya
 * tetap tersenyum.
 *
 * Sebabnya dua tabel yang tidak selalu sepakat. `world_character_expressions`
 * menyimpan SEMUA nama ekspresi yang diketik admin; `world_assets` hanya
 * menyimpan ekspresi yang gambarnya benar-benar diunggah — penyimpanan potret
 * melewati ekspresi tanpa gambar. Mesin mencocokkan keduanya dengan kunci
 * PERSIS `npcId|ekspresi`, sehingga ekspresi tanpa berkas MELESET TANPA GALAT
 * dan gambar jatuh ke potret bawaan.
 *
 * Penyaringannya dilakukan di `karakterDenganEkspresiTampil`, sehingga model
 * hanya dapat memilih ekspresi yang bisa ditampilkan.
 */
describe('hanya ekspresi berpotret yang ditawarkan ke model', () => {
  const MANIFEST_SEBAGIAN = {
    cover: null,
    backgrounds: [],
    portraits: [
      { assetId: 'p_rina_senyum', label: 'senyum', uri: '', npcId: 'npc_rina', expression: 'senyum' },
    ],
  } as unknown as AssetManifest;

  const DUA_KARAKTER = [
    {
      npcId: 'npc_rina',
      name: 'Rina',
      role: 'bosmu',
      soul: '',
      publicBackstory: '',
      initialRelation: 'normal',
      // `kesal` ada di daftar tetapi gambarnya tidak pernah diunggah.
      expressions: ['senyum', 'kesal'],
      defaultPortraitAssetId: 'p_rina_senyum',
    },
    {
      npcId: 'npc_tanpa_gambar',
      name: 'Budi',
      role: 'rekan',
      soul: '',
      publicBackstory: '',
      initialRelation: 'normal',
      expressions: ['datar'],
      defaultPortraitAssetId: '',
    },
  ] as unknown as NPCPublicDTO[];

  it('membuang ekspresi yang tidak punya potret', () => {
    /*
     * BUKTI MUTASI: buat `karakterDenganEkspresiTampil` mengembalikan
     * `characters` apa adanya, lalu uji ini memerah.
     */
    const hasil = karakterDenganEkspresiTampil(DUA_KARAKTER, MANIFEST_SEBAGIAN);

    expect(hasil[0]?.expressions).toEqual(['senyum']);
    expect(hasil[0]?.expressions).not.toContain('kesal');
  });

  it('mempertahankan daftar asli bila TIDAK SATU pun punya potret', () => {
    /*
     * Pemeriksaan kebalikan, dan ini penting: karakter tanpa gambar sama sekali
     * tetap harus punya daftar ekspresi. Mengosongkannya membuatnya tidak pernah
     * dapat muncul, sehingga memperburuk keadaan alih-alih memperbaikinya.
     */
    const hasil = karakterDenganEkspresiTampil(DUA_KARAKTER, MANIFEST_SEBAGIAN);

    expect(hasil[1]?.expressions).toEqual(['datar']);
  });

  it('tidak mengubah daftar karakter lain yang sudah benar', () => {
    const hasil = karakterDenganEkspresiTampil(KARAKTER, MANIFEST_SEBAGIAN);
    // Karakter uji hanya punya `senyum` yang berpotret, dan `kesal` dibuang.
    expect(hasil[0]?.npcId).toBe('npc_rina');
    expect(hasil[0]?.name).toBe('Rina');
    expect(hasil[0]?.expressions).toEqual(['senyum']);
  });

  it('tidak menjatuhkan seluruh giliran saat manifes tidak memuat nama ekspresi', () => {
    // Manifes lama dapat tidak punya kolom `expression` sama sekali. Itu berarti
    // "tidak ada potret", bukan alasan melempar galat.
    const manifesCacat = {
      cover: null,
      backgrounds: [],
      portraits: [{ assetId: 'p_lama', label: 'lama', uri: '', npcId: 'npc_rina' }],
    } as unknown as AssetManifest;

    expect(() => karakterDenganEkspresiTampil(KARAKTER, manifesCacat)).not.toThrow();
  });
});
