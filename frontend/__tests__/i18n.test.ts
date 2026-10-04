import { DEFAULT_UI_LOCALE, dictionaries, extraKeys, formatRelativeDay, interpolate, isUiLocale, missingKeys, translate } from '@/i18n';
import { en } from '@/i18n/en';
import { id } from '@/i18n/id';

describe('i18n', () => {
  it('memuat kamus Indonesia dan Inggris untuk kedua locale', () => {
    expect(dictionaries['id-ID']).toBe(id);
    expect(dictionaries['en-US']).toBe(en);
    expect(DEFAULT_UI_LOCALE).toBe('id-ID');
  });

  it('menjaga paritas kunci ID dan EN (NFR-12)', () => {
    expect(missingKeys(en)).toEqual([]);
    expect(extraKeys(en)).toEqual([]);
  });

  it('menolak locale yang tidak didukung', () => {
    expect(isUiLocale('id-ID')).toBe(true);
    expect(isUiLocale('en-US')).toBe(true);
    expect(isUiLocale('fr-FR')).toBe(false);
    expect(isUiLocale(undefined)).toBe(false);
  });

  it('tidak memiliki nilai kosong pada kamus Indonesia', () => {
    const empty = Object.entries(id).filter(([, value]) => value.trim().length === 0);
    expect(empty).toEqual([]);
  });

  describe('interpolate', () => {
    it('mengganti placeholder dengan nilai', () => {
      expect(interpolate('Beat {beat} • {decisions} keputusan', { beat: 12, decisions: 3 })).toBe(
        'Beat 12 • 3 keputusan',
      );
    });

    it('membiarkan placeholder tanpa nilai agar kekurangan terlihat', () => {
      expect(interpolate('Halo {nama}')).toBe('Halo {nama}');
    });

    it('mengembalikan template apa adanya bila tidak ada nilai', () => {
      expect(interpolate('Tanpa placeholder')).toBe('Tanpa placeholder');
    });
  });

  describe('translate', () => {
    it('mengambil string dari locale yang diminta', () => {
      expect(translate('id-ID', 'tabs.home')).toBe('Beranda');
      expect(translate('en-US', 'tabs.home')).toBe('Home');
    });

    it('menerapkan interpolasi pada string terjemahan', () => {
      expect(translate('id-ID', 'detail.versionLabel', { version: 7 })).toBe('Versi dunia 7');
      expect(translate('en-US', 'home.heroDotsLabel', { index: 1, total: 3 })).toBe(
        'World 1 of 3',
      );
    });
  });

  describe('formatRelativeDay', () => {
    const now = new Date('2026-09-30T10:00:00.000Z');

    it('menyebut hari ini', () => {
      expect(formatRelativeDay('2026-09-30T08:00:00.000Z', 'id-ID', now)).toBe('hari ini');
      expect(formatRelativeDay('2026-09-30T08:00:00.000Z', 'en-US', now)).toBe('today');
    });

    it('menyebut kemarin', () => {
      expect(formatRelativeDay('2026-09-29T08:00:00.000Z', 'id-ID', now)).toBe('kemarin');
    });

    it('menyebut jumlah hari untuk rentang di bawah sepekan', () => {
      expect(formatRelativeDay('2026-09-27T08:00:00.000Z', 'id-ID', now)).toBe('3 hari lalu');
    });

    it('kembali ke tanggal asli bila input tidak valid', () => {
      expect(formatRelativeDay('bukan-tanggal', 'id-ID', now)).toBe('bukan-tanggal');
    });
  });
});
