import { sanitizePayload, telemetry } from '@/telemetry/analytics';

describe('telemetri nonteks (NFR-10, R-15)', () => {
  beforeEach(() => {
    telemetry.clear();
    telemetry.setSink(null);
  });

  it('membuang kunci terlarang dari payload', () => {
    const safe = sanitizePayload({
      screen: 'home',
      count: 3,
      // Field berikut sengaja disuntikkan untuk membuktikan penyaringan.
      ...({ text: 'dialog rahasia', name: 'Arfan', customText: 'isi bebas' } as object),
    });

    expect(safe).toEqual({ screen: 'home', count: 3 });
    expect(safe).not.toHaveProperty('text');
    expect(safe).not.toHaveProperty('name');
    expect(safe).not.toHaveProperty('customText');
  });

  it('mencatat peristiwa tanpa data sensitif', () => {
    telemetry.track('catalog_search', {
      count: 2,
      ...({ text: 'rahasia' } as object),
    });

    const snapshot = telemetry.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.event).toBe('catalog_search');
    expect(snapshot[0]?.payload).toEqual({ count: 2 });
  });

  it('membatasi ukuran buffer agar tidak tumbuh tanpa batas', () => {
    for (let index = 0; index < 260; index += 1) {
      telemetry.track('screen_view', { count: index });
    }
    expect(telemetry.snapshot().length).toBeLessThanOrEqual(200);
  });

  it('meneruskan ke sink yang terpasang', () => {
    const received: string[] = [];
    telemetry.setSink((event) => received.push(event));
    telemetry.track('log_opened');
    expect(received).toEqual(['log_opened']);
  });
});
