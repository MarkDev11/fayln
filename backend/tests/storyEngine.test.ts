/**
 * Mesin cerita: pembukaan.
 *
 * Yang dijaga di sini adalah dua keluhan nyata pemilik produk, dan keduanya
 * berasal dari pembukaan yang sama:
 *
 *   - "yang bener aja sebanyak ini" — premis 376 kata disiram sebagai SATU balok;
 *   - "pemilihan background ngaco parah" — latar diambil dari entri pertama
 *     menurut urutan master, tanpa hubungan apa pun dengan isi cerita.
 */
import { describe, expect, it } from 'vitest';

import {
  gantiPenandaBeats,
  pilihLatar,
  potongNarasi,
  DeterministicStoryEngine,
} from '../src/services/storyEngine';
import type { StoryContext } from '../src/services/storyEngine';
import type { AssetManifest } from '../src/contracts/types';

describe('potongNarasi', () => {
  it('memecah teks panjang menjadi potongan pendek', () => {
    const teks = Array.from({ length: 120 }, (_, i) => `kata${String(i)}`).join(' ') + '.';
    const potongan = potongNarasi(teks);

    expect(potongan.length).toBeGreaterThan(1);
    for (const p of potongan) {
      expect(p.split(/\s+/).length, `potongan terlalu panjang: ${p.slice(0, 40)}`).toBeLessThanOrEqual(25);
    }
  });

  it('menghormati batas kalimat bila memungkinkan', () => {
    // Dua kalimat pendek: keduanya muat dalam satu potongan, dan tidak dipotong.
    const potongan = potongNarasi('Kamu masuk ruangan. Pintu menutup di belakangmu.');

    expect(potongan).toHaveLength(1);
    expect(potongan[0]).toBe('Kamu masuk ruangan. Pintu menutup di belakangmu.');
  });

  it('tetap memotong kalimat yang sendirinya lebih panjang dari batas', () => {
    /*
     * Kalimat 60 kata tidak dapat dibiarkan utuh — ia akan melampaui kotak dialog
     * di ponsel. Lebih baik terpotong di tengah kalimat daripada tidak terbaca.
     */
    const panjang = Array.from({ length: 60 }, (_, i) => `kata${String(i)}`).join(' ') + '.';
    const potongan = potongNarasi(panjang);

    expect(potongan.length).toBeGreaterThanOrEqual(3);
    for (const p of potongan) {
      expect(p.split(/\s+/).length).toBeLessThanOrEqual(25);
    }
  });

  it('memulai potongan baru di setiap paragraf', () => {
    const potongan = potongNarasi('Paragraf satu pendek.\n\nParagraf dua juga pendek.');

    expect(potongan).toEqual(['Paragraf satu pendek.', 'Paragraf dua juga pendek.']);
  });

  it('teks kosong menghasilkan tidak ada potongan', () => {
    expect(potongNarasi('   ')).toEqual([]);
  });
});

describe('pilihLatar', () => {
  const manifest = {
    cover: null,
    portraits: [],
    backgrounds: [
      { assetId: 'bg_balkon', label: 'Balkon Apartemen Saat Senja', uri: '' },
      { assetId: 'bg_kantor', label: 'Kantor Modern Dengan Pemandangan Kota', uri: '' },
    ],
  } as unknown as AssetManifest;

  it('memilih latar yang labelnya berbagi kata dengan cerita', () => {
    /*
     * Inilah keluhan "ngaco parah": bentuk lamanya selalu memakai entri PERTAMA,
     * sehingga adegan kantor tampil dengan latar balkon apartemen.
     */
    const terpilih = pilihLatar(manifest, 'Kamu duduk di kantor yang terang sejak pagi.');

    expect(terpilih).toBe('bg_kantor');
  });

  it('jatuh ke entri pertama bila tidak ada kata yang cocok', () => {
    // Mesin ini tidak memahami gambar; tanpa bukti kata, tidak ada dasar memilih.
    const terpilih = pilihLatar(manifest, 'Sesuatu yang sama sekali lain terjadi.');

    expect(terpilih).toBe('bg_balkon');
  });

  it('mengembalikan undefined bila manifest tidak punya latar', () => {
    const kosong = { cover: null, portraits: [], backgrounds: [] } as unknown as AssetManifest;

    expect(pilihLatar(kosong, 'apa saja')).toBeUndefined();
  });
});

