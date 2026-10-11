/**
 * Mesin cerita berbasis model.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA VALIDASINYA KETAT
 * ---------------------------------------------------------------------------
 * Keluaran model adalah DATA yang dirender program, bukan teks yang dibaca
 * manusia. Model yang mengarang `assetId` tidak menghasilkan kalimat aneh — ia
 * menghasilkan layar yang menampilkan placeholder, tanpa galat. Model yang lupa
 * menulis keputusan tidak menghasilkan adegan yang kurang bagus — ia membuat
 * pemain TIDAK PUNYA JALAN melanjutkan.
 *
 * Karena itu setiap adegan diperiksa sebelum disimpan, dan yang tidak lolos
 * DIBUANG SELURUHNYA — bukan diperbaiki sebagian. Adegan setengah benar lebih
 * berbahaya daripada adegan yang jelas gagal, karena yang pertama tidak terlihat
 * rusak.
 *
 * ---------------------------------------------------------------------------
 * CADANGAN BUKAN KEMEWAHAN
 * ---------------------------------------------------------------------------
 * Setiap giliran kini bergantung pada model. Tanpa cadangan, satu kegagalan
 * jaringan menghentikan cerita di tengah, dan pemain tidak dapat berbuat apa pun.
 * Simulator memang sederhana, tetapi ia selalu berhasil.
 */
import type {
  Beat,
  ChoiceOption,
  NPCPublicDTO,
  StoryEvent,
  AssetManifest,
  ResponseLocale,
} from '../contracts/types';

import type { StoryEngine, StoryEngineResult, StoryContext } from './storyEngine';
import {
  buildStoryUserPrompt,
  cadanganPertanyaan,
  MAX_BEAT_WORDS,
  MAX_SCENE_BEATS,
  storySystemPrompt,
} from './storyPrompt';

/** Hasil pemanggilan model, apa adanya. */
export type StorySceneCall = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<{ ok: true; scene: unknown } | { ok: false; detail: string }>;

export type AiStoryEngineDeps = {
  call: StorySceneCall;
  /** Dipakai bila model gagal. Simulator selalu berhasil. */
  fallback: StoryEngine;
  /** Perkiraan biaya satu giliran, untuk anggaran. */
  estimatedTurnCost?: number;
  onFailure?: (sebab: string) => void;
  /**
   * Peristiwa yang dibuang dari adegan yang tetap diterima.
   *
   * Dipisahkan dari `onFailure` dengan sengaja: giliran ini BERHASIL, jadi tidak
   * boleh dihitung sebagai kegagalan — tetapi isinya berkurang, dan itu perlu
   * terlihat di log.
   */
  onSkipped?: (rinci: string) => void;
};

/** Alasan sebuah adegan ditolak. Dipakai untuk log dan pengujian. */
export type RejectReason =
  | 'bukan-objek'
  | 'beats-bukan-array'
  | 'beats-kosong'
  | 'terlalu-banyak-beat'
  | 'event-tidak-dikenal'
  | 'asset-tidak-dikenal'
  | 'npc-tidak-dikenal'
  | 'ekspresi-tidak-dikenal'
  | 'tanpa-keputusan'
  | 'opsi-bukan-tiga';

export class AiStoryEngine implements StoryEngine {
  readonly isSimulator = false;
  readonly estimatedTurnCost: number;

  constructor(private readonly deps: AiStoryEngineDeps) {
    this.estimatedTurnCost = deps.estimatedTurnCost ?? 6_000;
  }

  async generateOpening(context: StoryContext): Promise<StoryEngineResult> {
    return this.tulis(context, null);
  }

  async generateTurn(context: StoryContext): Promise<StoryEngineResult> {
    return this.tulis(context, aksiPemain(context));
  }

