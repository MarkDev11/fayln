import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import type { StoryGateway } from './gateway';
import { MockStoryGateway } from './mock/MockStoryGateway';
import { HttpStoryGateway } from './http/HttpStoryGateway';
import { apiBaseUrl } from './http/apiConfig';
import { readToken } from './http/authSession';

const GatewayContext = createContext<StoryGateway | null>(null);

export type GatewayProviderProps = {
  children: ReactNode;
  /** Memungkinkan pengujian dan Storybook menyuntikkan gateway lain. */
  gateway?: StoryGateway;
};

/**
 * Menyediakan implementasi gateway ke seluruh pohon komponen.
 *
 * Layar tidak pernah mengimpor MockStoryGateway secara langsung; menggantinya dengan
 * gateway produksi cukup dilakukan di satu tempat ini (NFR-15).
 *
 * Pilihan gateway ditentukan `apiBaseUrl()`:
 * - mengembalikan alamat → `HttpStoryGateway` ke backend itu,
 * - mengembalikan `null`  → `MockStoryGateway`, tidak ada permintaan jaringan.
 */
export function GatewayProvider({ children, gateway }: GatewayProviderProps) {
  const value = useMemo<StoryGateway>(() => {
    if (gateway) {
      return gateway;
    }

    const baseUrl = apiBaseUrl();
    if (baseUrl === null) {
      return new MockStoryGateway();
    }

    return new HttpStoryGateway({
      baseUrl,
      // Penyedia asinkron: token sesi dibaca dari penyimpanan perangkat, tetapi
      // gateway harus tersedia segera agar pohon komponen tidak menunggu.
      // Mengembalikan null berarti pemain belum masuk; server menjawab 401 dan
      // lapisan atas mengalihkan ke layar masuk.
      accountId: () => readToken(),
    });
  }, [gateway]);

  // Penanda simulator dibaca dari server, bukan dikarang (NFR-16).
  useEffect(() => {
    if (value instanceof HttpStoryGateway) {
      void value.refreshMeta();
    }
  }, [value]);

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}

export function useGateway(): StoryGateway {
  const value = useContext(GatewayContext);
  if (!value) {
    throw new Error('useGateway harus dipakai di dalam GatewayProvider.');
  }
  return value;
}
