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

/**
 * Anggaran waktu rute yang menyusun adegan (regresi).
 *
 * Terukur 9 Oktober 2026 terhadap API produksi: `POST /v1/journeys` butuh
 * 19,1–24,0 detik. Batas bawaan 20 detik karena itu memutus permintaan yang
 * sebenarnya BERHASIL — server mengembalikan 201, tetapi klien sudah membatalkan
 * koneksi, dan pemain melihat "Perjalanan gagal dibuat. Coba lagi sebentar lagi."
 *
 * Uji ini menahan balasan lebih lama daripada batas bawaan dan menuntut
 * permintaan tetap selesai. Bila anggaran khusus itu dihapus, uji gagal.
 */
describe('HttpStoryGateway — anggaran waktu penyusunan adegan', () => {
  const config = {
    baseUrl: 'https://example.test',
    accountId: () => Promise.resolve('acc_test'),
  };

  it('menunggu lebih lama daripada batas bawaan saat membuat perjalanan', async () => {
    const payload = { journeyId: 'j_1', worldVersion: 1, opening: { beats: [] } };

    const fake = jest.fn(function slow(this: unknown) {
      // Lebih lama daripada batas bawaan 20 detik, lebih singkat daripada
      // anggaran rute cerita.
      return new Promise((resolve) => {
        setTimeout(
          () =>
            resolve(
              new Response(JSON.stringify(payload), {
                status: 201,
                headers: { 'content-type': 'application/json' },
              }),
            ),
          21_500,
        );
      });
    });

    const gateway = new HttpStoryGateway({
      ...config,
      fetchImpl: fake as unknown as typeof globalThis.fetch,
    });

    const result = await gateway.createJourney({
      clientOperationId: 'op_1',
      worldId: 'w_1',
      persona: { name: 'Tes', age: 25 },
      responseLocale: 'id-ID',
    });

    // Permintaan harus SELESAI, bukan dibatalkan oleh batas waktu.
    expect(result).toEqual(payload);
  }, 40_000);

  it('tetap membatalkan rute baca yang menggantung', async () => {
    // Menghormati isyarat pembatalan seperti `fetch` sungguhan: janji hanya
    // ditolak ketika isyaratnya dibatalkan. Tanpa ini, janji menggantung
    // selamanya dan ujinya kehabisan waktu, bukan gagal karena alasan yang benar.
    const fake = jest.fn(function hung(this: unknown, _url: string, init?: RequestInit) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    const gateway = new HttpStoryGateway({
      ...config,
      timeoutMs: 150,
      fetchImpl: fake as unknown as typeof globalThis.fetch,
    });

    await expect(gateway.fetchCatalog({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: 'NETWORK',
    });
  }, 10_000);
});
