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

import type { ApiType, ImagePart } from './providersRepository';

/** Batas waktu satu permintaan, dalam milidetik. */
export const VISION_TIMEOUT_MS = 45_000;

/**
 * Batas token jawaban.
 *
 * Jauh lebih besar daripada panjang jawabannya (dua bidang pendek), dan itu
 * disengaja. Pada 6 Oktober 2026 batas 400 token membuat SEMUA jawaban terpotong
 * di tengah penalaran: modelnya menjelaskan gambar dengan panjang lebar lalu
 * kehabisan jatah sebelum sempat menulis JSON-nya. Gejalanya menyesatkan — yang
 * terlihat seperti "model tidak mau menjawab dengan format yang benar" sebenarnya
 * hanya kehabisan ruang.
 *
 * Model yang bernalar memakai ruang itu untuk berpikir; jawabannya sendiri hanya
 * puluhan token. Menyediakan ruang jauh lebih murah daripada menerima jawaban
 * terpotong.
 */
const MAX_ANSWER_TOKENS = 2_000;

/** Batas panjang badan respons yang disimpan untuk pesan galat. */
const ERROR_SNIPPET = 400;

/** Batas panjang nama dan keterangan yang diterima dari model. */
export const MAX_VISION_NAME = 120;
export const MAX_VISION_DESCRIPTION = 600;
/** Batas panjang alasan yang disebutkan model saat ia tidak dapat menamai. */
export const MAX_VISION_REASON = 300;
/**
 * Batas panjang keterangan potret ("ekspresi, pakaian, pose").
 *
 * Jauh lebih pendek daripada keterangan lokasi dengan sengaja: bentuknya tiga
 * bagian pendek, dan label yang panjangnya ratusan huruf berarti modelnya tidak
 * mengikuti bentuk yang diminta.
 */
