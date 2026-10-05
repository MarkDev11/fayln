/**
 * Pengambilan daftar model dari provider.
 *
 * Jaringan TIDAK PERNAH disentuh di sini: `fetchProviderModels` menerima
 * fungsi fetch-nya sebagai argumen, jadi uji ini lulus di mesin mana pun tanpa
 * koneksi ke penyedia model sungguhan.
 *
 * Yang diuji bukan "HTTP bekerja", melainkan janji-janji yang mudah dilanggar
 * tanpa terlihat: header autentikasi yang benar untuk tiap jenis API, bentuk
 * jawaban yang berbeda-beda, dan — yang paling penting — kunci API yang tidak
 * boleh ikut ke mana-mana selain ke header permintaan.
 */

import { describe, expect, it } from 'vitest';

import { fetchProviderModels, MAX_SUGGESTED_MODELS } from '../src/admin/providerModels';

const KUNCI = 'sk-RAHASIA-yang-tidak-boleh-bocor';

type Panggilan = { url: string; init: RequestInit };

/** Fetch palsu yang mencatat permintaannya dan membalas apa yang diperintahkan. */
function fakeFetch(status: number, body: string): { calls: Panggilan[]; impl: typeof fetch } {
  const calls: Panggilan[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
    };
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const OPENAI = { baseUrl: 'https://api.contoh.test/v1', apiType: 'chat-completions' } as const;
const ANTHROPIC = { baseUrl: 'https://api.contoh.test/v1', apiType: 'messages' } as const;

describe('daftar model provider', () => {
  it('meminta ke /models pada alamat provider', async () => {
    const { calls, impl } = fakeFetch(200, '{"data":[{"id":"model-a"}]}');

    await fetchProviderModels(OPENAI, KUNCI, impl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.contoh.test/v1/models');
  });

  it('membuang garis miring di ujung alamat sebelum menyambung', async () => {
    const { calls, impl } = fakeFetch(200, '{"data":[]}');

    await fetchProviderModels(
      { baseUrl: 'https://api.contoh.test/v1/', apiType: 'chat-completions' },
      KUNCI,
      impl,
    );

    // Tanpa ini, alamatnya menjadi ".../v1//models" — dan sebagian penyedia
    // menolaknya sebagai 404 yang membingungkan.
    expect(calls[0]?.url).toBe('https://api.contoh.test/v1/models');
  });

  it('memakai Bearer untuk penyedia bergaya OpenAI', async () => {
    const { calls, impl } = fakeFetch(200, '{"data":[]}');

    await fetchProviderModels(OPENAI, KUNCI, impl);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KUNCI}`);
  });

  it('memakai x-api-key dan versi protokol untuk Anthropic', async () => {
    const { calls, impl } = fakeFetch(200, '{"data":[]}');

    await fetchProviderModels(ANTHROPIC, KUNCI, impl);

    const headers = calls[0]?.init.headers as Record<string, string>;
    // Bentuk yang salah menghasilkan 401 yang menyesatkan: kuncinya benar,
    // caranya yang salah.
    expect(headers['x-api-key']).toBe(KUNCI);
    expect(headers['anthropic-version']).toBeTruthy();
    expect(headers.authorization).toBeUndefined();
  });

  it('mengenali tiga bentuk jawaban yang lazim', async () => {
    const bentuk: [string, string[]][] = [
      ['{"data":[{"id":"a"},{"id":"b"}]}', ['a', 'b']],
      ['{"models":[{"name":"c"}]}', ['c']],
      ['["d","e"]', ['d', 'e']],
    ];

    for (const [body, harapan] of bentuk) {
      const { impl } = fakeFetch(200, body);
      const hasil = await fetchProviderModels(OPENAI, KUNCI, impl);
      expect(hasil, `bentuk jawaban tidak dikenali: ${body}`).toEqual({ ok: true, ids: harapan });
    }
  });

  it('membuang nama yang berulang', async () => {
    const { impl } = fakeFetch(200, '{"data":[{"id":"a"},{"id":"a"},{"id":"b"}]}');

    const hasil = await fetchProviderModels(OPENAI, KUNCI, impl);

    expect(hasil).toEqual({ ok: true, ids: ['a', 'b'] });
  });

  it('membatasi jumlah saran', async () => {
    const banyak = Array.from({ length: MAX_SUGGESTED_MODELS + 50 }, (_, index) => ({
      id: `model-${String(index)}`,
    }));
    const { impl } = fakeFetch(200, JSON.stringify({ data: banyak }));

    const hasil = await fetchProviderModels(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.ids).toHaveLength(MAX_SUGGESTED_MODELS);
    }
  });

  it('menerjemahkan penolakan kunci menjadi sebab yang dapat dibaca', async () => {
    const { impl } = fakeFetch(401, '{"error":{"message":"Invalid API key"}}');

    const hasil = await fetchProviderModels(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('unauthorized');
    }
  });

  it('melaporkan provider yang tidak dapat dihubungi, bukan melempar', async () => {
    const impl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.contoh.test');
    }) as unknown as typeof fetch;

    const hasil = await fetchProviderModels(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('unreachable');
      // Pesannya dipakai apa adanya: di sinilah admin paling butuh tahu APA
      // yang salah.
      expect(hasil.detail).toContain('ENOTFOUND');
    }
  });

  it('membedakan jawaban yang tidak dikenali dari daftar yang kosong', async () => {
    const bukanJson = fakeFetch(200, '<html>Halaman masuk</html>');
    const hasilBukanJson = await fetchProviderModels(OPENAI, KUNCI, bukanJson.impl);
    expect(hasilBukanJson.ok).toBe(false);
    if (!hasilBukanJson.ok) {
      expect(hasilBukanJson.reason).toBe('bad-response');
    }

    // Provider yang benar-benar tidak punya model adalah hal yang BERBEDA dari
    // jawaban yang tidak kita pahami — yang pertama berhasil, yang kedua tidak.
    const kosong = fakeFetch(200, '{"data":[]}');
    const hasilKosong = await fetchProviderModels(OPENAI, KUNCI, kosong.impl);
    expect(hasilKosong).toEqual({ ok: true, ids: [] });
  });

  it('menolak memanggil provider yang belum punya kunci', async () => {
    const { calls, impl } = fakeFetch(200, '{"data":[]}');

    const hasil = await fetchProviderModels(OPENAI, '', impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('no-key');
    }
    expect(calls, 'permintaan tetap dikirim tanpa kunci').toHaveLength(0);
  });

  it('tidak pernah menuliskan kunci ke pesan galat', async () => {
    /*
     * Penyedia kadang memantulkan potongan permintaan di badan galatnya. Kalau
     * badan itu disalin apa adanya ke halaman, kunci yang sedang dipakai akan
     * tampil di layar — dan halaman itu dapat dibaca peran `support`.
     */
    const { impl } = fakeFetch(500, `{"error":"upstream failed for key ${KUNCI}"}`);

    const hasil = await fetchProviderModels(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.detail).not.toContain(KUNCI);
    }
  });
});
