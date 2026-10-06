/**
 * Mengambil daftar model yang dikenal sebuah provider.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA INI ADA
 * ---------------------------------------------------------------------------
 * Nama model di provider ("mistral-medium-latest") tidak dapat ditebak dan tidak
 * dapat diperiksa dari sini: setiap penyedia punya penamaannya sendiri, dan
 * salah ketik satu huruf menghasilkan model yang tersimpan rapi tetapi tidak
 * pernah dapat dipanggil. Satu-satunya sumber yang benar adalah provider itu
 * sendiri, lewat `GET <baseUrl>/models`.
 *
 * Hasilnya dipakai sebagai SARAN, bukan daftar tertutup: admin tetap boleh
 * mengetik nama yang belum muncul di daftar — penyedia sering menambah model
 * lebih cepat daripada halaman ini dimuat ulang, dan mengunci pilihan hanya
 * akan membuat panel menghalangi pekerjaan yang sah.
 *
 * ---------------------------------------------------------------------------
 * YANG TIDAK BOLEH TERJADI
 * ---------------------------------------------------------------------------
 * 1. KUNCI API TIDAK PERNAH KELUAR DARI PROSES INI. Ia dipakai menyusun header
 *    permintaan, dan tidak ikut ke pesan galat, ke log, atau ke jawaban JSON.
 *    Badan respons penyedia dipotong pendek justru karena ia kadang memantulkan
 *    potongan kunci yang dikirim.
 * 2. TIDAK BOLEH MENGGANTUNG. Panel yang menunggu penyedia yang tidak menjawab
 *    adalah panel yang tampak rusak. Batas waktunya pendek dan tetap.
 * 3. KEGAGALAN BUKAN GALAT. Penyedia yang tidak dapat dihubungi adalah keadaan
 *    biasa (kunci salah, jaringan tertutup, alamat keliru). Yang dikembalikan
 *    adalah sebab yang dapat dibaca admin, bukan lemparan yang mematikan halaman.
 *
 * Catatan tentang SSRF: alamat yang dipanggil datang dari `providers.base_url`,
 * yang hanya dapat diisi peran `owner`/`editor` di panel. Admin yang dapat
 * mengubahnya sudah memegang kendali atas konfigurasi server ini, jadi tidak ada
 * batas kepercayaan baru yang dilewati — tetapi alamat itu TIDAK boleh berasal
 * dari kiriman pengguna biasa, dan itu sebabnya fungsi ini hanya menerima
 * provider yang sudah tersimpan.
 */

import type { ApiType } from './providersRepository';

/** Batas waktu satu permintaan, dalam milidetik. */
export const MODELS_TIMEOUT_MS = 6_000;

/** Batas jumlah saran. Penyedia besar dapat mengembalikan ratusan nama. */
export const MAX_SUGGESTED_MODELS = 300;

/** Batas panjang badan respons yang disimpan untuk pesan galat. */
const ERROR_SNIPPET = 180;

export type ProviderModelsFailure =
  /** Provider ini belum punya kunci, jadi tidak ada yang dapat dikirim. */
  | 'no-key'
  /** Tidak terhubung: DNS gagal, waktu habis, atau koneksi ditolak. */
  | 'unreachable'
  /** Penyedia menolak kuncinya (401/403). */
  | 'unauthorized'
  /** Terhubung, tetapi jawabannya bukan daftar model yang dikenali. */
  | 'bad-response';

export type ProviderModelsResult =
  | {
      ok: true;
      ids: string[];
      /**
       * Batas konteks yang DIKABARKAN provider, per nama model.
       *
       * Hanya berisi model yang providernya benar-benar menyebutkan angkanya.
       * Banyak penyedia tidak menyebutkannya sama sekali — dan itu wajar, bukan
       * kegagalan. Yang penting: angka ini KABARAN, bukan hasil ukur. Halaman
       * memakainya sebagai titik awal yang boleh dikoreksi, dan tidak pernah
       * sebagai kebenaran.
       */
      contexts: Record<string, number>;
    }
  | { ok: false; reason: ProviderModelsFailure; detail: string };

/** Yang dibutuhkan fungsi ini — sengaja bukan seluruh baris provider. */
export type ProviderEndpoint = {
  baseUrl: string;
  apiType: ApiType;
};

/**
 * Menyusun header autentikasi menurut jenis API.
 *
 * Bedanya nyata dan tidak dapat disamakan: penyedia bergaya OpenAI menerima
 * `Authorization: Bearer`, sedangkan Anthropic memakai header `x-api-key` dan
 * menuntut header versi protokolnya. Mengirim bentuk yang salah menghasilkan
 * 401 yang membingungkan — kuncinya benar, caranya yang salah.
 */
function authHeaders(apiType: ApiType, apiKey: string): Record<string, string> {
  if (apiType === 'messages') {
    return {
      'x-api-key': apiKey,
      // Versi PROTOKOL, bukan versi model. Ini yang diminta Anthropic pada
      // setiap permintaan, dan bukan klaim tentang model apa pun.
      'anthropic-version': '2023-06-01',
    };
  }
  return { authorization: `Bearer ${apiKey}` };
}

