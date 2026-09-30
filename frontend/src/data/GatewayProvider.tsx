import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

import { MockStoryGateway } from './mock/MockStoryGateway';
import type { StoryGateway } from './gateway';

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
 */
export function GatewayProvider({ children, gateway }: GatewayProviderProps) {
  const value = useMemo<StoryGateway>(() => gateway ?? new MockStoryGateway(), [gateway]);
  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}

export function useGateway(): StoryGateway {
  const value = useContext(GatewayContext);
  if (!value) {
    throw new Error('useGateway harus dipakai di dalam GatewayProvider.');
  }
  return value;
}