describe('pembukaan', () => {
  const manifest = {
    cover: null,
    portraits: [],
    backgrounds: [
      { assetId: 'bg_balkon', label: 'Balkon Apartemen Saat Senja', uri: '' },
      { assetId: 'bg_kantor', label: 'Kantor Modern Pemandangan Kota', uri: '' },
    ],
  } as unknown as AssetManifest;

  const konteks: StoryContext = {
    worldTitle: 'Bosku Mantan Pacarku',
    /*
     * Sengaja panjang seperti premis sungguhan (376 kata di produksi). Premis
     * pendek TIDAK menguji apa pun di sini: ia memang muat dalam satu potongan.
     */
    premise: [
      'Kamu bekerja di kantor yang ramai sejak pagi buta.',
      'Hari pertamamu dimulai dengan secangkir kopi yang sudah dingi.',
      'Layar monitor menyala dengan kode yang belum selesai.',
      'Suara keyboard dan telepon memenuhi ruangan terbuka itu.',
      'Atasanmu datang menghampiri mejamu tanpa memberi salam.',
      'Ia meletakkan berkas di meja dan menatapmu lama sekali.',
    ].join(' '),
    characters: [],
    manifest,
    personaName: 'Marky',
    turnOrdinal: 1,
    beatIdPrefix: 'j1-t1',
  };

  it('memecah narasi menjadi beberapa beat, bukan satu balok', async () => {
    const hasil = await new DeterministicStoryEngine().generateOpening(konteks);
    const narasi = hasil.beats.filter((b) => b.event.type === 'narrate');

    expect(narasi.length, 'narasi masih satu balok').toBeGreaterThan(1);
    for (const b of narasi) {
      const teks = b.event.type === 'narrate' ? b.event.text : '';
      expect(teks.split(/\s+/).length).toBeLessThanOrEqual(25);
    }
  });

  it('memakai latar yang cocok, bukan entri pertama', async () => {
    const hasil = await new DeterministicStoryEngine().generateOpening(konteks);
    const latar = hasil.beats.filter((b) => b.event.type === 'setBackground');

    // Tepat SATU pergantian latar: memasang lalu langsung menggantinya membuat
    // latar pertama tidak pernah terlihat.
    expect(latar, 'ada lebih dari satu pergantian latar di pembukaan').toHaveLength(1);
    expect(latar[0]?.event.type === 'setBackground' && latar[0].event.assetId).toBe('bg_kantor');
  });

  it('memberi setiap beat ID yang unik', async () => {
    const hasil = await new DeterministicStoryEngine().generateOpening(konteks);
    const id = hasil.beats.map((b) => b.beatId);

    expect(new Set(id).size).toBe(id.length);
  });
});

/**
 * Penanda nama diganti SISTEM, bukan dibiarkan mentah.
 *
 * Model menulis `@user` untuk pemain dan `@<nama>` untuk karakter di dunia itu —
 * disengaja, supaya satu teks dunia dapat dipakai beberapa pemain dengan nama
 * berbeda. Tetapi TIDAK ADA yang menggantinya: terukur di produksi 11 Okt 2026,
 * teks beat berisi `"@user duduk di meja 47"` pada perjalanan dengan persona
 * bernama "Arfan" — jadi pemain melihat `@user` di layar padahal namanya sudah
 * diisi di lembar persona.
 *
 * BUKTI MERAH: kembalikan `beats` apa adanya di `gantiPenandaBeats`, lalu
 * uji-uji ini memerah.
 */