/**
 * Mengambil daftar id model dari sebuah provider.
 *
 * `fetchImpl` dapat diganti pada pengujian — jaringan sungguhan tidak boleh
 * menjadi bagian dari uji yang harus lulus di mesin mana pun.
 */
export async function fetchProviderModels(
  endpoint: ProviderEndpoint,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderModelsResult> {
  if (apiKey.trim().length === 0) {
    return { ok: false, reason: 'no-key', detail: '' };
  }

  const url = `${endpoint.baseUrl.replace(/\/+$/, '')}/models`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...authHeaders(endpoint.apiType, apiKey) },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
  } catch (error) {
    // Termasuk waktu habis dan DNS gagal. Pesannya dipakai apa adanya karena
    // di sinilah admin paling butuh tahu APA yang salah.
    return {
      ok: false,
      reason: 'unreachable',
      detail: truncate(error instanceof Error ? error.message : String(error)),
    };
  }

  const body = await readBody(response);

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized', detail: detailOf(body, apiKey) };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: 'bad-response',
      detail: `HTTP ${String(response.status)} — ${detailOf(body, apiKey)}`,
    };
  }

  const parsed = parseModels(body);
  if (parsed === null) {
    return { ok: false, reason: 'bad-response', detail: detailOf(body, apiKey) };
  }
  return {
    ok: true,
    ids: parsed.ids.slice(0, MAX_SUGGESTED_MODELS),
    contexts: parsed.contexts,
  };
}

/**
 * Menyiapkan potongan badan respons untuk pesan galat.
 *
 * Kuncinya DIBUANG lebih dulu, dan itu bukan kehati-hatian berlebihan: sebagian
 * penyedia memantulkan potongan permintaan di badan galatnya, dan badan itu
 * ditampilkan di halaman — yang dapat dibaca peran `support`. Tanpa penyaringan
 * ini, kesalahan konfigurasi kecil berubah menjadi kebocoran rahasia ke layar.
 */
function detailOf(body: string, apiKey: string): string {
  return truncate(apiKey.length > 0 ? body.split(apiKey).join('***') : body);
}

/**
 * Mengambil badan respons sebagai teks.
 *
 * Dibaca sebagai teks, bukan `.json()`, supaya respons yang bukan JSON tetap
 * dapat ditampilkan potongannya — dan justru itu yang paling berguna ketika
 * alamatnya keliru (mis. menunjuk halaman HTML, bukan API).
 */
async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Membaca daftar model dari bentuk jawaban yang lazim.
 *
 * Tiga bentuk diterima karena ketiganya nyata: `{data:[{id}]}` (OpenAI dan
 * Anthropic), `{models:[{name}]}`, dan larik id langsung. Mengenali ketiganya
 * lebih murah daripada memaksa admin memilih "bentuk jawaban" di formulir.
 *
 * Mengembalikan `null` bila tidak ada satu pun yang cocok — itu dibedakan dari
 * "daftar kosong", karena provider yang benar-benar tidak punya model adalah
 * hal yang berbeda dari jawaban yang tidak kita pahami.
 */
function parseModels(body: string): { ids: string[]; contexts: Record<string, number> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const collected = new Set<string>();
  const contexts: Record<string, number> = {};

  const absorb = (item: unknown): void => {
    const id = typeof item === 'string' ? item.trim() : pickId(item);
    if (!id) {
      return;
    }
    collected.add(id);

    const context = pickContext(item);
    if (context !== null) {
      contexts[id] = context;
    }
  };

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      absorb(item);
    }
    return { ids: [...collected], contexts };
  }

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    const list = Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.models)
        ? record.models
        : null;
    if (!list) {
      return null;
    }
    for (const item of list) {
      absorb(item);
    }
    return { ids: [...collected], contexts };
  }

  return null;
}

/** Mengambil nama model dari satu entri, apa pun nama bidangnya. */
function pickId(item: unknown): string | null {
  if (typeof item === 'string') {
    return item.trim().length > 0 ? item.trim() : null;
  }
  if (!item || typeof item !== 'object') {
    return null;
  }
  const record = item as Record<string, unknown>;
  for (const key of ['id', 'name', 'model']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Mengambil batas konteks bila provider menyebutkannya.
 *
 * Empat nama bidang diterima karena tidak ada satu pun yang standar: OpenAI dan
 * Anthropic tidak menyebutkannya sama sekali, sedangkan gateway seperti
 * OpenRouter memakai `context_length` — kadang di dalam `top_provider`. Yang
 * tidak menyebutkan cukup dilewati; memaksa menebak akan mengisi formulir
 * dengan angka karangan, dan itu persis yang tidak boleh terjadi.
 */
function pickContext(item: unknown): number | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const record = item as Record<string, unknown>;

  const nested = record.top_provider;
  const sources: Record<string, unknown>[] = [record];
  if (nested && typeof nested === 'object') {
    sources.push(nested as Record<string, unknown>);
  }

  for (const source of sources) {
    for (const key of ['context_length', 'context_window', 'max_input_tokens', 'max_context_tokens']) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }
  }
  return null;
}

function truncate(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > ERROR_SNIPPET ? `${collapsed.slice(0, ERROR_SNIPPET)}…` : collapsed;
}
