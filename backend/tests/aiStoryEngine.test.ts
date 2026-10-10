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
  periksaAdegan,
} from '../src/services/aiStoryEngine';
import { DeterministicStoryEngine } from '../src/services/storyEngine';
import type { StoryContext } from '../src/services/storyEngine';
import type { AssetManifest, NPCPublicDTO } from '../src/contracts/types';

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
    const hasil = periksaAdegan(adeganSah(), MANIFEST, KARAKTER);

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

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('asset-tidak-dikenal');
    }
  });

  it('menolak karakter yang tidak ada di dunia', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    (adegan.beats as unknown[])[3] = { type: 'say', npcId: 'npc_budi', text: 'Halo.' };

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

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

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('ekspresi-tidak-dikenal');
    }
  });

  it('menolak adegan tanpa keputusan', () => {
    // Tanpa keputusan, pemain TIDAK PUNYA JALAN melanjutkan.
    const adegan = adeganSah() as Record<string, unknown>;
    delete adegan.decision;

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('tanpa-keputusan');
    }
  });

  it('menolak keputusan yang opsinya bukan tiga', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    const keputusan = adegan.decision as Record<string, unknown>;
    keputusan.options = (keputusan.options as unknown[]).slice(0, 2);

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('opsi-bukan-tiga');
    }
  });

  it('menolak adegan yang beatnya melebihi batas', () => {
    const adegan = adeganSah() as Record<string, unknown>;
    adegan.beats = Array.from({ length: 11 }, () => ({ type: 'narrate', text: 'Sesuatu.' }));

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

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

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

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

    const hasil = periksaAdegan(adegan, MANIFEST, KARAKTER);

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