describe('gantiPenandaBeats', () => {
  const KONTEKS = {
    personaName: 'Arfan',
    characters: [
      { npcId: 'npc_1', name: 'rina' },
      { npcId: 'npc_2', name: 'Daniel' },
    ],
  } as unknown as StoryContext;

  const beat = (event: unknown, i = 1) => ({
    beatId: `t-b${String(i).padStart(3, '0')}`,
    sequence: i,
    event: event as never,
  });

  it('mengganti @user dengan nama pemain', () => {
    const hasil = gantiPenandaBeats(
      [beat({ type: 'narrate', text: '@user duduk di meja 47.' })],
      KONTEKS,
    );

    const teks = hasil[0]?.event.type === 'narrate' ? hasil[0].event.text : '';
    expect(teks).toBe('Arfan duduk di meja 47.');
    expect(teks).not.toContain('@user');
  });

  it('mengganti @nama dengan nama karakter di dunia ini', () => {
    const hasil = gantiPenandaBeats(
      [beat({ type: 'say', npcId: 'npc_1', text: '@rina menatap @daniel.' })],
      KONTEKS,
    );

    const teks = hasil[0]?.event.type === 'say' ? hasil[0].event.text : '';
    // Nama diambil APA ADANYA dari data dunia — 'rina' tetap huruf kecil,
    // 'Daniel' tetap huruf besar. Sistem tidak mengubah besar-kecil huruf.
    expect(teks).toBe('rina menatap Daniel.');
  });

  it('mengabaikan besar-kecil huruf pada penandanya', () => {
    const hasil = gantiPenandaBeats(
      [beat({ type: 'narrate', text: '@RINA dan @USER pergi.' })],
      KONTEKS,
    );

    const teks = hasil[0]?.event.type === 'narrate' ? hasil[0].event.text : '';
    expect(teks).toBe('rina dan Arfan pergi.');
  });

  it('MEMBIARKAN token yang tidak dikenal', () => {
    /*
     * Aturan penulisan dunia menyatakan sebuah `@nama` sah walau karakternya
     * belum dibuat. Menghapusnya berarti membuang isi yang sengaja ditulis.
     */
    const hasil = gantiPenandaBeats(
      [beat({ type: 'narrate', text: '@user bertemu @hantu.' })],
      KONTEKS,
    );

    const teks = hasil[0]?.event.type === 'narrate' ? hasil[0].event.text : '';
    expect(teks).toBe('Arfan bertemu @hantu.');
  });

  it('mengganti di pertanyaan dan label opsi juga', () => {
    const hasil = gantiPenandaBeats(
      [
        beat({
          type: 'presentChoices',
          decisionId: 'd1',
          prompt: 'Apa yang @user lakukan?',
          options: [
            { optionId: 'opt1', label: 'Sapa @rina', description: 'Menyapa @rina balik.' },
            { optionId: 'opt2', label: 'Diam', description: 'Diam saja.' },
            { optionId: 'opt3', label: 'Pergi', description: 'Berjalan pergi.' },
          ],
        }),
      ],
      KONTEKS,
    );

    const e = hasil[0]?.event;
    if (e?.type !== 'presentChoices') throw new Error('tipe berubah');
    expect(e.prompt).toBe('Apa yang Arfan lakukan?');
    expect(e.options[0]?.label).toBe('Sapa rina');
    expect(e.options[0]?.description).toBe('Menyapa rina balik.');
    // Tetap tiga opsi, dan urutannya tidak berubah.
    expect(e.options).toHaveLength(3);
    expect(e.options[1]?.label).toBe('Diam');
  });

  it('tidak menyentuh peristiwa yang tidak berteks', () => {
    const hasil = gantiPenandaBeats(
      [
        beat({ type: 'setBackground', assetId: 'bg_kantor' }, 1),
        beat({ type: 'showCharacter', npcId: 'npc_1', expression: 'senyum', assetId: 'p_1' }, 2),
      ],
      KONTEKS,
    );

    expect(hasil[0]?.event).toEqual({ type: 'setBackground', assetId: 'bg_kantor' });
    expect(hasil[1]?.event.type).toBe('showCharacter');
  });
});
