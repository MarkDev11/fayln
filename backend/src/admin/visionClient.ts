/**
 * Meminta model visi menamai dan menerangkan satu gambar latar.
 *
 * ---------------------------------------------------------------------------
 * INI PANGGILAN MODEL PERTAMA YANG BENAR-BENAR KELUAR DARI PANEL
 * ---------------------------------------------------------------------------
 * Sampai sekarang mesin cerita masih simulator deterministik: tidak ada satu pun
 * permintaan yang menuju penyedia model. Fungsi ini yang pertama, dan karena itu
 * ia memikul aturan-aturan yang sebelumnya hanya teori:
 *
 *   1. KUNCI API TIDAK PERNAH KELUAR DARI PROSES INI. Ia dipakai menyusun
 *      header, dan tidak ikut ke pesan galat, ke log, atau ke jawaban JSON.
 *      Badan respons penyedia dipotong DAN disaring — sebagian penyedia
 *      memantulkan potongan permintaan di badan galatnya.
 *   2. TIDAK BOLEH MENGGANTUNG. Panel yang menunggu penyedia yang tidak menjawab
 *      adalah panel yang tampak rusak.
 *   3. KEGAGALAN BUKAN GALAT. Penyedia yang menolak, kehabisan kuota, atau
 *      menjawab dengan bentuk lain adalah keadaan biasa. Yang dikembalikan
 *      adalah sebab yang dapat dibaca admin.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA PROMPTNYA BAHASA INGGRIS, HASILNYA BAHASA INDONESIA
 * ---------------------------------------------------------------------------
 * Instruksi berbahasa Inggris lebih jarang disalahpahami model, terutama pada
 * model kecil — dan tugas ini menuntut format keluaran yang ketat. Tetapi nama
 * dan keterangan yang dihasilkan DIPAKAI PEMAIN, jadi keduanya harus bahasa
 * Indonesia. Instruksinya berbahasa Inggris; keluarannya bahasa Indonesia.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA MODEL TIDAK DIPAKSA DI SINI
 * ---------------------------------------------------------------------------
 * Model dan provider dipilih admin di panel, bukan dipatok di kode. Panel tidak
 * dapat memeriksa apakah sebuah model benar-benar dapat melihat gambar — itu
 * pernyataan penyedia, bukan fakta yang dapat diuji dari sini. Karena itu
 * kegagalan "model ini tidak menerima gambar" harus muncul sebagai pesan yang
 * JELAS, bukan sebagai teks yang tampak seperti nama lokasi.
 */

import type { ApiType } from './providersRepository';

/** Batas waktu satu permintaan, dalam milidetik. */
export const VISION_TIMEOUT_MS = 45_000;

/** Batas token jawaban. Cukup untuk dua bidang pendek, dan diminta sebagian penyedia. */
const MAX_ANSWER_TOKENS = 400;

/** Batas panjang badan respons yang disimpan untuk pesan galat. */
const ERROR_SNIPPET = 180;

/** Batas panjang nama dan keterangan yang diterima dari model. */
export const MAX_VISION_NAME = 120;
export const MAX_VISION_DESCRIPTION = 600;

/**
 * System prompt.
 *
 * Sengaja ketat, dan sengaja memberi jalan keluar yang jujur. Tanpa aturan
 * terakhir ("balas kosong bila gambarnya tidak dapat dipakai"), model yang
 * menerima gambar aneh akan MENGARANG nama — dan nama karangan yang masuk ke
 * master lebih sulit ditemukan daripada kegagalan yang terlihat.
 */
