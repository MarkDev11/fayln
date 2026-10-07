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
  describeCharacterPortrait,
  generateWorldText,
  TEXT_TIMEOUT_MS,
  VISION_TIMEOUT_MS,
  WORLD_TEXT_SYSTEM_PROMPT,
  describeLocationImage,
  MAX_VISION_NAME,
  PORTRAIT_SYSTEM_PROMPT,
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

/* ------------------------------------------------------------------ */

/**
 * Potret karakter: keterangan berformat "ekspresi, pakaian, pose".
 *
 * Yang diuji di sini bukan "model menjawab", melainkan janji yang mudah
 * dilanggar tanpa terlihat: TEPAT TIGA bagian. Label yang berisi dua atau empat
 * bagian tampak wajar bagi mata manusia tetapi tidak dapat dibaca mesin — dan
 * itu lebih buruk daripada gagal, karena tidak ada yang menyadarinya sampai
 * mesin cerita memilih ekspresi yang salah.
 */
describe('keterangan potret karakter', () => {
  const KUNCI = 'sk-RAHASIA-yang-tidak-boleh-bocor';

  const POTRET: VisionRequest = {
    baseUrl: 'https://api.contoh.test/v1',
    apiType: 'chat-completions',
    imagePart: 'object',
    modelKey: 'model-visi',
    imageBase64: 'AAAA',
    contentType: 'image/webp',
  };

  type Panggilan = { url: string; init: RequestInit };

  function fakeFetch(status: number, body: string): { calls: Panggilan[]; impl: typeof fetch } {
    const calls: Panggilan[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status, ok: status >= 200 && status < 300, text: async () => body };
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  function jawaban(isi: Record<string, string>, finish = 'stop'): string {
    return JSON.stringify({
      choices: [{ message: { content: JSON.stringify(isi) }, finish_reason: finish }],
    });
  }

  it('menerima keterangan yang tepat tiga bagian', async () => {
    const { impl } = fakeFetch(200, jawaban({ label: 'senyum, pakaian kantor, normal' }));

    const hasil = await describeCharacterPortrait(POTRET, KUNCI, impl);

    expect(hasil).toEqual({ ok: true, label: 'senyum, pakaian kantor, normal' });
  });

  it('menolak keterangan yang hanya dua bagian, dan menyebut jumlahnya', async () => {
    /*
     * "Keterangan tidak sah" tidak memberi admin apa pun untuk dikerjakan.
     * Menyebut berapa bagian yang model tulis menunjukkan ke arah mana ia salah.
     */
    const { impl } = fakeFetch(200, jawaban({ label: 'senyum, pakaian kantor' }));

    const hasil = await describeCharacterPortrait(POTRET, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('bad-response');
      expect(hasil.detail).toContain('2');
    }
  });

  it('menolak keterangan yang empat bagian', async () => {
    const { impl } = fakeFetch(200, jawaban({ label: 'senyum, pakaian kantor, normal, duduk' }));

    const hasil = await describeCharacterPortrait(POTRET, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.detail).toContain('4');
    }
  });

  it('menampilkan alasan model saat ia menolak', async () => {
    const { impl } = fakeFetch(200, jawaban({ label: '', reason: 'Tidak ada potret yang saya terima.' }));

    const hasil = await describeCharacterPortrait(POTRET, KUNCI, impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('declined');
      expect(hasil.detail).toContain('Tidak ada potret yang saya terima');
    }
  });

  it('memakai prompt potret, bukan prompt lokasi', async () => {
    /*
     * Dua tugas ini berbagi pengangkutan permintaan yang sama, jadi tertukarnya
     * prompt tidak menghasilkan galat apa pun — hanya label yang bentuknya salah.
     */
    const { calls, impl } = fakeFetch(200, jawaban({ label: 'a, b, c' }));

    await describeCharacterPortrait(POTRET, KUNCI, impl);

    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages[0]?.content).toContain('portrait');
    expect(body.messages[0]?.content).not.toContain('location');
  });

  it('mengambil label TERAKHIR, bukan contoh bentuk di dalam penalaran', async () => {
    const penalaran = [
      'Okay, the user wants three parts. The shape is {"label": "..."} and I',
      'should write something like "ekspresi, pakaian, pose".',
      'Looking at the portrait: she is smiling, wearing office clothes, standing.',
      '{"label": "senyum, pakaian kantor, normal"}',
    ].join('\n');

    const { impl } = fakeFetch(
      200,
      JSON.stringify({ choices: [{ message: { content: penalaran }, finish_reason: 'stop' }] }),
    );

    const hasil = await describeCharacterPortrait(POTRET, KUNCI, impl);

    expect(hasil).toEqual({ ok: true, label: 'senyum, pakaian kantor, normal' });
  });

  it('meminta tepat tiga bagian di dalam prompt', async () => {
    expect(PORTRAIT_SYSTEM_PROMPT).toContain('EXACTLY THREE');
    expect(PORTRAIT_SYSTEM_PROMPT).toContain('Indonesian');
    // Jalan keluar jujurnya harus ada, kalau tidak model akan mengarang.
    expect(PORTRAIT_SYSTEM_PROMPT.toLowerCase()).toContain('do not guess');
    // Dan ketiga bagiannya harus disebutkan namanya, bukan hanya jumlahnya.
    for (const bagian of ['expression', 'clothing', 'pose']) {
      expect(PORTRAIT_SYSTEM_PROMPT, `bagian "${bagian}" tidak disebut`).toContain(bagian);
    }
  });
});