  /**
   * Menulis satu adegan, atau menyerahkannya ke simulator.
   *
   * Kegagalan apa pun — jaringan, bentuk, id yang dikarang — berakhir sama:
   * simulator menulis adegannya. Pemain tidak pernah melihat galat.
   */
  private async tulis(
    context: StoryContext,
    playerAction: string | null,
  ): Promise<StoryEngineResult> {
    const userPrompt = buildStoryUserPrompt({
      worldTitle: context.worldTitle,
      premise: context.premise,
      synopsis: context.synopsis ?? '',
      persona: { name: context.personaName, age: context.personaAge ?? 0 },
      backgrounds: context.manifest.backgrounds.map((item) => ({
        assetId: item.assetId,
        label: item.label,
      })),
      characters: context.characters.map((item) => ({
        npcId: item.npcId,
        name: item.name,
        role: item.role,
        soul: item.soul,
        publicBackstory: item.publicBackstory,
        defaultPortraitAssetId: item.defaultPortraitAssetId,
        expressions: item.expressions,
      })),
      storySoFar: context.storySoFar ?? null,
      recentBeats: context.recentBeats ?? [],
      playerAction,
      // Bahasa pilihan pemain dibawa sampai ke prompt.
      responseLocale: context.responseLocale ?? 'id-ID',
    });

    /*
     * System prompt dibangun per permintaan, bukan konstanta.
     *
     * Aturan bahasanya harus mengikuti pilihan pemain; konstanta statis membuat
     * opsi "English" tidak berpengaruh apa pun.
     */
    const panggilan = await this.deps.call(
      storySystemPrompt(context.responseLocale ?? 'id-ID'),
      userPrompt,
    );
    if (!panggilan.ok) {
      return this.serahkanKeSimulator(context, playerAction, `panggilan gagal: ${panggilan.detail}`);
    }

    const diperiksa = periksaAdegan(
      panggilan.scene,
      context.manifest,
      context.characters,
      context.responseLocale,
    );
    if (!diperiksa.ok) {
      // Nilai yang ditolak ikut dicatat: tanpa itu penyebabnya harus ditebak.
      const rinci = diperiksa.detail ? ` (${diperiksa.detail})` : '';
      return this.serahkanKeSimulator(
        context,
        playerAction,
        `adegan ditolak: ${diperiksa.reason}${rinci}`,
      );
    }

    /*
     * Peristiwa yang dibuang tetap DILAPORKAN, meski giliran tetap jalan.
     * Tanpa laporan, "adegan diterima" akan menyembunyikan bahwa sebagian isi
     * model hilang — dan itu tidak akan pernah ketahuan sampai ada yang
     * menyadari satu adegan terasa lebih pendek dari seharusnya.
     */
    if (diperiksa.skipped.length > 0) {
      this.deps.onSkipped?.(diperiksa.skipped.join(', '));
    }

    return bungkusJadiHasil(diperiksa.events, context, this.estimatedTurnCost);
  }

  private async serahkanKeSimulator(
    context: StoryContext,
    playerAction: string | null,
    sebab: string,
  ): Promise<StoryEngineResult> {
    this.deps.onFailure?.(sebab);

    const konteks: StoryContext = {
      ...context,
      ...(playerAction !== null ? { customText: playerAction } : null),
    };

    return playerAction === null
      ? this.deps.fallback.generateOpening(konteks)
      : this.deps.fallback.generateTurn(konteks);
  }
}

/** Yang dilakukan pemain: aksi bebas bila ada, selain itu label opsinya. */
export function aksiPemain(context: StoryContext): string | null {
  if (context.customText && context.customText.trim().length > 0) {
    return context.customText.trim();
  }
  if (context.optionLabel && context.optionLabel.trim().length > 0) {
    return context.optionLabel.trim();
  }
  return null;
}

/**
 * `detail` memuat NILAI yang ditolak, bukan hanya jenis penolakannya.
 *
 * Tanpa itu, log produksi hanya berbunyi "adegan ditolak: npc-tidak-dikenal" dan
 * tidak ada cara mengetahui id apa yang sebenarnya ditulis model — penyebabnya
 * harus ditebak. Sekali sudah terjadi, dan menebak memakan satu putaran deploy.
 */
export type PeriksaHasil =
  | { ok: true; events: StoryEvent[]; skipped: string[] }
  | { ok: false; reason: RejectReason; detail?: string };

/**
 * Memeriksa adegan dari model terhadap daftar aset yang sah.
 *
 * Diekspor supaya dapat diuji tanpa memanggil model — dan supaya aturannya
 * terlihat sebagai daftar, bukan tersembunyi di dalam alur.
 */
/**
 * Mencocokkan ekspresi yang diminta model dengan daftar yang sah.
 *
 * Kecocokan PERSIS diutamakan. Bila gagal, dicoba kecocokan berdasarkan
 * SEGMEN PERTAMA: nama ekspresi di panel admin berbentuk frasa berkoma
 * ("senyum, pakaian kantor, mengangkat tangan"), dan model wajar menuliskan
 * bentuk pendeknya saja ("senyum").
 *
 * Mengapa toleransi ini perlu: satu ekspresi yang tidak dikenali membuat
 * SELURUH adegan ditolak (`periksaAdegan` berhenti pada kegagalan pertama),
 * lalu seluruh giliran jatuh ke simulator. Akibatnya bukan sekadar potret yang
 * salah — ceritanya berhenti maju, dan pemain melihatnya sebagai "loop".
 *
 * Yang dikembalikan selalu salah satu nilai dari `daftar`, sehingga nilai yang
 * tersimpan tetap sah dan tidak ada ekspresi karangan yang lolos.
 */