export const VISION_SYSTEM_PROMPT = [
  'You catalogue background images for a visual-novel platform.',
  'Each image is one location that writers will later use as a scene setting.',
  '',
  'Reply with ONLY a JSON object. No markdown, no code fences, no commentary:',
  '',
  '{"name": "...", "description": "..."}',
  '',
  '"name" is the name of the PLACE, written in Indonesian, 2 to 5 words,',
  'in Title Case. Name the place, not the picture: "Hutan Pinus Berkabut" is',
  'right, "A foggy forest with tall trees" is wrong.',
  '',
  '"description" is one or two sentences in Indonesian describing how the place',
  'looks and feels, so a writer can set a scene there.',
  '',
  'Rules:',
  '- Both fields are shown to players. Write them in Indonesian.',
  '- Describe only what is visible. Never invent history, characters, events,',
  '  or the names of people.',
  '- Do not mention that this is an image, a photo, a screenshot, or AI-made.',
  '- If the image cannot be used as a place (blank, text only, a portrait, or',
  '  something that is not a location at all), reply with empty strings:',
  '  {"name": "", "description": ""}. Do not guess.',
].join('\n');

export type VisionFailure =
  /** Model menjawab, tetapi menolak menamai gambarnya. */
  | 'declined'
  /** Penyedia menolak kuncinya, atau kuotanya habis. */
  | 'unauthorized'
  /** Tidak terhubung: DNS gagal, waktu habis, atau koneksi ditolak. */
  | 'unreachable'
  /** Terhubung, tetapi jawabannya bukan JSON yang kita minta. */
  | 'bad-response'
  /** Jenis API provider ini belum didukung untuk tugas visi. */
  | 'unsupported-api-type';

export type VisionResult =
  | { ok: true; name: string; description: string }
  | { ok: false; reason: VisionFailure; detail: string };

export type VisionRequest = {
  baseUrl: string;
  apiType: ApiType;
  /** Nama model di sisi penyedia, mis. "gpt-4o-mini". */
  modelKey: string;
  /** Isi gambar, sudah dalam base64 tanpa awalan data URL. */
  imageBase64: string;
  /** Jenis isi gambar, mis. "image/webp". */
  contentType: string;
};

/**
 * Menyusun badan permintaan menurut jenis API.
 *
 * Dua bentuk didukung, dan bedanya nyata: penyedia bergaya OpenAI menaruh
 * gambar sebagai bagian `image_url` berisi data URL, sedangkan Anthropic
 * memakai blok `image` dengan `source.base64` dan `system` di tingkat atas.
 * Mengirim bentuk yang salah menghasilkan 400 yang membingungkan.
 */
function buildRequest(request: VisionRequest): { path: string; body: unknown } {
  if (request.apiType === 'messages') {
    return {
      path: '/messages',
      body: {
        model: request.modelKey,
        max_tokens: MAX_ANSWER_TOKENS,
        system: VISION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: request.contentType,
                  data: request.imageBase64,
                },
              },
              { type: 'text', text: 'Catalogue this location.' },
            ],
          },
        ],
      },
    };
  }

  return {
    path: '/chat/completions',
    body: {
      model: request.modelKey,
      max_tokens: MAX_ANSWER_TOKENS,
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Catalogue this location.' },
            {
              type: 'image_url',
              image_url: { url: `data:${request.contentType};base64,${request.imageBase64}` },
            },
          ],
        },
      ],
    },
  };
}

/** Menyusun header autentikasi menurut jenis API. */
function authHeaders(apiType: ApiType, apiKey: string): Record<string, string> {
  if (apiType === 'messages') {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  }
  return { authorization: `Bearer ${apiKey}` };
}

/**
 * Meminta nama dan keterangan untuk satu gambar.
 *
 * `fetchImpl` dapat diganti pada pengujian — jaringan sungguhan tidak boleh
 * menjadi bagian dari uji yang harus lulus di mesin mana pun.
 */
