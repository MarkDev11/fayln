/**
 * Panggilan model visi.
 *
 * Jaringan TIDAK PERNAH disentuh di sini: `describeLocationImage` menerima fungsi
 * fetch-nya sebagai argumen, jadi uji ini lulus di mesin mana pun tanpa koneksi
 * ke penyedia model.
 *
 * Yang diuji bukan "HTTP bekerja", melainkan janji-janji yang mudah dilanggar
 * tanpa terlihat: bentuk permintaan yang benar untuk tiap jenis API, keluaran
 * model yang sering dibungkus pagar kode, jalan keluar jujur saat gambar tidak
 * dapat dipakai, dan — yang paling penting — kunci API yang tidak boleh ikut ke
 * mana-mana selain ke header permintaan.
 */

import { describe, expect, it } from 'vitest';

import {
  describeLocationImage,
  MAX_VISION_NAME,
  VISION_SYSTEM_PROMPT,
  type VisionRequest,
} from '../src/admin/visionClient';

const KUNCI = 'sk-RAHASIA-yang-tidak-boleh-bocor';

type Panggilan = { url: string; init: RequestInit };

function fakeFetch(status: number, body: string): { calls: Panggilan[]; impl: typeof fetch } {
  const calls: Panggilan[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, text: async () => body };
  }) as unknown as typeof fetch;
  return { calls, impl };
}

/** Jawaban bergaya OpenAI yang memuat JSON yang kita minta. */
function openAiAnswer(name: string, description: string): string {
  return JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ name, description }) } }],
  });
}

const OPENAI: VisionRequest = {
  baseUrl: 'https://api.contoh.test/v1',
  apiType: 'chat-completions',
  modelKey: 'model-visi',
  imageBase64: 'AAAA',
  contentType: 'image/webp',
};

const ANTHROPIC: VisionRequest = { ...OPENAI, apiType: 'messages' };