/* ------------------------------------------------------------------ */

/**
 * Sinopsis dan premis dunia dari judul.
 *
 * Tugas AI pertama yang TIDAK menyentuh gambar. Yang paling penting diuji di
 * sini bukan "model menjawab", melainkan tiga janji yang mudah dilanggar tanpa
 * terlihat:
 *
 *   - permintaannya tidak memuat gambar sama sekali;
 *   - aturan "dilarang menyebut nama" benar-benar tertulis di promptnya;
 *   - jatah tokennya cukup untuk sekitar seribu kata keluaran.
 */
describe('teks dunia dari judul', () => {
  const KUNCI = 'sk-RAHASIA-yang-tidak-boleh-bocor';

  const TEKS = { baseUrl: 'https://api.contoh.test/v1', apiType: 'chat-completions' as const, modelKey: 'model-teks' };

  type Panggilan = { url: string; init: RequestInit };

  function fakeFetch(status: number, body: string): { calls: Panggilan[]; impl: typeof fetch } {
    const calls: Panggilan[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status, ok: status >= 200 && status < 300, text: async () => body };
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  function jawaban(isi: Record<string, string>): string {
    return JSON.stringify({
      choices: [{ message: { content: JSON.stringify(isi) }, finish_reason: 'stop' }],
    });
  }

  it('mengembalikan sinopsis dan premis', async () => {
    const { impl } = fakeFetch(
      200,
      jawaban({ synopsis: 'Kantor itu tutup, tetapi kamu masih di dalamnya.', premise: 'Hujan turun sejak pagi.' }),
    );

    const hasil = await generateWorldText(TEKS, KUNCI, 'Rapat Tengah Malam', impl);

    expect(hasil).toEqual({
      ok: true,
      synopsis: 'Kantor itu tutup, tetapi kamu masih di dalamnya.',
      premise: 'Hujan turun sejak pagi.',
    });
  });

  it('TIDAK mengirim gambar sama sekali', async () => {
    /*
     * Ini penjaga terpentingnya. Tugas visi dan tugas teks berbagi pengangkutan
     * yang sama, jadi menyalin penyusun badan permintaan dari sana akan
     * menyertakan lampiran gambar — dan permintaannya tetap berhasil, hanya
     * hasilnya tidak lagi murni dari judul.
     */
    const { calls, impl } = fakeFetch(200, jawaban({ synopsis: 'a', premise: 'b' }));

    await generateWorldText(TEKS, KUNCI, 'Judul', impl);

    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: unknown }[];
    };
    const isi = JSON.stringify(body);

    expect(isi, 'permintaan teks memuat lampiran gambar').not.toContain('image_url');
    expect(isi, 'permintaan teks memuat data gambar').not.toContain('base64');
    expect(isi, 'permintaan teks memuat data URL').not.toContain('data:image');

    // Pesannya harus teks biasa, bukan larik bagian seperti pada tugas visi.
    for (const pesan of body.messages) {
      expect(typeof pesan.content, 'isi pesan bukan teks biasa').toBe('string');
    }
  });

  it('memakai jalur chat completions dengan judul di dalam pesannya', async () => {
    const { calls, impl } = fakeFetch(200, jawaban({ synopsis: 'a', premise: 'b' }));

    await generateWorldText(TEKS, KUNCI, 'Rapat Tengah Malam', impl);

    expect(calls[0]?.url).toBe('https://api.contoh.test/v1/chat/completions');
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: string }[];
      max_tokens: number;
    };
    expect(body.messages[1]?.content).toContain('Rapat Tengah Malam');

    /*
     * Jatah tokennya harus cukup untuk sekitar SERIBU kata keluaran. Dengan batas
     * 2.000 — yang dipakai tugas visi — model yang bernalar akan menghabiskan
     * jatahnya untuk berpikir dan jawabannya terpotong di tengah.
     */
    expect(body.max_tokens, 'jatah token terlalu kecil untuk seribu kata').toBeGreaterThan(4000);
  });

  it('menolak jawaban yang hanya memuat satu bidang', async () => {
    const { impl } = fakeFetch(200, jawaban({ synopsis: 'Hanya sinopsis.', premise: '' }));

    const hasil = await generateWorldText(TEKS, KUNCI, 'Judul', impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('declined');
    }
  });

  it('menampilkan alasan model saat ia menolak', async () => {
    const { impl } = fakeFetch(
      200,
      jawaban({ synopsis: '', premise: '', reason: 'Judulnya terlalu pendek untuk dikembangkan.' }),
    );

    const hasil = await generateWorldText(TEKS, KUNCI, 'X', impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.detail).toContain('Judulnya terlalu pendek');
    }
  });

  it('melarang menyebut nama, dan menyebut peran sebagai gantinya', async () => {
    /*
     * ATURAN TERPENTINGNYA. Dunia ini adalah KERANGKA: karakter yang mengisinya
     * belum tentu ada saat teksnya ditulis, dan yang memasangnya kelak bebas
     * memilih siapa pun. Nama yang tertulis di sinopsis akan berbenturan dengan
     * nama itu; sebutan peran tetap benar untuk siapa pun.
     */
    expect(WORLD_TEXT_SYSTEM_PROMPT).toContain('NEVER WRITE A CHARACTER NAME');
    expect(WORLD_TEXT_SYSTEM_PROMPT).toContain('ROLE');
    // Peran harus punya contohnya, kalau tidak model akan mengarang sendiri.
    expect(WORLD_TEXT_SYSTEM_PROMPT).toContain('bosmu');
    expect(WORLD_TEXT_SYSTEM_PROMPT).toContain('sahabatmu');
    // Orang kedua, dan panjangnya disebut angkanya.
    expect(WORLD_TEXT_SYSTEM_PROMPT).toContain('"kamu"');
    expect(WORLD_TEXT_SYSTEM_PROMPT).toContain('500 words');
    // Jalan keluar jujur saat judulnya kabur, bukan bertanya balik.
    expect(WORLD_TEXT_SYSTEM_PROMPT).toContain('invent');
  });
});

