import { HttpStoryGateway } from '@/data/http/HttpStoryGateway';

/**
 * Penerima `this` saat memanggil `fetch` (regresi).
 *
 * Gateway menyimpan `fetch` sebagai anggota dan memanggilnya sebagai metode
 * (`this.fetchImpl(...)`). Di web, `fetch` adalah API native yang MENOLAK
 * penerima selain Window dan melempar "Illegal invocation" sebelum permintaan
 * dikirim — akibatnya tidak ada permintaan jaringan sama sekali dan UI
 * menampilkan "Kamu sedang offline" padahal server sehat.
 *
 * Cacat itu tidak pernah tertangkap selama pengembangan web memakai gateway
 * contoh, karena gateway itu tidak menyentuh `fetch`.
 */
describe('HttpStoryGateway — penerima fetch', () => {
  const config = {
    baseUrl: 'https://example.test',
    accountId: () => Promise.resolve('acc_test'),
  };

  const fetchImplOf = (gateway: HttpStoryGateway): typeof globalThis.fetch =>
    (gateway as unknown as { fetchImpl: typeof globalThis.fetch }).fetchImpl;

  it('mengikat fetch global ke globalThis', () => {
    const gateway = new HttpStoryGateway(config);

    // Fungsi yang sudah diikat tidak pernah identik dengan aslinya. Bila
    // pengikatan dihapus, perbandingan ini menjadi sama dan uji gagal.
    expect(fetchImplOf(gateway)).not.toBe(globalThis.fetch);
  });

  it('tidak mengikat fetchImpl yang disuntikkan pengujian', () => {
    const injected = jest.fn();
    const gateway = new HttpStoryGateway({
      ...config,
      fetchImpl: injected as unknown as typeof globalThis.fetch,
    });

    // Pengujian menyuntikkan fungsi biasa; mengikatnya akan mengubah perilaku
    // yang mereka andalkan, jadi sengaja dibiarkan apa adanya.
    expect(fetchImplOf(gateway)).toBe(injected);
  });

  it('meneruskan globalThis sebagai penerima, bukan objek gateway', async () => {
    const receivers: unknown[] = [];
    const fake = jest.fn(function receiver(this: unknown) {
      receivers.push(this);
      return Promise.resolve(
        new Response('{"items":[],"page":1,"pageSize":20,"total":0,"hasMore":false}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    jest.spyOn(globalThis, 'fetch').mockImplementation(fake as unknown as typeof globalThis.fetch);

    try {
      const gateway = new HttpStoryGateway(config);
      await gateway.fetchCatalog({ page: 1, pageSize: 20 });

      expect(receivers.length).toBeGreaterThan(0);
      // Bila `fetch` tidak diikat, penerimanya adalah objek gateway — dan di web
      // itu berarti Illegal invocation.
      expect(receivers[0]).toBe(globalThis);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
