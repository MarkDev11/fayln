import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { en } from './en';
import { id, type Dictionary, type TranslationKey } from './id';

export type { Dictionary, TranslationKey };

/** Kode locale yang didukung UI. Berbeda dari bahasa respons cerita. */
export const UI_LOCALES = ['id-ID', 'en-US'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const dictionaries: Record<UiLocale, Dictionary> = {
  'id-ID': id,
  'en-US': en,
};

export const DEFAULT_UI_LOCALE: UiLocale = 'id-ID';

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);
}

/**
 * Mengganti placeholder `{nama}` dengan nilai yang diberikan.
 * Placeholder tanpa nilai dibiarkan apa adanya agar kekurangan terjemahan terlihat,
 * bukan berubah menjadi "undefined".
 */
export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  locale: UiLocale,
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_UI_LOCALE];
  const template = dictionary[key] ?? dictionaries[DEFAULT_UI_LOCALE][key] ?? key;
  return interpolate(template, values);
}

export type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export type I18nValue = {
  locale: UiLocale;
  t: TranslateFn;
  setLocale: (next: UiLocale) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

export type I18nProviderProps = {
  children: ReactNode;
  initialLocale?: UiLocale;
};

export function I18nProvider({ children, initialLocale = DEFAULT_UI_LOCALE }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<UiLocale>(initialLocale);

  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback<TranslateFn>(
    (key, values) => translate(locale, key, values),
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n harus dipakai di dalam I18nProvider.');
  }
  return value;
}

/**
 * Menghasilkan seluruh kunci yang hilang pada sebuah kamus.
 * Dipakai pengujian paritas ID/EN (NFR-12).
 */
export function missingKeys(candidate: Partial<Dictionary>): TranslationKey[] {
  const reference = Object.keys(id) as TranslationKey[];
  return reference.filter((key) => candidate[key] === undefined);
}

/** Menghasilkan kunci tambahan yang tidak ada di kamus referensi. */
export function extraKeys(candidate: Partial<Dictionary>): string[] {
  const reference = new Set<string>(Object.keys(id));
  return Object.keys(candidate).filter((key) => !reference.has(key));
}

/**
 * Format tanggal ringkas untuk daftar perjalanan.
 * Memakai Intl bawaan perangkat; tidak menambah dependensi tanggal.
 */
export function formatRelativeDay(isoDate: string, locale: UiLocale, now: Date = new Date()): string {
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) {
    return isoDate;
  }

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(target).getTime()) / 86_400_000,
  );

  if (diffDays <= 0) {
    return locale === 'id-ID' ? 'hari ini' : 'today';
  }
  if (diffDays === 1) {
    return locale === 'id-ID' ? 'kemarin' : 'yesterday';
  }
  if (diffDays < 7) {
    return locale === 'id-ID' ? `${diffDays} hari lalu` : `${diffDays} days ago`;
  }

  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(target);
}