describe('panggilan model visi', () => {
  it('meminta ke /chat/completions untuk penyedia bergaya OpenAI', async () => {
    const { calls, impl } = fakeFetch(200, openAiAnswer('Hutan Pinus', 'Hutan berkabut.'));

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(calls[0]?.url).toBe('https://api.contoh.test/v1/chat/completions');
    expect(hasil).toEqual({ ok: true, name: 'Hutan Pinus', description: 'Hutan berkabut.' });
  });

  it('meminta ke /messages untuk Anthropic', async () => {
    const { calls, impl } = fakeFetch(
      200,
      JSON.stringify({ content: [{ type: 'text', text: '{"name":"Aula","description":"Lapang."}' }] }),
    );

    const hasil = await describeLocationImage(ANTHROPIC, KUNCI, impl);

    expect(calls[0]?.url).toBe('https://api.contoh.test/v1/messages');
    expect(hasil).toEqual({ ok: true, name: 'Aula', description: 'Lapang.' });
  });

  it('memakai header autentikasi yang benar untuk tiap jenis API', async () => {
    const bearer = fakeFetch(200, openAiAnswer('A', 'B'));
    await describeLocationImage(OPENAI, KUNCI, bearer.impl);
    const headerOpenAi = bearer.calls[0]?.init.headers as Record<string, string>;
    expect(headerOpenAi.authorization).toBe(`Bearer ${KUNCI}`);

    const kunciHeader = fakeFetch(200, openAiAnswer('A', 'B'));
    await describeLocationImage(ANTHROPIC, KUNCI, kunciHeader.impl);
    const headerAnthropic = kunciHeader.calls[0]?.init.headers as Record<string, string>;
    expect(headerAnthropic['x-api-key']).toBe(KUNCI);
    expect(headerAnthropic.authorization).toBeUndefined();
  });

  it('mengirim gambarnya sebagai bagian dari pesan, bukan sebagai teks', async () => {
    const { calls, impl } = fakeFetch(200, openAiAnswer('A', 'B'));

    await describeLocationImage(OPENAI, KUNCI, impl);

    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: unknown }[];
    };
    // System prompt HARUS ikut: tanpanya model menjawab dengan kalimat bebas,
    // dan halaman tidak punya cara memisahkan nama dari keterangan.
    expect(body.messages[0]?.role).toBe('system');
    expect(String(body.messages[0]?.content)).toContain('visual-novel');

    const bagian = body.messages[1]?.content as { type: string; image_url?: { url: string } }[];
    const gambar = bagian.find((item) => item.type === 'image_url');
    expect(gambar?.image_url?.url.startsWith('data:image/webp;base64,')).toBe(true);
  });

  it('menerima jawaban yang dibungkus pagar kode', async () => {
    /*
     * Model kecil sering menambahkan pagar kode walaupun promptnya melarang.
     * Menolak jawaban karena itu berarti membuang pekerjaan yang sebenarnya
     * benar — jadi yang dicari objek JSON pertamanya, bukan teksnya utuh.
     */
    const { impl } = fakeFetch(
      200,
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'Tentu, ini hasilnya:\n```json\n{"name":"Pantai","description":"Pasir putih."}\n```',
            },
          },
        ],
      }),
    );

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil).toEqual({ ok: true, name: 'Pantai', description: 'Pasir putih.' });
  });

  it('membedakan model yang menolak dari kegagalan teknis', async () => {
    /*
     * Promptnya memberi jalan keluar jujur: balas dengan string kosong bila
     * gambarnya tidak dapat dipakai. Itu jawaban yang SAH — menampilkannya
     * sebagai "gagal" akan menyesatkan admin, yang lalu mengira modelnya rusak
     * padahal modelnya justru sedang berperilaku benar.
     */
    const { impl } = fakeFetch(200, openAiAnswer('', ''));

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('declined');
      expect(hasil.detail).not.toContain('gagal');
    }
  });

  it('melaporkan jenis API yang belum didukung tanpa memanggil apa pun', async () => {
    const { calls, impl } = fakeFetch(200, openAiAnswer('A', 'B'));

    const hasil = await describeLocationImage({ ...OPENAI, apiType: 'responses' }, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('unsupported-api-type');
    }
    // Mengirim permintaan dengan bentuk yang salah akan menghasilkan galat
    // penyedia yang tidak menjelaskan apa pun tentang pilihan admin.
    expect(calls, 'permintaan tetap dikirim').toHaveLength(0);
  });

  it('menerjemahkan penolakan kunci menjadi sebab yang dapat dibaca', async () => {
    const { impl } = fakeFetch(401, '{"error":{"message":"Invalid API key"}}');

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('unauthorized');
    }
  });

  it('melaporkan penyedia yang tidak dapat dihubungi, bukan melempar', async () => {
    const impl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.contoh.test');
    }) as unknown as typeof fetch;

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('unreachable');
      expect(hasil.detail).toContain('ENOTFOUND');
    }
  });

  it('melaporkan jawaban yang bukan JSON sebagai bad-response', async () => {
    // Model menjawab dengan kalimat biasa, tanpa objek JSON sama sekali.
    const { impl } = fakeFetch(
      200,
      JSON.stringify({
        choices: [{ message: { content: 'Maaf, saya tidak dapat membantu untuk gambar ini.' } }],
      }),
    );

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('bad-response');
      // Isi jawabannya ditampilkan: admin perlu melihat apa yang SEBENARNYA
      // dikatakan model untuk menebak apa yang salah.
      expect(hasil.detail).toContain('Maaf');
    }
  });

  it('memotong nama yang keterlaluan panjangnya', async () => {
    const panjang = 'A'.repeat(MAX_VISION_NAME + 80);
    const { impl } = fakeFetch(200, openAiAnswer(panjang, 'B'));

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.name).toHaveLength(MAX_VISION_NAME);
    }
  });

  it('tidak pernah menuliskan kunci ke pesan galat', async () => {
    /*
     * Sebagian penyedia memantulkan potongan permintaan di badan galatnya.
     * Kalau badan itu disalin apa adanya ke halaman, kunci yang sedang dipakai
     * akan tampil di layar — dan halaman itu dapat dibaca peran `support`.
     */
    const { impl } = fakeFetch(500, `{"error":"upstream failed for key ${KUNCI}"}`);

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.detail).not.toContain(KUNCI);
    }
  });

  it('meminta keluaran bahasa Indonesia di dalam system prompt', async () => {
    // Promptnya berbahasa Inggris, tetapi yang dihasilkan dipakai pemain —
    // jadi bahasanya harus disebut eksplisit.
    expect(VISION_SYSTEM_PROMPT).toContain('Indonesian');
    expect(VISION_SYSTEM_PROMPT).toContain('JSON');
    // Dan jalan keluar jujurnya harus ada, kalau tidak model akan mengarang.
    expect(VISION_SYSTEM_PROMPT).toContain('Do not guess');
  });
});
