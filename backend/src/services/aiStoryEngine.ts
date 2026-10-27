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
  RelationStatus,
  RelationVocabularyEntry,
  StoryEvent,
  AssetManifest,
  ResponseLocale,
} from '../contracts/types';

import type { StoryEngine, StoryEngineResult, StoryContext } from './storyEngine';
import type { EngineEventKind } from '../repositories/engineEventRepository';
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
  /**
   * Kejadian mesin yang direkam sebagai DATA, bukan sekadar log.
   *
   * Dipisah dari `onFailure`/`onSkipped` karena kegunaannya berbeda: dua
   * callback lama menulis log yang hilang begitu log platform bergulir, sedangkan
   * `onEvent` mengisi tabel `engine_events` yang dibaca halaman /admin/mesin.
   * Pemanggil yang hanya ingin log boleh tidak menyediakannya.
   *
   * Pencatatnya WAJIB tidak pernah melempar (lihat `EngineEventRepository`);
   * mesin ini memanggilnya apa adanya tanpa try/catch.
   */
  onEvent?: (event: { kind: EngineEventKind; detail: string }) => void;
};

/**
 * Jenis kejadian mesin didefinisikan SEKALI, di `EngineEventRepository` —
 * tepat di samping CHECK migrasinya. Mesin hanya memakai tipenya.
 */