export function cocokkanEkspresi(daftar: string[], diminta: string): string | undefined {
  if (daftar.includes(diminta)) {
    return diminta;
  }
  const segmenPertama = (nilai: string) => nilai.split(',')[0]?.trim().toLowerCase() ?? '';
  const kunci = segmenPertama(diminta);
  if (kunci.length === 0) {
    return undefined;
  }
  return daftar.find((sah) => segmenPertama(sah) === kunci);
}

/**
 * Mencocokkan npcId yang ditulis model dengan daftar karakter yang sah.
 *
 * Mengapa toleransi ini perlu: `npcId` dibuat panel admin sebagai
 * `npc_${slug(randomUUID()).slice(0, 10)}` — mis. `npc_1120343c-5`. Bentuk itu
 * TERPOTONG di tengah UUID, sehingga mudah disalin keliru: tanpa awalan `npc_`,
 * tanpa tanda hubung, atau justru dilengkapi kembali menjadi UUID penuh.
 * Pencocokan PERSIS menolak semua variasi itu, dan satu `showCharacter` yang
 * ditolak menjatuhkan SELURUH adegan — seluruh giliran lalu jatuh ke simulator,
 * yang keluarnya sama terus. Di layar itu terlihat sebagai "cerita berulang".
 *
 * Bentuk normal: huruf kecil, awalan `npc` dibuang, `-`/`_` dibuang. Cocok bila
 * sama, atau bila salah satu adalah awalan yang lain (menangani id terpotong vs
 * UUID penuh). Awalan WAJIB dibuang, karena model sering hanya menulis bagian
 * UUID-nya — dan tanpa itu perbandingannya tidak pernah sejajar.
 * Bila ada lebih dari satu kandidat, TIDAK menebak — kembalikan `undefined`.
 *
 * Yang dikembalikan selalu salah satu nilai dari `daftar`, sehingga tidak ada
 * id karangan yang tersimpan.
 */
export function cocokkanNpc(daftar: string[], diminta: string): string | undefined {
  if (daftar.includes(diminta)) {
    return diminta;
  }
  const normal = (nilai: string) => nilai.toLowerCase().replace(/[-_]/g, '').replace(/^npc/, '');
  const kunci = normal(diminta);
  // Terlalu pendek berarti hampir pasti bukan id — jangan mengundi.
  if (kunci.length < 8) {
    return undefined;
  }
  const kandidat = daftar.filter((sah) => {
    const n = normal(sah);
    return n === kunci || n.startsWith(kunci) || kunci.startsWith(n);
  });
  return kandidat.length === 1 ? kandidat[0] : undefined;
}

/** npcId sah yang dirujuk sebuah peristiwa, atau `undefined` bila tidak ada. */
function rujukNpc(nilai: unknown, npcSah: Map<string, NPCPublicDTO>): string | undefined {
  if (typeof nilai !== 'string') {
    return undefined;
  }
  return cocokkanNpc([...npcSah.keys()], nilai);
}

/**
 * Apakah model menuliskan PEMAIN sebagai npcId.
 *
 * Prompt menyapa pemain sebagai `@user` di seluruh aturan, jadi model kadang
 * memakai penanda itu sebagai pelaku sebuah peristiwa. Pemain tidak punya
 * `NPCPublicDTO` — tidak ada potret maupun relasi — sehingga id itu tidak akan
 * pernah cocok, dan satu peristiwa seperti itu menjatuhkan SELURUH adegan.
 *
 * Terukur di produksi 11 Okt 2026, dan baru dapat diketahui setelah penolakan
 * mulai mencatat nilainya: `"adegan ditolak: npc-tidak-dikenal (@user)"`.
 */
function adalahPemain(nilai: unknown): boolean {
  if (typeof nilai !== 'string') {
    return false;
  }
  const normal = nilai.toLowerCase().replace(/[^a-z]/g, '');
  return normal === 'user' || normal === 'pemain' || normal === 'player';
}

