import { useCallback, useEffect, useRef, useState } from 'react';

export type TypewriterState = {
  /** Teks yang sudah terlihat sejauh ini. */
  visibleText: string;
  /** Apakah seluruh teks sudah tampil. */
  isComplete: boolean;
  /** Menampilkan seluruh teks sekaligus. */
  complete: () => void;
};

/**
 * Efek mesin tik untuk dialog.
 *
 * Pemain dapat menekan sekali untuk menyelesaikan teks (FR-16). Interval dijepit
 * agar teks tidak pernah lebih lambat dari 40 ms per karakter, sehingga baris
 * panjang tidak terasa macet.
 */
export function useTypewriter(
  fullText: string,
  options: { enabled?: boolean; charsPerTick?: number; tickMs?: number } = {},
): TypewriterState {
  const { enabled = true, charsPerTick = 1, tickMs = 22 } = options;
  const [visibleCount, setVisibleCount] = useState(enabled ? 0 : fullText.length);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    stop();
    setVisibleCount(enabled ? 0 : fullText.length);
  }, [fullText, enabled, stop]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    if (visibleCount >= fullText.length) {
      return undefined;
    }

    timerRef.current = setInterval(() => {
      setVisibleCount((current) => {
        const next = current + charsPerTick;
        if (next >= fullText.length) {
          stop();
          return fullText.length;
        }
        return next;
      });
    }, tickMs);

    return stop;
  }, [enabled, fullText, visibleCount, charsPerTick, tickMs, stop]);

  const complete = useCallback(() => {
    stop();
    setVisibleCount(fullText.length);
  }, [fullText.length, stop]);

  return {
    visibleText: fullText.slice(0, visibleCount),
    isComplete: visibleCount >= fullText.length,
    complete,
  };
}