export type { EngineEventKind } from '../repositories/engineEventRepository';

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
      /*
       * Keadaan hubungan dibawa ke prompt.
       *
       * Nama tokoh diambil dari daftar karakter dunia, bukan dari `RelationEntry`
       * (yang hanya memuat npcId). Bila tokohnya tidak ada di daftar — mis. dunia
       * berubah setelah perjalanan dibuat — namanya jatuh ke id-nya sendiri,
       * supaya prompt tetap terbaca dan tidak memuat `undefined`.
       */
      relations: (context.relations ?? []).map((relasi) => ({
        npcId: relasi.npcId,
        name: context.characters.find((c) => c.npcId === relasi.npcId)?.name ?? relasi.npcId,
        status: relasi.status,
        reasonPublic: relasi.reasonPublic,
      })),
      playerAction,
      /*
       * Kosakata status dunia ini dibawa apa adanya.
       *
       * Ia datang dari versi dunia yang sudah DIBEKUKAN, bukan dari master yang
       * sedang berlaku: menyunting arti sebuah status di panel hari ini tidak
       * boleh mengubah cara tokoh bersikap di perjalanan yang sudah berjalan.
       */
      relationVocabulary: context.relationVocabulary,
      // Bahasa pilihan pemain dibawa sampai ke prompt.
      responseLocale: context.responseLocale ?? 'id-ID',
    });

    /*
     * System prompt dibangun per permintaan, bukan konstanta.
     *
     * Aturan bahasanya harus mengikuti pilihan pemain; konstanta statis membuat
     * opsi "English" tidak berpengaruh apa pun.
     */
    const systemPrompt = storySystemPrompt(context.responseLocale ?? 'id-ID');

    /*
     * SATU percobaan ulang untuk kegagalan transport.
     *
     * Dulu: satu blip jaringan — timeout, koneksi putus, 5 sekunder provider —
     * langsung menjatuhkan giliran ke simulator. Kualitas cerita turun senyap,
     * dan pemain hanya melihat adegan yang tiba-tiba membosankan.
     *
     * Sekarang: kegagalan transport dicoba SEKALI lagi sebelum menyerah. Yang
     * TIDAK dicoba ulang adalah penolakan adegan (`adegan ditolak`) — itu
     * keputusan validator, bukan kecelakaan jaringan; mencobanya lagi dengan
     * masukan yang sama hampir pasti menghasilkan penolakan yang sama.
     *
     * Idempotensinya aman: kedua percobaan memakai operasi dan giliran yang
     * sama, jadi tak ada yang ditagih dua kali (FR-52).
     *
     * BUKTI MUTASI: hapus blok retry ini (kembalikan satu panggilan langsung),
     * lalu uji "mencoba ulang sekali saat panggilan gagal" memerah.
     */
    let panggilan = await this.deps.call(systemPrompt, userPrompt);
    if (!panggilan.ok) {
      panggilan = await this.deps.call(systemPrompt, userPrompt);
    }
    if (!panggilan.ok) {
      this.deps.onEvent?.({ kind: 'engine_failed', detail: `panggilan gagal: ${panggilan.detail}` });
      return this.serahkanKeSimulator(context, playerAction, `panggilan gagal: ${panggilan.detail}`);
    }

    const diperiksa = periksaAdegan(
      panggilan.scene,
      context.manifest,
      context.characters,
      context.relationVocabulary,
      context.responseLocale,
    );
    if (!diperiksa.ok) {
      // Nilai yang ditolak ikut dicatat: tanpa itu penyebabnya harus ditebak.
      const rinci = diperiksa.detail ? ` (${diperiksa.detail})` : '';
      this.deps.onEvent?.({
        kind: 'scene_rejected',
        detail: `adegan ditolak: ${diperiksa.reason}${rinci}`,
      });
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
      // Giliran ini BERHASIL — kejadiannya bukan kegagalan, tetapi isi adegan
      // berkurang, dan jumlahnya perlu terlihat di panel.
      this.deps.onEvent?.({ kind: 'events_skipped', detail: diperiksa.skipped.join(', ') });
    }

    return bungkusJadiHasil(diperiksa.events, context, this.estimatedTurnCost);
  }

  private async serahkanKeSimulator(
    context: StoryContext,
    playerAction: string | null,
    sebab: string,
  ): Promise<StoryEngineResult> {
    this.deps.onFailure?.(sebab);
    /*
     * Satu-satunya titik rekam `simulator_used`.
     *
     * Ya, giliran ini biasanya sudah merekam `engine_failed` atau
     * `scene_rejected` lebih dulu, jadi satu penyerahan menghasilkan dua baris.
     * Itu disengaja: baris pertama menjawab MENGAPA, baris ini menjawab APA
     * YANG TERJADI ke pemain. Mode uji (seluruh mesin = simulator) sengaja
     * TIDAK terekam di sini, karena bukan degradasi — ceritanya memang
     * dikerjakan simulator dari awal.
     */
    this.deps.onEvent?.({ kind: 'simulator_used', detail: sebab });

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
 *
 * ---------------------------------------------------------------------------
 * CATATAN PENEMPATAN
 * ---------------------------------------------------------------------------
 * Dulu blok "Mencocokkan ekspresi" menempel tepat di bawah sini, sehingga ia
 * terbaca sebagai dokumen fungsi `periksaAdegan` padahal yang dijelaskannya ada
 * di bawah, pada `cocokkanEkspresi`. Komentar yang menempel pada fungsi yang
 * salah lebih buruk daripada tidak ada komentar: ia meyakinkan pembaca tentang
 * hal yang tidak dilakukan kode di tempat itu. Dokumennya sudah dipindahkan ke
 * atas `cocokkanEkspresi`.
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
/**
 * Mencocokkan `status` hubungan yang ditulis model dengan daftar yang sah.
 *
 * Model cenderung menulis keadaan perasaannya, bukan kuncinya: "marah",
 * "tersinggung", "senang", "mulai suka", "jauh". Nilai seperti itu dulu
 * tersimpan apa adanya (dulu tidak ada pemeriksaan sama sekali), lalu diubah
 * `coerceRelationStatus` menjadi "Belum diketahui" di layar — perubahan hubungan
 * yang ditulis model HILANG tanpa satu pun galat.
 *
 * Toleransinya: spasi di ujung dibuang, lalu harus PERSIS salah satu id dari
 * kosakata dunia itu; kalau tidak, dicocokkan dengan LABEL-nya. Tidak ada
 * pemetaan dari kata bebas ke status — "marah" BUKAN "tegang". Model yang
 * menebak kata sendiri tidak ditebak balik; perubahannya dibuang dan dilaporkan.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA NORMALISASI LAMA DIBUANG
 * ---------------------------------------------------------------------------
 * Bentuk sebelumnya membuang spasi, tanda hubung, dan garis bawah sebelum
 * mencocokkan. Itu aman selama daftarnya delapan kata bawaan yang tidak mungkin
 * bertabrakan. Sejak status dibuat admin, tidak lagi: `sangat_dekat` dan
 * `sangatdekat` adalah dua status yang berbeda, dan normalisasi itu membuat
 * keduanya cocok satu sama lain — perubahan hubungan tersimpan pada status yang
 * salah, tanpa galat, dan pemain melihat tokoh bersikap tidak sesuai ceritanya.
 *
 * Yang dikembalikan selalu id dari kosakata, sehingga tidak ada status karangan
 * yang pernah tersimpan.
 */
export function cocokkanStatus(
  diminta: unknown,
  vocabulary: readonly RelationVocabularyEntry[],
): RelationStatus | undefined {
  if (typeof diminta !== 'string') {
    return undefined;
  }
  const nilai = diminta.trim();
  if (nilai.length === 0) {
    return undefined;
  }

  const tepat = vocabulary.find((definisi) => definisi.relationId === nilai);
  if (tepat) {
    return tepat.relationId;
  }

  /*
   * Dua kelonggaran, keduanya TIDAK menyatukan dua id yang berbeda:
   *   - id yang hanya berbeda huruf besar/kecil;
   *   - LABEL, karena model kadang menulis "Waspada" alih-alih "waspada".
   */
  const hurufKecil = nilai.toLowerCase();
  const lewatId = vocabulary.find((definisi) => definisi.relationId.toLowerCase() === hurufKecil);
  if (lewatId) {
    return lewatId.relationId;
  }
  const lewatLabel = vocabulary.find((definisi) => definisi.labelId.trim().toLowerCase() === hurufKecil);
  return lewatLabel?.relationId;
}

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
  /*
   * Kosakata DUNIA INI, dan ia wajib.
   *
   * Dulu fungsi ini membaca daftar tetap di dalam kode, sehingga tidak ada
   * pemanggil yang bisa lupa — sekaligus tidak ada cara menambah status tanpa
   * membangun ulang aplikasi. Sejak daftarnya menjadi data, lupa mengisinya
   * berarti setiap status baru dibuang tanpa galat; karena itu parameternya
   * wajib, bukan opsional dengan cadangan.
   */
  vocabulary: readonly RelationVocabularyEntry[],
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
  /*
   * Batas keras untuk keluaran yang benar-benar lepas kendali.
   *
   * Antara `MAX_SCENE_BEATS` dan batas ini, adegan TIDAK ditolak — kelebihannya
   * dipangkas sesudah peristiwa diperiksa (lihat `pangkasAdegan`). Menolak
   * seluruh adegan hanya karena model menulis satu beat lebih banyak membuat
   * seluruh giliran jatuh ke simulator, dan itu jauh lebih merugikan daripada
   * kehilangan satu kalimat. Terukur di produksi 11 Okt 2026:
   * `"adegan ditolak: terlalu-banyak-beat"`.
   */
  if (beats.length > MAX_SCENE_BEATS * 3) {
    return { ok: false, reason: 'terlalu-banyak-beat' };
  }

  const latarSah = new Set(manifest.backgrounds.map((item) => item.assetId));
  const potretSah = new Set(manifest.portraits.map((item) => item.assetId));
  const npcSah = new Map(characters.map((item) => [item.npcId, item]));

  /*
   * Peta EKSPRESI -> POTRET, dibangun dari manifes.
   *
   * Model hanya diberi SATU potret per karakter (yang bawaan) dan daftar nama
   * ekspresi — tanpa pasangannya. Ia tidak punya cara mengetahui potret mana
   * yang mewakili "terkejut", sehingga ia memakai satu-satunya yang ia tahu:
   * potret bawaan. Terukur di produksi 11 Okt 2026: 8 kemunculan karakter,
   * **3 ekspresi berbeda**, tetapi **1 potret saja** — gambarnya tidak pernah
   * berganti meski ekspresinya berganti.
   *
   * Karena pasangannya sudah ADA di manifes, sistem yang memilihkannya. Yang
   * ditentukan model adalah MAKNA (ekspresi apa), yang ditentukan sistem adalah
   * BERKAS (potret mana). Model tidak lagi dapat salah memasangkan.
   */
  const potretUntuk = new Map<string, string>();
  for (const item of manifest.portraits) {
    const kunci = `${item.npcId}|${item.expression}`;
    if (!potretUntuk.has(kunci)) {
      potretUntuk.set(kunci, item.assetId);
    }
  }

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
        /*
         * Potret dipilih dari EKSPRESI, bukan dari yang dikirim model.
         *
         * Yang dikirim model hanya dipakai sebagai cadangan bila manifes tidak
         * punya potret untuk ekspresi itu — mis. dunia yang ekspresinya belum
         * diunggah gambarnya.
         */
        const potretCocok = potretUntuk.get(`${npc.npcId}|${ekspresi}`);
        const assetId =
          potretCocok ??
          (typeof peristiwa.assetId === 'string' && potretSah.has(peristiwa.assetId)
            ? peristiwa.assetId
            : undefined);
        if (!assetId) {
          return { ok: false, reason: 'asset-tidak-dikenal', detail: String(peristiwa.assetId) };
        }
        events.push({
          type: 'showCharacter',
          npcId: npc.npcId,
          // Keduanya dari DAFTAR, bukan dari model.
          expression: ekspresi,
          assetId,
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
        /*
         * ---------------------------------------------------------------------
         * STATUS DIPERIKSA, TIDAK DIPERCAYA BEGITU SAJA
         * ---------------------------------------------------------------------
         * Bentuk sebelumnya menulis `status: peristiwa.status as never` — satu
         * `as never` yang mematikan seluruh pemeriksaan tipe SEKALIGUS
         * memastikan tidak ada nilai yang diperiksa saat berjalan. Model bebas
         * menulis "marah", "suka", "tersinggung"; semuanya tersimpan, lalu di
         * layar pemain `coerceRelationStatus` mengubahnya menjadi "Belum
         * diketahui". Pemain melihat hubungannya tidak pernah berubah, dan tidak
         * ada satu pun galat di mana pun.
         *
         * Toleransinya sama dengan ekspresi dan npcId: bentuknya dinormalkan
         * (huruf kecil, spasi/tanda hubung dibuang), lalu harus PERSIS salah
         * satu nilai dari daftar. Yang tetap asing DIBUANG.
         *
         * Dibuang, BUKAN menolak adegan. Satu status keliru tidak boleh
         * menjatuhkan seluruh giliran ke simulator — itu pola "looping" yang
         * sudah empat kali menggigit proyek ini. Kehilangan satu perubahan
         * hubungan jauh lebih ringan daripada kehilangan seluruh adegan.
         */
        const statusSah = cocokkanStatus(peristiwa.status, vocabulary);
        if (!statusSah) {
          dibuang.push(`relationshipDelta status tidak dikenal (${String(peristiwa.status)})`);
          break;
        }
        const alasan = typeof peristiwa.reasonPublic === 'string' ? peristiwa.reasonPublic.trim() : '';
        /*
         * `reasonPublic` WAJIB — ia satu-satunya hal yang membuat perubahan
         * hubungan dapat dipercaya pemain (FR-19). Delta tanpa alasan hanya
         * memunculkan lencana status baru tanpa sebab, dan itu terbaca seperti
         * kesalahan. Mesin deterministik sudah menegakkan ini; mesin AI belum.
         */
        if (alasan.length === 0) {
          dibuang.push(`relationshipDelta tanpa reasonPublic (${statusSah})`);
          break;
        }
        events.push({
          type: 'relationshipDelta',
          npcId: idSah,
          status: statusSah,
          reasonPublic: alasan,
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
   * Pangkas kelebihan beat, JANGAN tolak adegannya.
   *
   * Model kadang menulis 11–12 beat padahal batasnya 10. Menolak seluruh adegan
   * hanya karena satu beat lebih membuat seluruh giliran jatuh ke simulator —
   * jauh lebih merugikan daripada kehilangan satu kalimat.
   */
  const pangkas = pangkasAdegan(events, MAX_SCENE_BEATS);
  dibuang.push(...pangkas.dibuang);

  /*
   * Bila SEMUA peristiwa dibuang, adegan ini tidak menyisakan apa pun untuk
   * ditampilkan — pemain akan melihat layar kosong. Dalam keadaan itu barulah
   * ditolak, supaya simulator yang mengambil alih.
   */
  if (pangkas.events.length === 0) {
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
  pangkas.events.push({
    type: 'presentChoices',
    decisionId: 'd1',
    prompt:
      typeof prompt === 'string' && prompt.trim().length > 0
        ? prompt.trim()
        : cadanganPertanyaan(responseLocale),
    options: [pilihan[0]!, pilihan[1]!, pilihan[2]!],
  });

  return { ok: true, events: pangkas.events, skipped: dibuang };
}

/**
 * Memangkas adegan yang melebihi batas beat, tanpa membuang yang penting.
 *
 * Yang dibuang lebih dulu adalah `narrate` dari TENGAH — bagian yang paling
 * tidak struktural: pembuka dan penutup sebuah adegan biasanya memuat latar dan
 * keadaan tokoh, sedangkan kalimat di tengah paling mudah hilang tanpa merusak
 * alurnya. `setBackground` dan `showCharacter` TIDAK PERNAH dibuang lebih dulu.
 *
 * Bila tidak ada lagi yang aman dibuang, adegan dibiarkan sedikit kelebihan —
 * lebih baik daripada mengembalikan adegan yang pincang.
 */
function pangkasAdegan(
  events: StoryEvent[],
  batas: number,
): { events: StoryEvent[]; dibuang: string[] } {
  if (events.length <= batas) {
    return { events, dibuang: [] };
  }

  const hasil = [...events];
  const dibuang: string[] = [];

  while (hasil.length > batas) {
    const tengah = Math.floor(hasil.length / 2);

    // `narrate` terdekat dari tengah lebih dulu.
    let idx = -1;
    for (let jauh = 0; jauh < hasil.length && idx < 0; jauh += 1) {
      for (const kandidat of [tengah - jauh, tengah + jauh]) {
        if (kandidat >= 0 && kandidat < hasil.length && hasil[kandidat]?.type === 'narrate') {
          idx = kandidat;
          break;
        }
      }
    }
    // Selanjutnya `relationshipDelta` — perubahannya masih tercatat di beat lain.
    if (idx < 0) {
      idx = hasil.findIndex((e) => e.type === 'relationshipDelta');
    }
    if (idx < 0) {
      break;
    }

    const [keluar] = hasil.splice(idx, 1);
    dibuang.push(`pangkas ${keluar?.type ?? '?'}`);
  }

  return { events: hasil, dibuang };
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
