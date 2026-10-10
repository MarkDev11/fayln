import React from 'react';
import { render } from '@testing-library/react-native';

import { SimulatorBadge, SimulatorNotice } from '@/components/SimulatorBadge';
import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import type { StoryGateway } from '@/data/gateway';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Penanda simulator harus mengikuti MESIN, bukan kehendak pemanggil.
 *
 * Regresi produksi: `SimulatorBadge` selalu merender labelnya, dan tiga layar
 * memanggilnya tanpa syarat (`world/[worldId]`, `journey/[journeyId]`,
 * `settings/plan`). Di produksi mesinnya AI sungguhan (`simulator: false`,
 * `modelId: "ai-story"`), jadi aplikasi memberi tahu setiap pemain bahwa
 * ceritanya berasal dari contoh bawaan — kebalikan dari maksud NFR-16.
 *
 * BUKTI MERAH: hapus `if (!gateway.isSimulator) return null;` di
 * `SimulatorBadge.tsx`, lalu uji "TIDAK tampil saat mesinnya AI" memerah.
 *
 * Diuji sebagai PASANGAN dengan sengaja: hanya memeriksa sisi "hilang" akan
 * lulus juga bila komponennya rusak total dan tidak pernah merender apa pun.
 */

/** Mesin yang mengaku simulator — penanda WAJIB tampil. */
class MesinSimulator extends MockStoryGateway {
  override readonly isSimulator = true;
}

/** Mesin AI sungguhan — penanda WAJIB tidak tampil. */
class MesinAI extends MockStoryGateway {
  override readonly isSimulator = false;
}

const renderDengan = (gateway: StoryGateway) =>
  render(
    <TestProviders gateway={gateway}>
      <SimulatorBadge />
      <SimulatorNotice />
    </TestProviders>,
  );

describe('SimulatorBadge', () => {
  it('TAMPIL saat mesinnya memang simulator', async () => {
    const view = await renderDengan(new MesinSimulator());

    expect(view.queryByText('SIMULATOR')).toBeTruthy();
    expect(view.queryByText(/contoh bawaan/i)).toBeTruthy();
  });

  it('TIDAK tampil saat mesinnya AI sungguhan', async () => {
    const view = await renderDengan(new MesinAI());

    expect(view.queryByText('SIMULATOR')).toBeNull();
    expect(view.queryByText(/contoh bawaan/i)).toBeNull();
  });
});