export function periksaAdegan(
  mentah: unknown,
  manifest: AssetManifest,
  characters: NPCPublicDTO[],
  responseLocale?: ResponseLocale,
): PeriksaHasil {
  if (!mentah || typeof mentah !== 'object' || Array.isArray(mentah)) {
    return { ok: false, reason: 'bukan-objek' };
  }

  const rekaman = mentah as Record<string, unknown>;
  const beats = rekaman.beats;

  if (!Array.isArray(beats)) {
    return { ok: false, reason: 'beats-bukan-array' };
  }
  if (beats.length === 0) {
    return { ok: false, reason: 'beats-kosong' };
  }
  if (beats.length > MAX_SCENE_BEATS) {
    return { ok: false, reason: 'terlalu-banyak-beat' };
  }

  const latarSah = new Set(manifest.backgrounds.map((item) => item.assetId));
  const potretSah = new Set(manifest.portraits.map((item) => item.assetId));
  const npcSah = new Map(characters.map((item) => [item.npcId, item]));

  const events: StoryEvent[] = [];

  /*
   * Peristiwa yang DIBUANG, bukan yang menjatuhkan adegan.
   *
   * Hanya berlaku untuk satu hal: model memakai penanda pemain (`@user`) sebagai
   * pelaku. Pemain tidak punya potret maupun relasi, jadi peristiwanya memang
   * tidak dapat ditampilkan — tetapi membuang SATU peristiwa jauh lebih baik
   * daripada membuang seluruh giliran lalu menyerahkannya ke simulator.
   * Id yang benar-benar asing tetap ditolak seperti sebelumnya.
   */
  const dibuang: string[] = [];

  for (const item of beats) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'event-tidak-dikenal' };
    }
    const peristiwa = item as Record<string, unknown>;

    switch (peristiwa.type) {
      case 'narrate': {
        if (typeof peristiwa.text !== 'string') {
          return { ok: false, reason: 'event-tidak-dikenal' };
        }
        events.push({ type: 'narrate', text: peristiwa.text.trim() });
        break;
      }

      case 'setBackground': {
        if (typeof peristiwa.assetId !== 'string' || !latarSah.has(peristiwa.assetId)) {
          return { ok: false, reason: 'asset-tidak-dikenal', detail: String(peristiwa.assetId) };
        }
        events.push({ type: 'setBackground', assetId: peristiwa.assetId });
        break;
      }

      case 'showCharacter': {
        // Pemain tidak punya potret: tidak ada yang dapat ditampilkan.
        if (adalahPemain(peristiwa.npcId)) {
          dibuang.push('showCharacter @user');
          break;
        }
        const npcIdSah = rujukNpc(peristiwa.npcId, npcSah);
        const npc = npcIdSah !== undefined ? npcSah.get(npcIdSah) : undefined;
        if (!npc) {
          return { ok: false, reason: 'npc-tidak-dikenal', detail: String(peristiwa.npcId) };
        }
        const ekspresi =
          typeof peristiwa.expression === 'string'
            ? cocokkanEkspresi(npc.expressions, peristiwa.expression)
            : undefined;
        if (!ekspresi) {
          return {
            ok: false,
            reason: 'ekspresi-tidak-dikenal',
            detail: String(peristiwa.expression),
          };
        }
        if (
          typeof peristiwa.assetId !== 'string' ||
          !potretSah.has(peristiwa.assetId)
        ) {
          return { ok: false, reason: 'asset-tidak-dikenal', detail: String(peristiwa.assetId) };
        }
        events.push({
          type: 'showCharacter',
          npcId: npc.npcId,
          // Nilai dari DAFTAR, bukan dari model — tidak ada ekspresi karangan.
          expression: ekspresi,
          assetId: peristiwa.assetId,
        });
        break;
      }

      case 'hideCharacter': {
        if (adalahPemain(peristiwa.npcId)) {
          dibuang.push('hideCharacter @user');
          break;
        }
        const idSah = rujukNpc(peristiwa.npcId, npcSah);
        if (!idSah) {
          return { ok: false, reason: 'npc-tidak-dikenal', detail: String(peristiwa.npcId) };
        }
        events.push({ type: 'hideCharacter', npcId: idSah });
        break;
      }

      case 'say': {
        if (typeof peristiwa.text !== 'string') {
          return { ok: false, reason: 'event-tidak-dikenal' };
        }
        /*
         * Pemain berbicara: tidak ada potret yang dapat ditampilkan, dan pemain
         * tidak punya nama yang dapat diatribusikan. Kalimatnya TETAP dipakai —
         * dibuang sebagai narasi, bukan dihilangkan. Yang ditulis model tidak
         * hilang; hanya bentuknya berubah.
         */
        if (adalahPemain(peristiwa.npcId)) {
          dibuang.push('say @user -> narrate');
          events.push({ type: 'narrate', text: peristiwa.text.trim() });
          break;
        }
        const idSah = rujukNpc(peristiwa.npcId, npcSah);
        if (!idSah) {
          return { ok: false, reason: 'npc-tidak-dikenal', detail: String(peristiwa.npcId) };
        }
        events.push({ type: 'say', npcId: idSah, text: peristiwa.text.trim() });
        break;
      }

      case 'relationshipDelta': {
        if (adalahPemain(peristiwa.npcId)) {
          dibuang.push('relationshipDelta @user');
          break;
        }
        const idSah = rujukNpc(peristiwa.npcId, npcSah);
        if (!idSah) {
          return { ok: false, reason: 'npc-tidak-dikenal', detail: String(peristiwa.npcId) };
        }
        events.push({
          type: 'relationshipDelta',
          npcId: idSah,
          status: peristiwa.status as never,
          reasonPublic: typeof peristiwa.reasonPublic === 'string' ? peristiwa.reasonPublic : '',
        });
        break;
      }

      default:
        // Termasuk `presentChoices` yang ditulis model di dalam beats: keputusan
        // punya tempatnya sendiri, dan bentuknya diperiksa di bawah.
        return { ok: false, reason: 'event-tidak-dikenal' };
    }
  }

  /*
   * Bila SEMUA peristiwa dibuang, adegan ini tidak menyisakan apa pun untuk
   * ditampilkan — pemain akan melihat layar kosong. Dalam keadaan itu barulah
   * ditolak, supaya simulator yang mengambil alih.
   */
  if (events.length === 0) {
    return { ok: false, reason: 'npc-tidak-dikenal', detail: dibuang.join(', ') };
  }

  const keputusan = rekaman.decision;
  if (!keputusan || typeof keputusan !== 'object' || Array.isArray(keputusan)) {
    return { ok: false, reason: 'tanpa-keputusan' };
  }

  const opsi = (keputusan as Record<string, unknown>).options;
  if (!Array.isArray(opsi) || opsi.length !== 3) {
    return { ok: false, reason: 'opsi-bukan-tiga' };
  }

  const pilihan: ChoiceOption[] = [];
  for (const [urutan, satu] of opsi.entries()) {
    if (!satu || typeof satu !== 'object' || Array.isArray(satu)) {
      return { ok: false, reason: 'opsi-bukan-tiga' };
    }
    const r = satu as Record<string, unknown>;
    if (typeof r.label !== 'string' || r.label.trim().length === 0) {
      return { ok: false, reason: 'opsi-bukan-tiga' };
    }
    pilihan.push({
      // optionId DIBUAT ULANG, tidak dipercaya dari model: id yang bertabrakan
      // antar giliran akan membuat jawaban pemain menunjuk opsi yang salah.
      optionId: `opt${String(urutan + 1)}`,
      label: r.label.trim(),
      description: typeof r.description === 'string' ? r.description.trim() : '',
    });
  }

  const prompt = (keputusan as Record<string, unknown>).prompt;
  events.push({
    type: 'presentChoices',
    decisionId: 'd1',
    prompt:
      typeof prompt === 'string' && prompt.trim().length > 0
        ? prompt.trim()
        : cadanganPertanyaan(responseLocale),
    options: [pilihan[0]!, pilihan[1]!, pilihan[2]!],
  });

  return { ok: true, events, skipped: dibuang };
}

/** Membungkus peristiwa menjadi beat, dengan id yang unik per giliran. */
function bungkusJadiHasil(
  events: StoryEvent[],
  context: StoryContext,
  biaya: number,
): StoryEngineResult {
  const awalan = context.beatIdPrefix ?? `t${String(context.turnOrdinal).padStart(3, '0')}`;

  const beats: Beat[] = events.map((event, index) => ({
    beatId: `${awalan}-b${String(index + 1).padStart(3, '0')}`,
    turnId: awalan,
    sequence: index + 1,
    event,
  }));

  return {
    beats,
    usage: { promptTokens: 0, completionTokens: 0, chargedTotal: biaya },
    modelId: 'ai-story',
    modelVersion: '1',
  };
}

/** Batas kata per beat, dipakai uji dan pemeriksaan panjang. */
export const BATAS_KATA_BEAT = MAX_BEAT_WORDS;
