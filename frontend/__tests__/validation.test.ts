import { buildOpeningBeats } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import {
  MAX_DIALOGUE_CHARS,
  hasUnsafeText,
  validateBeats,
  validateSingleEvent,
} from '@/domain/validation';
import type { Beat, StoryEvent } from '@/domain/types';

const beat = (id: string, sequence: number, event: StoryEvent): Beat => ({
  beatId: id,
  turnId: 't001',
  sequence,
  event,
});

describe('validasi beat terhadap manifest dunia', () => {
  it('menerima seluruh beat pembuka demo tanpa temuan', () => {
    const issues = validateBeats(buildOpeningBeats('t001'), worldBoskuMantan);
    expect(issues).toEqual([]);
  });

  it('menolak latar yang tidak ada di manifest (R-06, AC-30)', () => {
    const issues = validateSingleEvent(
      { type: 'setBackground', assetId: 'bg_kantor_musuh' },
      'b-x',
      worldBoskuMantan,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('ASSET_NOT_IN_MANIFEST');
  });

  it('menolak NPC yang tidak terdaftar di dunia', () => {
    const issues = validateSingleEvent(
      { type: 'say', npcId: 'npc_orang_asing', text: 'Halo.' },
      'b-x',
      worldBoskuMantan,
    );
    expect(issues.map((issue) => issue.code)).toContain('NPC_NOT_IN_WORLD');
  });

  it('menolak ekspresi yang tidak tersedia untuk karakter', () => {
    const issues = validateSingleEvent(
      { type: 'showCharacter', npcId: 'npc_leo', expression: 'marah', assetId: 'p_leo_marah' },
      'b-x',
      worldBoskuMantan,
    );
    expect(issues.map((issue) => issue.code)).toContain('EXPRESSION_UNAVAILABLE');
  });

  it('menolak presentChoices yang bukan tiga opsi', () => {
    const issues = validateSingleEvent(
      {
        type: 'presentChoices',
        decisionId: 'd001',
        prompt: 'Pilih',
        options: [
          { optionId: 'a', label: 'A', description: '' },
          { optionId: 'b', label: 'B', description: '' },
        ],
      } as unknown as StoryEvent,
      'b-x',
      worldBoskuMantan,
    );
    expect(issues.map((issue) => issue.code)).toContain('CHOICES_NOT_THREE');
  });

  it('menolak opsi dengan ID duplikat', () => {
    const issues = validateSingleEvent(
      {
        type: 'presentChoices',
        decisionId: 'd001',
        prompt: 'Pilih',
        options: [
          { optionId: 'sama', label: 'A', description: '' },
          { optionId: 'sama', label: 'B', description: '' },
          { optionId: 'c', label: 'C', description: '' },
        ],
      },
      'b-x',
      worldBoskuMantan,
    );
    expect(issues.map((issue) => issue.code)).toContain('CHOICES_DUPLICATE_ID');
  });

  it('menolak perubahan hubungan tanpa alasan publik (FR-19)', () => {
    const issues = validateSingleEvent(
      { type: 'relationshipDelta', npcId: 'npc_elysia', status: 'cinta', reasonPublic: '   ' },
      'b-x',
      worldBoskuMantan,
    );
    expect(issues.map((issue) => issue.code)).toContain('RELATION_MISSING_REASON');
  });

  it('menolak status hubungan yang tidak dikenal', () => {
    const issues = validateSingleEvent(
      {
        type: 'relationshipDelta',
        npcId: 'npc_elysia',
        status: 'marah_sekali' as never,
        reasonPublic: 'Alasan.',
      },
      'b-x',
      worldBoskuMantan,
    );
    expect(issues.map((issue) => issue.code)).toContain('RELATION_UNKNOWN_STATUS');
  });

  it('menolak tipe event yang tidak dikenal', () => {
    const issues = validateSingleEvent(
      { type: 'jalankanKode' } as unknown as StoryEvent,
      'b-x',
      worldBoskuMantan,
    );
    expect(issues[0]?.code).toBe('UNKNOWN_EVENT');
  });

  it('menolak urutan beat yang tidak menaik', () => {
    const beats: Beat[] = [
      beat('b1', 5, { type: 'narrate', text: 'Satu.' }),
      beat('b2', 3, { type: 'narrate', text: 'Dua.' }),
    ];
    const issues = validateBeats(beats, worldBoskuMantan);
    expect(issues.map((issue) => issue.code)).toContain('SEQUENCE_NOT_MONOTONIC');
  });

  it('menolak dialog kosong dan teks dengan karakter kontrol', () => {
    const empty = validateSingleEvent(
      { type: 'say', npcId: 'npc_elysia', text: '   ' },
      'b-x',
      worldBoskuMantan,
    );
    expect(empty.map((issue) => issue.code)).toContain('TEXT_EMPTY');

    const control = validateSingleEvent(
      { type: 'narrate', text: `Halo\u0007dunia` },
      'b-x',
      worldBoskuMantan,
    );
    expect(control.map((issue) => issue.code)).toContain('TEXT_HAS_CONTROL_CHARS');
  });

  it('menolak teks yang melebihi batas panjang', () => {
    const issues = validateSingleEvent(
      { type: 'say', npcId: 'npc_elysia', text: 'a'.repeat(MAX_DIALOGUE_CHARS + 1) },
      'b-x',
      worldBoskuMantan,
    );
    expect(issues.map((issue) => issue.code)).toContain('TEXT_TOO_LONG');
  });
});

describe('hasUnsafeText', () => {
  it('mengembalikan null untuk teks yang sah', () => {
    expect(hasUnsafeText('Dialog biasa.', 100)).toBeNull();
  });

  it('mendeteksi kosong, terlalu panjang, dan karakter kontrol', () => {
    expect(hasUnsafeText('  ', 100)).toBe('empty');
    expect(hasUnsafeText('a'.repeat(101), 100)).toBe('tooLong');
    expect(hasUnsafeText('a\u0000b', 100)).toBe('control');
  });
});
