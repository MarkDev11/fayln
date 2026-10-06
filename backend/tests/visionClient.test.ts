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

/** Mengambil bagian gambar dari badan permintaan yang tercatat. */
function bagianGambar(call: Panggilan | undefined): { type: string; image_url: unknown } {
  const body = JSON.parse(String(call?.init.body)) as {
    messages: { role: string; content: unknown }[];
  };
  const isi = body.messages[1]?.content as { type: string; image_url?: unknown }[];
  const gambar = isi.find((item) => item.type === 'image_url');
  return { type: 'image_url', image_url: gambar?.image_url };
}

/** Jawaban bergaya OpenAI yang memuat JSON yang kita minta. */
function openAiAnswer(name: string, description: string, reason?: string): string {
  const isi: Record<string, string> = { name, description };
  if (reason !== undefined) {
    isi.reason = reason;
  }
  return JSON.stringify({
    choices: [{ message: { content: JSON.stringify(isi) } }],
  });
}

const OPENAI: VisionRequest = {
  baseUrl: 'https://api.contoh.test/v1',
  apiType: 'chat-completions',
  imagePart: 'object',
  modelKey: 'model-visi',
  imageBase64: 'AAAA',
  contentType: 'image/webp',
};

const ANTHROPIC: VisionRequest = { ...OPENAI, apiType: 'messages' };
const MISTRAL: VisionRequest = { ...OPENAI, imagePart: 'string' };

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

  it('membungkus gambar sebagai OBJEK untuk OpenAI dan gateway sejenis', async () => {
    const { calls, impl } = fakeFetch(200, openAiAnswer('A', 'B'));

    await describeLocationImage(OPENAI, KUNCI, impl);

    const bagian = bagianGambar(calls[0]);
    expect(typeof bagian.image_url).toBe('object');
    expect((bagian.image_url as { url: string }).url).toContain('data:image/webp;base64,');
  });

  it('membungkus gambar sebagai TEKS untuk Mistral', async () => {
    /*
     * Inilah bug yang menghabiskan 20 gambar pada 6 Oktober 2026.
     *
     * Mistral menuntut `image_url` berupa teks, bukan objek ber-`url`. Bentuk
     * yang salah TIDAK menghasilkan galat: bagiannya dibuang diam-diam, lalu
     * modelnya menjawab "tidak ada gambar yang diberikan" — gejala yang
     * menyesatkan ke arah yang salah sama sekali.
     */
    const { calls, impl } = fakeFetch(200, openAiAnswer('A', 'B'));

    await describeLocationImage(MISTRAL, KUNCI, impl);

    const bagian = bagianGambar(calls[0]);
    expect(typeof bagian.image_url).toBe('string');
    expect(bagian.image_url).toContain('data:image/webp;base64,');
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

  it('menampilkan ALASAN dari model, bukan kesimpulan yang ditarik kode', async () => {
    /*
     * Jawaban kosong tanpa alasan tidak dapat dibedakan antara "model menolak
     * gambar ini" dan "gambar tidak pernah sampai ke modelnya" — dan keduanya
     * membutuhkan tindakan yang sama sekali berbeda dari admin. Karena itu
     * promptnya meminta alasan, dan alasannya yang ditampilkan.
     */
    const { impl } = fakeFetch(
      200,
      openAiAnswer('', '', 'Tidak ada gambar yang saya terima pada permintaan ini.'),
    );

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('declined');
      expect(hasil.detail).toContain('Tidak ada gambar yang saya terima');
      /*
       * Jalur cadangannya memuat SELURUH JSON, jadi kehadiran teks itu saja belum
       * membuktikan alasannya benar-benar dibaca. Yang membedakannya: JSON mentah
       * memuat nama bidangnya.
       */
      expect(hasil.detail).not.toContain('"reason"');
      // Kesimpulan lama tidak boleh muncul lagi: ia menyesatkan ke arah yang salah.
      expect(hasil.detail).not.toContain('tidak dapat dipakai sebagai lokasi');
    }
  });

  it('mengatakan terus terang saat model tidak menyebut alasan apa pun', async () => {
    const { impl } = fakeFetch(200, openAiAnswer('', ''));

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('declined');
      expect(hasil.detail).toContain('tidak menyebut alasannya');
    }
  });

  it('membaca teks dari bidang lain ketika content kosong', async () => {
    // Sebagian penyedia menaruh teksnya di `refusal` atau `reasoning_content`
    // ketika model menolak. Menampilkan "jawaban tidak dikenali" untuk jawaban
    // yang sebenarnya ada berarti membuang satu-satunya petunjuk yang dimiliki.
    const { impl } = fakeFetch(
      200,
      JSON.stringify({
        choices: [{ message: { content: null, refusal: 'I cannot help with that request.' } }],
      }),
    );

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.detail).toContain('cannot help');
    }
  });

  it('mengambil jawaban TERAKHIR, bukan contoh bentuk di dalam penalaran', async () => {
    /*
     * Kejadian nyata 6 Oktober 2026: modelnya menulis penalaran panjang, dan di
     * tengahnya menyebut contoh bentuk JSON — {"name": "...", "description": "..."}
     * — sebelum menulis jawaban sebenarnya di akhir.
     *
     * Mengambil objek PERTAMA akan mengurai contoh itu, dan hasilnya lokasi
     * bernama tiga titik.
     */
    const penalaran = [
      'Okay, the user wants me to catalogue this image. I need to reply with',
      '{"name": "...", "description": "..."} where the name is in Indonesian.',
      'Looking at the image: it is a modern office with rows of desks.',
      'So the answer is:',
      '{"name": "Kantor Modern", "description": "Ruang kantor lapang dengan meja berjajar."}',
    ].join('\n');

    const { impl } = fakeFetch(
      200,
      JSON.stringify({ choices: [{ message: { content: penalaran }, finish_reason: 'stop' }] }),
    );

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil).toEqual({
      ok: true,
      name: 'Kantor Modern',
      description: 'Ruang kantor lapang dengan meja berjajar.',
    });
  });

  it('tidak menerima contoh bentuk sebagai nama lokasi', async () => {
    /*
     * Kalau model hanya menulis contoh bentuknya dan tidak pernah sampai ke
     * jawabannya, yang ada hanyalah {"name":"..."}. Itu BUKAN jawaban — dan
     * menerimanya berarti membuat lokasi bernama tiga titik.
     *
     * Nama KOSONG tetap diterima: itu jalan keluar jujur yang disediakan
     * promptnya saat model tidak dapat menamai tempatnya.
     */
    const { impl } = fakeFetch(
      200,
      JSON.stringify({
        choices: [
          {
            message: { content: 'I should reply with {"name": "...", "description": "..."}' },
            finish_reason: 'stop',
          },
        ],
      }),
    );

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('bad-response');
    }
  });

  it('membedakan jawaban TERPOTONG dari jawaban yang bukan JSON', async () => {
    /*
     * Dua masalah berbeda dengan obat yang berbeda: yang satu menaikkan batas
     * token, yang satu memperbaiki prompt. Menyebut keduanya dengan pesan yang
     * sama membuat admin mencoba perbaikan yang salah.
     */
    const { impl } = fakeFetch(
      200,
      JSON.stringify({
        choices: [
          { message: { content: 'Okay, the user wants me to catalogue this image. First I need to' }, finish_reason: 'length' },
        ],
      }),
    );

    const hasil = await describeLocationImage(OPENAI, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.detail).toContain('terpotong');
      expect(hasil.detail).toContain('token');
    }
  });

  it('menyisakan ruang bernalar di batas token', async () => {
    /*
     * Batas 400 token pernah membuat SEMUA jawaban terpotong di tengah penalaran.
     * Jawabannya sendiri hanya puluhan token; ruangnya dipakai untuk berpikir.
     */
    const { calls, impl } = fakeFetch(200, openAiAnswer('A', 'B'));

    await describeLocationImage(OPENAI, KUNCI, impl);

    const body = JSON.parse(String(calls[0]?.init.body)) as { max_tokens: number };
    expect(body.max_tokens).toBeGreaterThanOrEqual(1_000);
  });

  it('meminta jawaban JSON ditulis paling akhir', async () => {
    // Model yang bernalar tetap akan bernalar; yang bisa diminta adalah agar
    // jawabannya ditulis SETELAH penalarannya, bukan menggantikannya.
    expect(VISION_SYSTEM_PROMPT).toContain('LAST');
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

  it('meminta keluaran bahasa Indonesia, dan alasan saat model tidak dapat menamai', async () => {
    // Promptnya berbahasa Inggris, tetapi yang dihasilkan dipakai pemain —
    // jadi bahasanya harus disebut eksplisit.
    expect(VISION_SYSTEM_PROMPT).toContain('Indonesian');
    expect(VISION_SYSTEM_PROMPT).toContain('JSON');
    // Jalan keluar jujurnya harus ada, kalau tidak model akan mengarang nama.
    expect(VISION_SYSTEM_PROMPT.toLowerCase()).toContain('do not guess');
    /*
     * Dan jalan keluarnya harus MEMINTA ALASAN. Tanpa itu, jawaban kosong tidak
     * dapat dibedakan antara "model menolak gambar ini" dan "gambar tidak pernah
     * sampai" — dua masalah dengan tindakan yang sama sekali berbeda.
     */
    expect(VISION_SYSTEM_PROMPT).toContain('"reason"');
  });
});
