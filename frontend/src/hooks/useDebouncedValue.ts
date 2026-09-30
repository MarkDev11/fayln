import { useEffect, useState } from 'react';

/**
 * Menunda pembaruan nilai sampai pemain berhenti mengetik.
 * Dipakai agar pencarian katalog tidak memicu permintaan pada setiap ketukan.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