export async function describeLocationImage(
  request: VisionRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VisionResult> {
  if (request.apiType === 'responses') {
    // Bentuk ini belum ditangani, dan mengirim permintaan dengan bentuk yang
    // salah lebih buruk daripada mengatakannya: admin akan melihat galat
    // penyedia yang tidak menjelaskan apa pun tentang pilihan mereka.
    return {
      ok: false,
      reason: 'unsupported-api-type',
      detail: 'Jenis API "responses" belum didukung untuk tugas visi. Pilih Chat Completions atau Messages.',
    };
  }

  const { path, body } = buildRequest(request);
  const url = `${request.baseUrl.replace(/\/+$/, '')}${path}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...authHeaders(request.apiType, apiKey),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: detailOf(error instanceof Error ? error.message : String(error), apiKey),
    };
  }

  const raw = await readBody(response);

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized', detail: detailOf(raw, apiKey) };
  }
  if (response.status === 429) {
    return {
      ok: false,
      reason: 'unauthorized',
      detail: `Kuota penyedia habis atau terlalu banyak permintaan. ${detailOf(raw, apiKey)}`,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: 'bad-response',
      detail: `HTTP ${String(response.status)} — ${detailOf(raw, apiKey)}`,
    };
  }

  const text = extractAnswerText(raw);
  if (text === null) {
    return { ok: false, reason: 'bad-response', detail: detailOf(raw, apiKey) };
  }

  const parsed = extractNameAndDescription(text);
  if (parsed === null) {
    // Model menjawab, tetapi tidak dengan JSON yang kita minta. Isi jawabannya
    // ditampilkan supaya admin dapat melihat apa yang sebenarnya dikatakannya.
    return { ok: false, reason: 'bad-response', detail: detailOf(text, apiKey) };
  }

  if (parsed.name.length === 0) {
    // Model memakai jalan keluar yang memang disediakan prompt-nya. Itu jawaban
    // yang sah, bukan kegagalan teknis — dan menampilkannya sebagai kegagalan
    // teknis akan menyesatkan.
    return {
      ok: false,
      reason: 'declined',
      detail: 'Model menilai gambar ini tidak dapat dipakai sebagai lokasi.',
    };
  }

  return { ok: true, name: parsed.name, description: parsed.description };
}

/**
 * Mengambil teks jawaban dari bentuk respons yang lazim.
 *
 * Dua bentuk nyata: `choices[0].message.content` (bergaya OpenAI) dan
 * `content[0].text` (Anthropic). Isi `content` juga dapat berupa larik blok,
 * jadi keduanya ditangani.
 */
function extractAnswerText(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const record = parsed as Record<string, unknown>;

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    const fromChoice = flattenContent(content);
    if (fromChoice !== null) {
      return fromChoice;
    }
  }

  const fromContent = flattenContent(record.content);
  return fromContent;
}

/** Mengubah `content` menjadi teks, apa pun bentuknya. */
function flattenContent(content: unknown): string | null {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part);
      continue;
    }
    if (part && typeof part === 'object') {
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string') {
        parts.push(text);
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Membaca `name` dan `description` dari jawaban model.
 *
 * Toleran dengan sengaja: model kecil sering membungkus JSON-nya dengan pagar
 * kode atau menambahkan kalimat pengantar, walaupun promptnya sudah melarang.
 * Menolak jawaban karena itu berarti membuang pekerjaan yang sebenarnya benar —
 * jadi yang dicari adalah objek JSON PERTAMA di dalam teks, bukan teks itu
 * sendiri.
 */
function extractNameAndDescription(text: string): { name: string; description: string } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const description =
    typeof record.description === 'string' ? record.description.trim() : '';

  return {
    name: clamp(name, MAX_VISION_NAME),
    description: clamp(description, MAX_VISION_DESCRIPTION),
  };
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Menyiapkan potongan badan respons untuk pesan galat.
 *
 * Kuncinya dibuang lebih dulu. Sebagian penyedia memantulkan potongan permintaan
 * di badan galatnya, dan badan itu ditampilkan di halaman — yang dapat dibaca
 * peran `support`. Tanpa penyaringan ini, kesalahan konfigurasi kecil berubah
 * menjadi kebocoran rahasia ke layar.
 */
function detailOf(value: string, apiKey: string): string {
  const tanpaKunci = apiKey.length > 0 ? value.split(apiKey).join('***') : value;
  const rapat = tanpaKunci.replace(/\s+/g, ' ').trim();
  return rapat.length > ERROR_SNIPPET ? `${rapat.slice(0, ERROR_SNIPPET)}…` : rapat;
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