export const MAX_EXPRESSION_LABEL = 160;

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
  '- If you cannot name the place, do not guess. Reply with the same shape plus',
  '  a reason, and say plainly what you see or do not see:',
  '  {"name": "", "description": "", "reason": "<one short sentence, in Indonesian>"}',
  '  For example, if no image reached you at all, the reason must say that.',
  '',
  'You may think first if you need to, but the LAST thing you write must be the',
  'JSON object on its own, with nothing after it. Do not let your reasoning take',
  'the place of the answer.',
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
  /**
   * Bagaimana gambar dibungkus pada pesan.
   *
   * "OpenAI-compatible" tidak seragam dalam hal ini, dan salah pilih TIDAK
   * menghasilkan galat — penyedia membuang bagian yang bentuknya tidak dikenali,
   * lalu modelnya menjawab "tidak ada gambar yang diberikan". Itu terjadi pada
   * 6 Oktober 2026 dan menghabiskan 20 gambar sekaligus.
   */
  imagePart: ImagePart;
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
function buildRequest(request: VisionRequest, prompt: string): { path: string; body: unknown } {
  if (request.apiType === 'messages') {
    return {
      path: '/messages',
      body: {
        model: request.modelKey,
        max_tokens: MAX_ANSWER_TOKENS,
        system: prompt,
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

  const dataUrl = `data:${request.contentType};base64,${request.imageBase64}`;

  return {
    path: '/chat/completions',
    body: {
      model: request.modelKey,
      max_tokens: MAX_ANSWER_TOKENS,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Catalogue this location.' },
            {
              type: 'image_url',
              /*
               * Bedanya hanya satu tingkat pembungkusan, dan itulah seluruh
               * sebab kegagalan 6 Oktober: OpenAI (dan mayoritas gateway)
               * menuntut objek ber-`url`, sedangkan Mistral menuntut teksnya
               * langsung. Yang salah dibuang diam-diam oleh penyedia.
               */
              image_url: request.imagePart === 'string' ? dataUrl : { url: dataUrl },
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
/**
 * Mengirim satu gambar beserta prompt ke model, dan mengembalikan teksnya.
 *
 * Dipisahkan dari penguraian jawaban karena ada DUA tugas yang memakainya —
 * menamai lokasi dan menamai potret karakter — dan yang berbeda di antara
 * keduanya hanya prompt serta bentuk jawabannya. Pengangkutannya sama persis:
 * kunci API, batas waktu, bentuk lampiran gambar, dan penerjemahan galat HTTP.
 *
 * Menggandakan bagian ini berarti menggandakan pula seluruh pelajaran mahal yang
 * sudah tertanam di dalamnya (kunci yang tidak boleh bocor, terpotong vs bukan
 * JSON, bentuk lampiran per penyedia).
 */
async function sendToProvider(
  request: { baseUrl: string; apiType: ApiType },
  path: string,
  body: unknown,
  apiKey: string,
  fetchImpl: typeof fetch,
  tugas: { nama: string; timeoutMs: number; saranWaktuHabis: string },
): Promise<{ ok: true; text: string; raw: string } | { ok: false; reason: VisionFailure; detail: string }> {
  if (request.apiType === 'responses') {
    // Bentuk ini belum ditangani, dan mengirim permintaan dengan bentuk yang
    // salah lebih buruk daripada mengatakannya: admin akan melihat galat
    // penyedia yang tidak menjelaskan apa pun tentang pilihan mereka.
    return {
      ok: false,
      reason: 'unsupported-api-type',
      detail: `Jenis API "responses" belum didukung untuk ${tugas.nama}. Pilih Chat Completions atau Messages.`,
    };
  }

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
      signal: AbortSignal.timeout(tugas.timeoutMs),
    });
  } catch (error) {
    /*
     * WAKTU HABIS DIJELASKAN, bukan diteruskan mentah.
     *
     * Pesan aslinya — "The operation was aborted due to timeout" — adalah teks
     * Node dalam bahasa Inggris. Admin yang membacanya tidak tahu bahwa yang
     * terjadi adalah modelnya belum selesai, berapa lama ia ditunggu, atau apa
     * yang harus dilakukan. Yang ia lihat hanya kalimat yang tidak masuk akal di
     * panel berbahasa Indonesia.
     */
    const habisWaktu = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      reason: 'unreachable',
      detail: habisWaktu
        ? `Model belum selesai dalam ${String(Math.round(tugas.timeoutMs / 1000))} detik, ` +
          `jadi permintaannya dihentikan. ${tugas.saranWaktuHabis}`
        : detailOf(error instanceof Error ? error.message : String(error), apiKey),
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
    // Tidak ada teks yang dapat dibaca sama sekali. Badan responsnya ditampilkan
    // karena hanya itu yang tersisa untuk dilihat — dan bentuk jawaban yang tidak
    // kita kenali justru hal yang perlu diketahui admin.
    return {
      ok: false,
      reason: 'bad-response',
      detail: `Jawaban model tidak memuat teks yang dapat dibaca. Isinya: ${detailOf(raw, apiKey)}`,
    };
  }

  return { ok: true, text, raw };
}

/**
 * Menyusun permintaan VISI, lalu mengirimnya.
 *
 * Tipis dengan sengaja: seluruh pengangkutannya ada di `sendToProvider`, dan
 * yang tersisa di sini hanya bagian yang memang khusus gambar.
 */
async function callVision(
  request: VisionRequest,
  apiKey: string,
  prompt: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; text: string; raw: string } | { ok: false; reason: VisionFailure; detail: string }> {
  const { path, body } = buildRequest(request, prompt);
  return sendToProvider(request, path, body, apiKey, fetchImpl, {
    nama: 'tugas visi',
    timeoutMs: VISION_TIMEOUT_MS,
    saranWaktuHabis: 'Coba lagi, atau pilih model yang lebih cepat.',
  });
}

/**
 * Menerjemahkan jawaban yang tidak berbentuk JSON menjadi pesan yang menjelaskan.
 *
 * Terpotong atau tidak, itu DUA masalah yang berbeda dengan obat yang berbeda:
 * yang satu menaikkan batas token, yang satu memperbaiki prompt. Menyebut
 * keduanya dengan pesan yang sama akan membuat admin mencoba perbaikan yang salah.
 */
function explainUnparseable(text: string, raw: string, apiKey: string): string {
  if (wasTruncated(raw)) {
    return `Jawaban model terpotong sebelum sempat menulis JSON — batas ${String(MAX_ANSWER_TOKENS)} token habis dipakai bernalar. Isinya: ${detailOf(text, apiKey)}`;
  }
  return `Model menjawab dengan kalimat, bukan JSON. Isinya: ${detailOf(text, apiKey)}`;
}

export async function describeLocationImage(
  request: VisionRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VisionResult> {
  const call = await callVision(request, apiKey, VISION_SYSTEM_PROMPT, fetchImpl);
  if (!call.ok) {
    return call;
  }

  const { text, raw } = call;

  const parsed = extractNameAndDescription(text);
  if (parsed === null) {
    return { ok: false, reason: 'bad-response', detail: explainUnparseable(text, raw, apiKey) };
  }

  if (parsed.name.length === 0) {
    /*
     * Model memakai jalan keluar yang memang disediakan prompt-nya.
     *
     * Yang ditampilkan adalah ALASAN YANG DIKATAKAN MODEL, bukan kesimpulan yang
     * saya tarik. Bedanya menentukan: "model menilai gambar ini tidak dapat
     * dipakai" adalah tebakan saya, dan ketika gambarnya ternyata tidak pernah
     * sampai ke modelnya, tebakan itu menyesatkan ke arah yang salah sama sekali
     * — admin akan mengganti fotonya berulang kali tanpa hasil. Kalimat model
     * sendiri ("tidak ada gambar yang saya terima") langsung menunjukkan
     * masalahnya.
     */
    const alasan = parsed.reason.length > 0 ? parsed.reason : '';
    return {
      ok: false,
      reason: 'declined',
      detail:
        alasan.length > 0
          ? `Model tidak memberi nama. Alasannya: ${detailOf(alasan, apiKey)}`
          : `Model tidak memberi nama, dan tidak menyebut alasannya. Jawabannya: ${detailOf(text, apiKey)}`,
    };
  }

  return { ok: true, name: parsed.name, description: parsed.description };
}

/* ------------------------------------------------------------------ */
/* Potret karakter                                                     */
/* ------------------------------------------------------------------ */

/**
 * System prompt untuk potret karakter.
 *
 * Berbeda dari prompt lokasi dalam satu hal yang menentukan: jawabannya BUKAN
 * kalimat bebas, melainkan TIGA bagian bernama yang dipisah koma —
 * ekspresi, pakaian, pose. Urutannya wajib, karena hasilnya dibaca mesin, bukan
 * hanya dibaca manusia.
 */
export const PORTRAIT_SYSTEM_PROMPT = [
  'You catalogue character portraits for a visual-novel platform.',
  'Each image is one portrait of one character: a face and body, drawn or',
  'rendered, on a plain or simple background.',
  '',
  'Reply with ONLY a JSON object. No markdown, no code fences, no commentary:',
  '',
  '{"label": "..."}',
  '',
  '"label" is EXACTLY THREE parts separated by a comma and a space, in this',
  'order, all in Indonesian:',
  '',
  '  1. the expression  — how the face looks, e.g. "senyum", "malu", "marah"',
  '  2. the clothing    — what the character wears, e.g. "pakaian kantor"',
  '  3. the pose        — how the body is held, e.g. "normal", "menutup tubuh"',
  '',
  'Each part is ONE to THREE words. Lowercase. No full stop at the end.',
  'Example of a correct label: "senyum, pakaian kantor, normal"',
  'Another: "malu, pakaian dalam, menutup tubuh"',
  '',
  'Rules:',
  '- Exactly three parts. Never two, never four, never a sentence.',
  '- Describe only what is visible. Never invent a name, a personality, or a',
  '  story for the character.',
  '- Do not mention that this is an image, a drawing, or AI-made.',
  '- If you cannot see a portrait, do not guess. Reply with an empty label and',
  '  say plainly what you see or do not see:',
  '  {"label": "", "reason": "<one short sentence, in Indonesian>"}',
  '',
  'You may think first if you need to, but the LAST thing you write must be the',
  'JSON object on its own, with nothing after it.',
].join('\n');

export type PortraitResult =
  | { ok: true; label: string }
  | { ok: false; reason: VisionFailure; detail: string };

/**
 * Meminta label `ekspresi, pakaian, pose` untuk satu potret.
 *
 * Ketiga bagiannya DIPERIKSA jumlahnya. Model yang menjawab dua atau empat
 * bagian menghasilkan label yang tampak wajar tetapi tidak dapat dibaca mesin —
 * dan itu lebih buruk daripada gagal, karena tidak ada yang menyadarinya sampai
 * mesin cerita memilih ekspresi yang salah.
 */
export async function describeCharacterPortrait(
  request: VisionRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PortraitResult> {
  const call = await callVision(request, apiKey, PORTRAIT_SYSTEM_PROMPT, fetchImpl);
  if (!call.ok) {
    return call;
  }

  const { text, raw } = call;

  const parsed = extractLabel(text);
  if (parsed === null) {
    return { ok: false, reason: 'bad-response', detail: explainUnparseable(text, raw, apiKey) };
  }

  if (parsed.label.length === 0) {
    return {
      ok: false,
      reason: 'declined',
      detail:
        parsed.reason.length > 0
          ? `Model tidak memberi keterangan. Alasannya: ${detailOf(parsed.reason, apiKey)}`
          : `Model tidak memberi keterangan, dan tidak menyebut alasannya. Jawabannya: ${detailOf(text, apiKey)}`,
    };
  }

  if (parsed.parts !== 3) {
    return {
      ok: false,
      reason: 'bad-response',
      detail: `Keterangan harus tiga bagian (ekspresi, pakaian, pose) tetapi model menulis ${String(parsed.parts)}. Jawabannya: ${detailOf(parsed.label, apiKey)}`,
    };
  }

  return { ok: true, label: parsed.label };
}

/* ------------------------------------------------------------------ */
/* Teks karakter: background dan soul                                  */
/* ------------------------------------------------------------------ */

/**
 * Aturan yang dipakai BERSAMA oleh background dan soul karakter.
 *
 * ---------------------------------------------------------------------------
 * DUA JENIS TOKEN, DAN BEDANYA PENTING
 * ---------------------------------------------------------------------------
 * `@user` adalah NAMA PEMAIN. Ia ditulis APA ADANYA dan diganti sistem saat
 * cerita berjalan. Model tidak boleh menebak namanya, dan tidak boleh
 * menggantinya dengan "kamu" — dua dunia yang dimainkan orang berbeda harus tetap
 * bisa memakai teks yang sama.
 *
 * `@<nama>` adalah KARAKTER LAIN DI DUNIA INI. Pemilik produk memintanya supaya
 * model tahu bahwa `@rina` menunjuk orang yang memang ada di dunia itu, bukan
 * nama yang dikarang. Tanpa daftarnya, model akan mengira `@rina` salah ketik
 * atau nama asing — dan menuliskannya sebagai "seseorang" atau mengabaikannya.
 *
 * Karena itu daftar nama yang SAH ikut dikirim ke model. Nama di luar daftar itu
 * BUKAN token, dan model dilarang memperlakukannya sebagai karakter.
 */
const ATURAN_KARAKTER = [
  '1. @user is the NAME OF THE PLAYER. Write it EXACTLY as "@user", never replace',
  '   it with a name, never with "kamu", never with "you". The system substitutes',
  '   the real player name when the story runs.',
  '2. "@" followed by a name is ANOTHER CHARACTER IN THIS WORLD — an NPC that',
  '   already exists here. Write those tokens EXACTLY as given, e.g. "@rina".',
  '   The system substitutes that character\'s name in this world. NEVER invent a',
  '   new @token, and NEVER use one that is not in the list you were given.',
  '3. Any OTHER person must be referred to by their ROLE or relationship to',
  '   @user: "bosmu", "sahabatmu", "mantan pacarmu". Never write a bare name that',
  '   was not given to you as a @token.',
  '4. Write in Indonesian, second person, addressing the player as @user.',
  '5. Do not mention that this is a game, a novel, or that you are an AI.',
  '   Write as if the situation were real.',
  '6. No closing line like "pilihan ada di tanganmu".',
].join('\n');

/**
 * System prompt untuk background dan soul karakter.
 *
 * Dua tugas yang berbeda, digabung di satu fungsi karena aturannya sama persis —
 * memisahkannya berarti menggandakan aturan @user, dan satu perbaikan nanti harus
 * dilakukan dua kali.
 *
 * `background` adalah LATAR BELAKANG: apa yang sudah terjadi antara tokoh ini dan
 * pemain. `soul` adalah KEPRIBADIAN: apa yang mendorongnya, apa yang ditakutinya,
 * bagaimana ia bicara.
 */
export function characterSystemPrompt(kind: 'background' | 'soul'): string {
  const tugas =
    kind === 'background'
      ? [
          'You are given one short hint about a character in a visual novel.',
          'EXPAND that hint into a full background: what happened between this',
          'character and @user, when, and why it still matters now.',
          '',
          'About 150 to 250 words. Concrete and specific — shared history, small',
          'details, unresolved tension. Do not invent a new relationship that',
          'contradicts the hint; build on it.',
        ].join('\n')
      : [
          'You are given a character and a short hint about them.',
          'Write their SOUL: what drives them, what they fear, how they speak,',
          'what they hide, and where they contradict themselves.',
          '',
          'About 150 to 250 words. Written as DESCRIPTION, not as dialogue and not',
          'as a list of adjectives — a paragraph that lets someone portray this',
          'person consistently.',
          '',
          'Do NOT restate the background. The soul is WHO they are; the background',
          'is WHAT happened. Keep them separate.',
        ].join('\n');

  return [
    tugas,
    '',
    'RULES — these matter more than style:',
    '',
    ATURAN_KARAKTER,
    '',
    'Reply with ONLY a JSON object. No markdown, no code fences, no commentary:',
    '',
    '  {"text": "<the text itself, with \\n for line breaks>"}',
    '',
    'Write the JSON object DIRECTLY. Do not explain your reasoning, do not restate',
    'these instructions, and do not describe what you are about to write.',
  ].join('\n');
}

export type CharacterTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: VisionFailure; detail: string };

/** Masukan untuk pembuatan teks karakter. */
export type CharacterTextInput = {
  kind: 'background' | 'soul';
  /** Nama tokoh pada dunia ini — boleh berbeda dari master. */
  name: string;
  /** Peran (fungsi) tokoh dalam cerita ini, mis. "bosmu". */
  role: string;
  /**
   * Yang diketik admin. Ia WAJIB ada: model memperinci apa yang ditulis admin,
   * bukan mengarang dari nol. Tanpa ini hasilnya akan melenceng dari niatnya.
   */
  seed: string;
  /** Judul dunia, supaya hasilnya tidak bertolak belakang dengan ceritanya. */
  worldTitle: string;
  /**
   * Nama karakter lain yang SUDAH ada di dunia ini.
   *
   * Dikirim ke model supaya ia tahu `@rina` menunjuk orang yang memang ada di
   * dunia itu, bukan nama yang dikarang. Tanpa daftarnya, `@rina` terlihat
   * seperti salah ketik.
   */
  others: string[];
};

/**
 * Memperinci background atau soul karakter dari yang diketik admin.
 *
 * Berbeda dari tugas sinopsis/premis dalam satu hal yang menentukan: hasilnya
 * TEKS BEBAS, bukan JSON. Karena itu tidak ada penguraian objek — yang diambil
 * adalah seluruh jawaban apa adanya, setelah dibersihkan dari sampah yang sering
 * menyertainya (pagar kode, judul, tanda kutip pembungkus).
 */
export async function generateCharacterText(
  request: { baseUrl: string; apiType: ApiType; modelKey: string },
  apiKey: string,
  input: CharacterTextInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CharacterTextResult> {
  const daftarNpc =
    input.others.length > 0
      ? [
          '',
          'Karakter lain yang SUDAH ada di dunia ini — hanya nama-nama inilah yang',
          'sah ditulis sebagai token @nama:',
          ...input.others.map((nama) => `  @${nama.toLowerCase()}`),
        ].join('\n')
      : '';

  const { path, body } = buildTextRequest(
    request,
    characterSystemPrompt(input.kind),
    [
      `Karakter: ${input.name}`,
      input.role.trim().length > 0 ? `Perannya dalam cerita: ${input.role}` : '',
      input.worldTitle.trim().length > 0 ? `Dunia: ${input.worldTitle}` : '',
      daftarNpc,
      '',
      `Yang diketik admin — perinci ini: ${input.seed}`,
    ]
      .filter((baris) => baris.length > 0)
      .join('\n'),
  );

  const call = await sendToProvider(request, path, body, apiKey, fetchImpl, {
    nama: 'tugas teks karakter',
    timeoutMs: TEXT_TIMEOUT_MS,
    saranWaktuHabis:
      'Menulis 150 sampai 250 kata memang lama. Coba lagi, atau pilih model yang lebih cepat.',
  });

  if (!call.ok) {
    return call;
  }

  /*
   * Jawabannya JSON, BUKAN teks bebas — dan itu pelajaran dari produksi.
   *
   * Bentuk pertamanya meminta teks bebas, dan promptnya menyuruh "berpikir dulu
   * bila perlu". Untuk model tanpa saluran penalaran terpisah, pikiran itu
   * MENDARAT DI DALAM JAWABANNYA: yang tersimpan di dunia adalah "Ok, user wants
   * me to expand a hint into a full background..." beserta seluruh coretannya,
   * bukan latar belakangnya. Terjadi pada 8 Oktober 2026.
   *
   * Membersihkannya dari teks bebas tidak dapat diandalkan — tidak ada batas yang
   * dapat ditemukan mesin antara penalaran dan hasilnya. JSON menyediakan batas
   * itu: `lastJsonObject` mengambil objek TERAKHIR yang punya kunci `text`,
   * sehingga seluruh kalimat pengantar sebelumnya diabaikan tanpa perlu dikenali.
   */
  const record = lastJsonObject(call.text, 'text');
  const isi = record ? record.text : null;

  if (typeof isi !== 'string' || isi.trim().length === 0) {
    return {
      ok: false,
      reason: 'bad-response',
      detail: `Model tidak mengembalikan objek JSON berisi "text". Jawabannya: ${detailOf(call.text, apiKey)}`,
    };
  }

  return { ok: true, text: clamp(isi.trim(), MAX_WORLD_TEXT) };
}


/* ------------------------------------------------------------------ */
/* Teks dunia: sinopsis dan premis dari judul                          */
/* ------------------------------------------------------------------ */

/**
 * Batas token untuk tugas TEKS.
 *
 * Jauh lebih besar daripada tugas visi, dan itu bukan kelonggaran: yang diminta
 * di sini adalah sekitar SERIBU kata keluaran (500 untuk sinopsis, 500 untuk
 * premis). Dengan batas 2.000 token, model yang bernalar akan menghabiskan
 * jatahnya untuk berpikir dan jawabannya terpotong di tengah — persis kegagalan
 * yang sudah pernah terjadi pada tugas lokasi.
 *
 * DINAIKKAN dari 8.000 pada 8 Oktober 2026, setelah model yang sama menghabiskan
 * SELURUH 8.000 token untuk bernalar tentang satu latar belakang karakter, dan
 * jawabannya terpotong sebelum objek JSON-nya sempat ditulis:
 *
 *   "…never replace with actual name or pronouns l"
 *
 * Jawaban yang terpotong di tengah kalimat adalah tanda jatahnya habis, bukan
 * tanda modelnya menolak. 16.000 memberi ruang bagi model yang bernalar panjang
 * tanpa membiarkannya tumbuh tanpa batas — dan model yang tidak bernalar tetap
 * hanya memakai sebanyak yang ia butuhkan.
 *
 * Prompt-nya juga tidak lagi MENGAJAK bernalar: "berpikir dulu bila perlu" pada
 * tugas teks bebas pernah membuat penalarannya tersimpan sebagai isi. Keduanya
 * diperbaiki bersama karena keduanya menyumbang kegagalan yang sama.
 */
const MAX_TEXT_TOKENS = 16_000;

/**
 * Batas waktu untuk tugas TEKS.
 *
 * Empat kali lipat batas tugas visi, dan itu bukan kelonggaran: yang diminta di
 * sini sekitar SERIBU kata keluaran. Dengan 45 detik, tugas ini hampir pasti
 * selalu habis waktu — dan memang itu yang terjadi pada percobaan pertama
 * pemilik produk ("The operation was aborted due to timeout").
 *
 * Model menulis sekitar 30-80 token per detik; seribu kata berbahasa Indonesia
 * kira-kira 1.500 token, jadi 20-50 detik untuk menulisnya saja — belum termasuk
 * waktu berpikir model yang bernalar.
 */
export const TEXT_TIMEOUT_MS = 180_000;

/** Batas panjang satu bidang teks dunia yang diterima dari model. */
const MAX_WORLD_TEXT = 4_000;

/**
 * System prompt untuk sinopsis dan premis dunia.
 *
 * ATURAN TERPENTINGNYA: DILARANG MENYEBUT NAMA.
 *
 * Dunia ini adalah KERANGKA. Karakter yang mengisinya belum tentu ada saat
 * teksnya ditulis, dan yang memasangnya kelak bebas memilih siapa pun. Nama yang
 * tertulis di sinopsis akan berbenturan dengan nama itu, sedangkan sebutan peran
 * — "bosmu", "sahabatmu" — tetap benar untuk siapa pun yang mengisinya.
 */
export const WORLD_TEXT_SYSTEM_PROMPT = [
  'You write the synopsis and premise for a visual novel on an Indonesian platform.',
  'The editor gives you ONLY A TITLE. From it, write two texts, both in Indonesian.',
  '',
  'Reply with ONLY a JSON object. No markdown, no code fences, no commentary:',
  '',
  '{"synopsis": "...", "premise": "..."}',
  '',
  'WHAT EACH FIELD IS:',
  '- "synopsis": the situation and the hook. It is shown on the world detail page.',
  '- "premise": the opening scene that directs the story engine — where we are,',
  '  who is present, and what is happening right now.',
  '',
  'RULES — these matter more than style:',
  '',
  '1. NEVER WRITE A CHARACTER NAME. Not once, in any form, not even if the title',
  '   contains one. People are named by their ROLE or RELATIONSHIP to the reader:',
  '   "bosmu", "sahabatmu", "mantan pacarmu", "ibu tirimu", "tetangga sebelah".',
  '   The reader is "kamu". A role may be described further ("sahabatmu yang tahu',
  '   masa lalumu"), but never turned into a name.',
  '2. Second person, addressing the reader as "kamu".',
  '3. About 500 words EACH. Not 50, not 2000. Both fields are substantial.',
  '4. Concrete and specific: places, times, pressures, small details. Vague',
  '   generalities are worthless to the writer who has to build scenes from this.',
  '5. No spoilers of an ending, and no "pilihan ada di tanganmu" closing line.',
  '6. Do not mention that this is a game, a novel, a title, or that you are an AI.',
  '7. If the title is vague, invent a coherent, plausible setup rather than',
  '   asking. This is a framework; someone else fills in the people.',
  '',
  'You may think first if you need to, but the LAST thing you write must be the',
  'JSON object on its own, with nothing after it.',
].join('\n');

export type WorldTextResult =
  | { ok: true; synopsis: string; premise: string }
  | { ok: false; reason: VisionFailure; detail: string };

function buildTextRequest(
  request: { modelKey: string },
  systemPrompt: string,
  userPrompt: string,
): { path: string; body: unknown } {
  return {
    path: '/chat/completions',
    body: {
      model: request.modelKey,
      max_tokens: MAX_TEXT_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
  };
}

/**
 * Meminta sinopsis dan premis dunia dari judulnya.
 *
 * Tidak menyentuh media sama sekali: tugas ini hanya teks. Karena itu tidak ada
 * gambar, tidak ada `imagePart`, dan tidak ada `contentType` — dan pemanggilnya
 * tidak perlu menyiapkan apa pun selain judul dan pilihan model.
 */
export async function generateWorldText(
  request: { baseUrl: string; apiType: ApiType; modelKey: string },
  apiKey: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WorldTextResult> {
  const { path, body } = buildTextRequest(
    request,
    WORLD_TEXT_SYSTEM_PROMPT,
    `Judulnya: ${title}\n\nTulis sinopsis dan premisnya.`,
  );

  const call = await sendToProvider(request, path, body, apiKey, fetchImpl, {
    nama: 'tugas teks',
    timeoutMs: TEXT_TIMEOUT_MS,
    saranWaktuHabis:
      'Menulis sekitar seribu kata memang lama. Coba lagi, atau pilih model yang lebih cepat.',
  });
  if (!call.ok) {
    return call;
  }

  const parsed = extractWorldText(call.text);
  if (parsed === null) {
    return {
      ok: false,
      reason: 'bad-response',
      detail: explainUnparseable(call.text, call.raw, apiKey),
    };
  }

  if (parsed.synopsis.length === 0 || parsed.premise.length === 0) {
    return {
      ok: false,
      reason: 'declined',
      detail:
        parsed.reason.length > 0
          ? `Model tidak melengkapi sinopsis dan premis. Alasannya: ${detailOf(parsed.reason, apiKey)}`
          : `Model tidak melengkapi sinopsis dan premis, dan tidak menyebut alasannya. Jawabannya: ${detailOf(call.text, apiKey)}`,
    };
  }

  return { ok: true, synopsis: parsed.synopsis, premise: parsed.premise };
}

/** Membaca `synopsis` dan `premise` dari jawaban model. */
function extractWorldText(
  text: string,
): { synopsis: string; premise: string; reason: string } | null {
  const record = lastJsonObject(text, 'synopsis');
  if (record === null) {
    return null;
  }

  const synopsis = typeof record.synopsis === 'string' ? record.synopsis.trim() : '';
  const premise = typeof record.premise === 'string' ? record.premise.trim() : '';
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';

  return {
    synopsis: clamp(synopsis, MAX_WORLD_TEXT),
    premise: clamp(premise, MAX_WORLD_TEXT),
    reason: clamp(reason, MAX_VISION_REASON),
  };
}

/**
 * Apakah penyedia menyatakan jawabannya terpotong karena kehabisan token.
 *
 * Penyedia yang menghormati OpenAI mengisi `finish_reason: "length"`. Kalau
 * bidangnya tidak ada, jawabannya dianggap tidak terpotong — menuduh terpotong
 * tanpa bukti akan mengarahkan admin ke perbaikan yang salah.
 */
function wasTruncated(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { choices?: { finish_reason?: unknown }[] };
    const alasan = parsed.choices?.[0]?.finish_reason;
    return alasan === 'length';
  } catch {
    return false;
  }
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
    const fromChoice = flattenContent(message?.content);
    if (fromChoice !== null) {
      return fromChoice;
    }
    /*
     * Sebagian penyedia menaruh teksnya di bidang lain ketika model menolak
     * atau ketika jawabannya dianggap "penalaran". Mencari ketiganya lebih murah
     * daripada menampilkan "jawaban tidak dikenali" untuk jawaban yang sebenarnya
     * ada — dan jawaban itulah yang dibutuhkan admin untuk mendiagnosis.
     */
    for (const kunci of ['refusal', 'reasoning_content', 'text']) {
      const nilai = message?.[kunci];
      if (typeof nilai === 'string' && nilai.trim().length > 0) {
        return nilai;
      }
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
 * Mencari objek JSON terakhir di dalam teks yang memiliki bidang bersangkutan.
 *
 * DICARI DARI BELAKANG, bukan dari depan, dan itu bukan kerapian.
 *
 * Model yang bernalar menyebut contoh bentuk JSON di tengah penalarannya —
 * `{"name": "...", "description": "..."}` — sebelum menulis jawaban sebenarnya
 * di akhir. Mengambil objek PERTAMA akan mengurai contoh itu, dan hasilnya lokasi
 * bernama tiga titik. Jawaban yang benar selalu yang terakhir.
 *
 * Toleran dengan sengaja: model kecil sering membungkus JSON-nya dengan pagar
 * kode atau menambahkan kalimat pengantar, walaupun promptnya sudah melarang.
 * Menolak jawaban karena itu berarti membuang pekerjaan yang sebenarnya benar.
 */
function lastJsonObject(text: string, key: string): Record<string, unknown> | null {
  for (let start = text.lastIndexOf('{'); start >= 0; start = text.lastIndexOf('{', start - 1)) {
    const end = matchingBrace(text, start);
    if (end < 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record[key] === 'string') {
      return record;
    }
  }

  return null;
}

/**
 * Membaca `name` dan `description` dari jawaban model lokasi.
 */
function extractNameAndDescription(
  text: string,
): { name: string; description: string; reason: string } | null {
  const record = lastJsonObject(text, 'name');
  if (record === null) {
    return null;
  }

  const name = (record.name as string).trim();

  /*
   * Objek yang `name`-nya berisi TANPA SATU PUN HURUF adalah contoh bentuk,
   * bukan jawaban — mis. "..." dari template di dalam penalaran. Membiarkannya
   * lolos berarti membuat lokasi bernama tiga titik.
   *
   * Nama KOSONG tetap diterima: itulah jalan keluar jujur yang disediakan
   * promptnya saat model tidak dapat menamai tempatnya.
   */
  if (name.length > 0 && !/\p{L}/u.test(name)) {
    // Cari objek berikutnya yang lebih awal; contoh bentuk ada di depan jawaban.
    const lebihAwal = text.slice(0, text.lastIndexOf('{'));
    return lebihAwal.length > 0 ? extractNameAndDescription(lebihAwal) : null;
  }

  const description = typeof record.description === 'string' ? record.description.trim() : '';
  // Bidang ini hanya dipakai saat model tidak dapat menamai tempatnya. Ia
  // ditambahkan SETELAH kejadian nyata: jawaban kosong tanpa alasan tidak dapat
  // dibedakan antara "model menolak" dan "gambar tidak pernah sampai".
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';

  return {
    name: clamp(name, MAX_VISION_NAME),
    description: clamp(description, MAX_VISION_DESCRIPTION),
    reason: clamp(reason, MAX_VISION_REASON),
  };
}

/**
 * Membaca `label` dari jawaban model potret, beserta jumlah bagiannya.
 *
 * Jumlah bagiannya dikembalikan, bukan langsung ditolak, supaya pemanggilnya
 * dapat menjelaskan berapa bagian yang model tulis. "Keterangan tidak sah" tidak
 * memberi admin apa pun untuk dikerjakan.
 */
function extractLabel(text: string): { label: string; reason: string; parts: number } | null {
  const record = lastJsonObject(text, 'label');
  if (record === null) {
    return null;
  }

  const label = (record.label as string).trim();
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';

  return {
    label: clamp(label, MAX_EXPRESSION_LABEL),
    reason: clamp(reason, MAX_VISION_REASON),
    parts: countParts(label),
  };
}

/** Menghitung bagian yang dipisah koma; label kosong dihitung nol. */
function countParts(label: string): number {
  if (label.length === 0) {
    return 0;
  }
  return label
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

/**
 * Indeks `}` yang sepadan dengan `{` pada `start`, atau -1.
 *
 * Penghitungnya menghormati teks di dalam tanda kutip: deskripsi berbahasa
 * Indonesia dapat memuat kurung kurawal, dan menghitungnya sebagai struktur akan
 * memotong JSON di tempat yang salah.
 */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const character = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === '{') {
      depth += 1;
    }
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
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