/* ------------------------------------------------------------------ */

/**
 * Batas waktu, dan penjelasan saat waktu habis.
 *
 * Dua hal yang berbeda dan sama-sama pernah salah:
 *
 *   1. BATASNYA terlalu pendek untuk tugas teks. Dengan 45 detik — batas tugas
 *      visi — menulis sekitar seribu kata hampir pasti selalu habis waktu.
 *   2. PESANNYA diteruskan mentah. "The operation was aborted due to timeout"
 *      adalah teks Node dalam bahasa Inggris; admin yang membacanya tidak tahu
 *      bahwa modelnya belum selesai, berapa lama ia ditunggu, atau apa yang
 *      harus dilakukan.
 */
describe('batas waktu tugas teks', () => {
  const KUNCI = 'sk-RAHASIA-yang-tidak-boleh-bocor';
  const TEKS = { baseUrl: 'https://api.contoh.test/v1', apiType: 'chat-completions' as const, modelKey: 'model-teks' };

  it('jauh lebih longgar daripada tugas visi', async () => {
    /*
     * Model menulis sekitar 30-80 token per detik, dan seribu kata berbahasa
     * Indonesia kira-kira 1.500 token — jadi 20-50 detik untuk menulisnya saja,
     * belum termasuk waktu berpikir model yang bernalar.
     */
    expect(TEXT_TIMEOUT_MS, 'batas tugas teks terlalu pendek').toBeGreaterThanOrEqual(120_000);
    expect(
      TEXT_TIMEOUT_MS,
      'batas tugas teks tidak lebih longgar daripada tugas visi',
    ).toBeGreaterThan(VISION_TIMEOUT_MS);
  });

  it('menjelaskan waktu habis dalam bahasa Indonesia, bukan meneruskan pesan Node', async () => {
    const habis = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    const impl = (async () => {
      throw habis;
    }) as unknown as typeof fetch;

    const hasil = await generateWorldText(TEKS, KUNCI, 'Judul', impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.reason).toBe('unreachable');
      // Pesan mentahnya tidak boleh muncul apa adanya.
      expect(hasil.detail, 'pesan Node diteruskan mentah').not.toContain('aborted due to timeout');
      // Yang harus ada: berapa lama ditunggu, dan apa yang bisa dilakukan.
      expect(hasil.detail).toContain('180 detik');
      expect(hasil.detail).toContain('Coba lagi');
    }
  });

  it('tetap meneruskan galat lain apa adanya, karena itu memang informatif', async () => {
    const impl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.contoh.test');
    }) as unknown as typeof fetch;

    const hasil = await generateWorldText(TEKS, KUNCI, 'Judul', impl);

    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.detail).toContain('ENOTFOUND');
    }
  });
});
