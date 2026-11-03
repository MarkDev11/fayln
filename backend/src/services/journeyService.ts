/**
 * Layanan perjalanan.
 *
 * Lapisan ini menyusun urutan yang benar antara idempotensi, kuota, pembuatan
 * cerita, validasi, penyimpanan, dan penagihan. Route hanya memanggil layanan ini.
 *
 * Urutan tersebut penting dan disengaja:
 *   1. Operasi yang sudah selesai dikembalikan apa adanya (FR-52).
 *   2. Poin DITAHAN secara atomik SEBELUM cerita dibuat (bukan sekadar
 *      diperiksa): pemeriksaan lalu penagihan belakangan membuat giliran
 *      paralel sama-sama lolos dan saldo menjadi negatif.
 *   3. Keluaran mesin divalidasi terhadap dunia SEBELUM disimpan (FR-55).
 *   4. Beat disimpan DAN poin ditagih dalam SATU transaksi; penagihan memakai
 *      operation_id yang sama, sehingga tidak dapat ganda.
 *
 * Ekonomi poin (docs/17): adegan PEMBUKA gratis; giliran ditagih tepat
 * SCENE_POINT_COST poin, hanya bila giliran benar-benar ditulis mesin AI.
 * Giliran yang jatuh ke simulator cadangan dan giliran yang gagal
 * (SUBMIT_FAILED) tidak ditagih — pemain tidak membayar untuk barang yang
 * tidak jadi.
 */

import { randomUUID } from 'node:crypto';

import { AppError, conflict, notFound, quotaExhausted, worldRetired } from '../contracts/errors';
import type {
  Beat,
  ContentRating,
  JourneyDetailDTO,
  JourneySessionDTO,
  JourneySummary,
  RelationEntry,
  ResponseLocale,
  TurnResultEnvelope,
  WorldDetailDTO,
} from '../contracts/types';
import type { CatalogRepository } from '../repositories/catalogRepository';
import type { JourneyRepository } from '../repositories/journeyRepository';
import type { OperationRepository } from '../repositories/operationRepository';
import type { PointReservation, UsageRepository } from '../repositories/usageRepository';
import { sanitizePlayerText } from './storyPrompt';
import {
  gantiPenandaBeats,
  karakterDenganEkspresiTampil,
  SIMULATOR_MODEL_ID,
  validateEngineBeats,
  type StoryContext,
  type StoryEngine,
  type StoryEngineResult,
} from './storyEngine';

/**
 * Beberapa beat terakhir, dirender menjadi baris teks pendek.
 *
 * Dipakai mengisi `StoryContext.recentBeats`. Tanpa ini prompt tidak punya
 * kesinambungan sama sekali: model tidak tahu apa yang baru saja terjadi, dan
 * satu-satunya penanda pilihan pemain (`playerAction`) juga kosong — sehingga
 * prompt jatuh ke cabang "Tulis ADEGAN PEMBUKA" dan menulis ulang pembuka.
 * Itulah "looping" yang dilihat pemain.
 *
 * Sengaja hanya ekor riwayat: konteks yang tumbuh tanpa batas akan jebol di
 * tengah cerita.
 */
function ringkasBeatTerakhir(beats: Beat[], jumlah = 12): string[] {
  const baris: string[] = [];
  for (const b of beats.slice(-jumlah)) {
    const e = b.event;
    switch (e.type) {
      case 'narrate':
        baris.push(e.text);
        break;
      case 'say':
        baris.push(`${e.npcId}: ${e.text}`);
        break;
      case 'playerInput':
        // Teks pemain masuk lagi ke prompt giliran berikutnya lewat sini, jadi
        // diperlakukan sama seperti masukan baru: satu baris, tanpa pembatas.
        baris.push(
          `[pemain ${e.inputKind === 'choice' ? 'memilih' : 'menulis'}: ${sanitizePlayerText(e.text)}]`,
        );
        break;
      case 'setBackground':
        baris.push(`[latar berpindah ke ${e.assetId}]`);
        break;
      case 'showCharacter':
        baris.push(`[${e.npcId} tampil, ekspresi ${e.expression}]`);
        break;
      case 'hideCharacter':
        baris.push(`[${e.npcId} pergi]`);
        break;
      case 'presentChoices':
        baris.push(`[pemain dihadapkan pada pilihan: ${e.prompt}]`);
        break;
      case 'relationshipDelta':
        baris.push(`[hubungan dengan ${e.npcId} menjadi ${e.status}]`);
        break;
      case 'endArc':
        baris.push(`[bab berakhir: ${e.reasonPublic}]`);
        break;
      default:
        break;
    }
  }
  return baris;
}

export type JourneyServiceDeps = {
  catalog: CatalogRepository;
  journeys: JourneyRepository;
  operations: OperationRepository;
  usage: UsageRepository;
  engine: StoryEngine;
  /**
   * Pemilih latar pembuka, atau null bila belum ada model yang dikonfigurasi.
   *
   * Port sempit dengan sengaja: layanan pemain tidak boleh bergantung pada
   * repositori panel admin. Yang dibutuhkan hanyalah satu fungsi.
   */
  pickOpeningBackground?: OpeningBackgroundPicker | null;
  newId: () => string;
  now: () => Date;
};

/**
 * Memilih latar adegan pembuka dari narasinya.
 *
 * Mengembalikan  yang ada di daftar, atau null bila gagal — pemanggilnya
 * lalu kembali ke tebakan mesin, yang setidaknya menghasilkan latar yang ada.
 */
export type OpeningBackgroundPicker = (
  narration: string,
  backgrounds: { assetId: string; label: string }[],
) => Promise<string | null>;

/** Umur minimum pembaca per rating konten. */
const MIN_AGE_BY_RATING: Record<ContentRating, number> = {
  all: 0,
  '13_plus': 13,
  '18_plus': 18,
};

export type CreateJourneyCommand = {
  operationId: string;
  accountId: string;
  /**
   * Umur yang dinyatakan akun, atau null bila tidak diisi / tidak diketahui.
   * Hanya klaim pemain sendiri, tetapi server tetap menegakkannya: batas yang
   * hanya ada di klien tidak menghalangi siapa pun.
   */
  accountAge?: number | null;
  worldId: string;
  persona: { name: string; age: number };
  responseLocale: ResponseLocale;
};

export type SubmitTurnCommand = {
  operationId: string;
  accountId: string;
  journeyId: string;
  decisionId: string;
  optionId?: string;
  customText?: string;
  responseLocale: ResponseLocale;
};

export type CreateJourneyResult = {
  journeyId: string;
  worldVersion: number;
  opening: TurnResultEnvelope;
};

export class JourneyService {
  /**
   * Apakah mesin yang terpasang simulator.
   *
   * Diumumkan supaya  dapat menyatakannya dari MESIN yang benar-benar
   * dijalankan, bukan dari konstanta yang ditulis tangan. Konstanta dapat berbeda
   * dari kenyataan — dan pemain berhak tahu apa yang sedang menulis ceritanya.
   */
  get engineIsSimulator(): boolean {
    return this.deps.engine.isSimulator;
  }

  constructor(private readonly deps: JourneyServiceDeps) {}

  /* ------------------------------------------------------------------ */
  /* Perjalanan                                                          */
  /* ------------------------------------------------------------------ */

  async createJourney(command: CreateJourneyCommand): Promise<CreateJourneyResult> {
    const cached = await this.replayIfDone(command.operationId, 'create_journey');
    if (cached) {
      const replayJourney = await this.deps.journeys.findById(cached.journeyId);
      return {
        journeyId: cached.journeyId,
        worldVersion: replayJourney?.world_version ?? 0,
        opening: cached,
      };
    }

    const world = await this.deps.catalog.findWorldVersion(command.worldId);
    if (!world) {
      throw notFound('Cerita tidak ditemukan.');
    }
    if (world.status !== 'published') {
      throw worldRetired();
    }

    // MVP: satu perjalanan aktif per dunia (D-12). Diperiksa sebelum klaim operasi
    // agar konflik tidak meninggalkan operasi yang menggantung.
    const existing = await this.deps.journeys.findByAccountAndWorld(
      command.accountId,
      command.worldId,
    );
    if (existing) {
      throw conflict('Kamu sudah punya perjalanan aktif di dunia ini.');
    }

    const detail = await this.deps.catalog.getWorldDetail(command.worldId, world.world_version);
    if (!detail) {
      throw notFound('Cerita tidak ditemukan.');
    }

    /*
     * Rating konten ditegakkan di SERVER.
     *
     * Persona wajib memenuhi umur minimum. Bila akun menyatakan umurnya, akun
     * juga wajib memenuhinya — kalau tidak, akun 14 tahun cukup mengisi persona
     * berumur 40 untuk membuka cerita 18+. Akun yang umurnya kosong hanya dinilai
     * dari persona; menolaknya sama sekali membuat pendaftaran tanpa umur tak
     * dapat membaca apa pun.
     */
    const minAge = MIN_AGE_BY_RATING[detail.contentRating] ?? 0;
    const accountTooYoung =
      command.accountAge !== undefined && command.accountAge !== null && command.accountAge < minAge;
    if (command.persona.age < minAge || accountTooYoung) {
      throw new AppError({
        code: 'VALIDATION',
        message: `Cerita ini untuk pembaca berusia ${String(minAge)} tahun ke atas.`,
        internalDetail: `rating=${detail.contentRating} personaAge=${String(command.persona.age)} accountAge=${String(command.accountAge ?? 'null')}`,
      });
    }

    // Adegan pembuka GRATIS (docs/17 bagian 3 butir 3): membuat perjalanan
    // tidak menuntut poin. Pemeriksaan kuota ada di giliran, bukan di sini —
    // pemain yang belum klaim hari ini tetap boleh memulai cerita.

    const claimed = await this.deps.operations.claim({
      operationId: command.operationId,
      accountId: command.accountId,
      journeyId: null,
      kind: 'create_journey',
    });
    if (!claimed) {
      // Ada permintaan bersamaan dengan operation_id sama; ambil hasilnya bila ada.
      const replay = await this.replayIfDone(command.operationId, 'create_journey');
      if (replay) {
        const replayJourney = await this.deps.journeys.findById(replay.journeyId);
        return {
          journeyId: replay.journeyId,
          worldVersion: replayJourney?.world_version ?? 0,
          opening: replay,
        };
      }
      throw conflict('Permintaan ini sedang diproses. Coba lagi sebentar lagi.');
    }

    const journeyId = `j_${randomUUID()}`;
    // ID turn dibuat SEBELUM mesin dipanggil, lalu diberikan sebagai awalan ID beat.
    // Dengan begitu ID beat unik secara global dan tidak bertabrakan dengan
    // pembukaan perjalanan lain (beats.beat_id adalah kunci utama tabel).
    const turnId = `t_${randomUUID()}`;

    try {
      /*
       * Latar pembuka dipilih MODEL, bukan ditebak mesin.
       *
       * Mesin cerita tidak memahami gambar, dan dua tebakannya sudah terbukti
       * salah di produksi: entri pertama menurut urutan master, lalu pencocokan
       * kata yang tertipu kata umum seperti "ruang". Model bahasa membaca
       * narasinya dan tahu "meja kerja, monitor, lantai 12" berarti kantor.
       *
       * Kegagalan di sini TIDAK menggagalkan perjalanan: `openingBackgroundAssetId`
       * dibiarkan kosong, dan mesin menebak seperti sebelumnya. Perjalanan yang
       * gagal dimulai jauh lebih buruk daripada latar yang kurang tepat.
       */
      let openingBackgroundAssetId: string | null = null;
      if (this.deps.pickOpeningBackground) {
        try {
          openingBackgroundAssetId = await this.deps.pickOpeningBackground(
            detail.premise,
            detail.assetManifest.backgrounds.map((item) => ({
              assetId: item.assetId,
              label: item.label,
            })),
          );
        } catch {
          openingBackgroundAssetId = null;
        }
      }

      const context: StoryContext = {
        worldTitle: detail.title,
        premise: detail.premise,
        openingBackgroundAssetId,
        /*
         * Nama lokasi pembuka, BUKAN id-nya.
         *
         * Manifest aset tidak memuat `location_id`; penghubungnya adalah nama
         * lokasi, yang disalin ke label latar saat latarnya dipungut. Mencocokkan
         * lewat nama karena itu, dan bila lokasi pembukanya tidak ditemukan,
         * mesin cerita kembali menebak seperti sebelumnya.
         */
        openingLocationId: detail.openingLocationId,
        openingLocationLabel:
          detail.locations.find((item) => item.locationId === detail.openingLocationId)?.label ??
          null,
        /*
         * Hanya ekspresi yang PUNYA POTRET yang diberikan ke model.
         *
         * Daftar nama ekspresi dan berkas potretnya disimpan terpisah, dan
         * ekspresi yang gambarnya belum diunggah tetap ada di daftar. Bila model
         * memilihnya, pencocokan potret meleset tanpa galat dan gambar jatuh ke
         * potret bawaan — narasi menulis satu hal, gambarnya menunjukkan hal
         * lain. Lihat `karakterDenganEkspresiTampil`.
         */
        characters: karakterDenganEkspresiTampil(detail.characters, detail.assetManifest),
        manifest: detail.assetManifest,
        personaName: command.persona.name,
        personaAge: command.persona.age,
        synopsis: detail.synopsis,
        // Bahasa pilihan pemain, dibawa sampai ke prompt.
        responseLocale: command.responseLocale,
        /*
         * Hubungan PEMBUKA: hubungan awal yang ditetapkan dunia.
         *
         * Adegan pembuka juga bisa mengubah hubungan (mis. perkenalan yang
         * langsung canggung). Tanpa keadaan awal, model menulis `relationshipDelta`
         * dari ketiadaan — dan `waspada` pada adegan pertama tidak berarti apa pun
         * bila pemain tidak tahu asalnya dari mana.
         */
        relations: detail.characters.map((character) => ({
          npcId: character.npcId,
          status: character.initialRelation,
          reasonPublic: 'Hubungan awal yang ditetapkan dunia.',
          updatedAtTurnId: '',
        })),
        /*
         * Kosakata hubungan VERSI DUNIA INI.
         *
         * Tanpa ini prompt tidak punya daftar status yang sah, dan seluruh
         * perubahan hubungan dibuang tanpa galat. Dibaca dari salinan yang
         * dibekukan saat versi ini terbit, bukan dari master yang sedang
         * berlaku — menyunting arti sebuah status di panel tidak boleh mengubah
         * perjalanan yang sudah berjalan.
         */
        relationVocabulary: await this.deps.journeys.relationshipVocabulary(
          world.world_id,
          world.world_version,
        ),
        turnOrdinal: 1,
        beatIdPrefix: turnId,
      };

      const generated = this.siapkan(await this.deps.engine.generateOpening(context), context);
      const issues = validateEngineBeats(generated.beats, context);
      if (issues.length > 0) {
        throw new AppError({
          code: 'INTERNAL',
          message: 'Cerita yang disusun tidak lolos pemeriksaan. Tidak ada yang disimpan.',
          internalDetail: issues.map((issue) => `${issue.beatId}: ${issue.reason}`).join(' | '),
        });
      }

      const baseline: RelationEntry[] = detail.characters.map((character) => ({
        npcId: character.npcId,
        status: character.initialRelation,
        reasonPublic: 'Hubungan awal yang ditetapkan dunia.',
        updatedAtTurnId: '',
      }));

      /*
       * Balapan dua permintaan DITANGANI, bukan dilaporkan sebagai galat.
       *
       * Pemeriksaan di atas dan penyisipan di sini tidak atomik: dua permintaan
       * yang datang bersamaan sama-sama lolos pemeriksaan, lalu satu kalah di
       * indeks unik `journeys_one_active_per_world`. Itu bukan keadaan luar biasa
       * — pemain menekan "Mulai" dua kali karena pembuatan perjalanan kini
       * menunggu model menulis adegan pembuka, dan itu terasa lama.
       *
       * Yang benar saat itu bukan "gagal", melainkan: perjalanannya SUDAH ADA.
       * Pemain mengirim ulang permintaan yang sama, jadi jawabannya pun sama —
       * perjalanan yang sudah dibuat, bukan galat yang menyuruh mencoba lagi.
       */
      try {
        await this.deps.journeys.create({
          journeyId,
          accountId: command.accountId,
          worldId: command.worldId,
          worldVersion: world.world_version,
          personaName: command.persona.name,
          personaAge: command.persona.age,
          responseLocale: command.responseLocale,
          baseline,
        });
      } catch (galat) {
        /*
         * Perjalanannya sudah ada — kembalikan yang itu, bukan galat.
         *
         * Pemain mengirim ulang permintaan yang sama, jadi jawabannya pun harus
         * sama: perjalanan yang sudah dibuat. "Coba lagi" akan selalu gagal, dan
         * itu pesan yang menyesatkan.
         */
        const kembar = await this.deps.journeys.findByAccountAndWorld(
          command.accountId,
          command.worldId,
        );
        if (!kembar) {
          throw galat;
        }

        const semuaBeat = await this.deps.journeys.beats(kembar.journey_id);
        const pembuka = semuaBeat[0]?.turnId ?? '';

        const envelope = await this.buildEnvelope({
          accountId: command.accountId,
          operationId: command.operationId,
          journeyId: kembar.journey_id,
          turnId: pembuka,
          revision: 0,
          modelId: 'idempotent',
          modelVersion: '1',
          usage: { promptTokens: 0, completionTokens: 0, chargedTotal: 0 },
        });

        return { journeyId: kembar.journey_id, worldVersion: kembar.world_version, opening: envelope };
      }

      const revision = await this.deps.journeys.appendTurn({
        turnId,
        journeyId,
        operationId: command.operationId,
        inputKind: 'opening',
        inputOptionId: null,
        beats: generated.beats,
        expectedTurnCount: 0,
      });

      /*
       * Adegan pembuka TIDAK ditagih (docs/17 bagian 3 butir 3).
       *
       * Token pemakaian mesin tetap dicatat di envelope untuk analitik, tetapi
       * tidak ada pemanggilan `charge` di jalur ini. Memasang kembali tagihan
       * di sini harus membuat tests/ekonomi-poin.test.ts memerah.
       */

      const envelope = await this.buildEnvelope({
        accountId: command.accountId,
        operationId: command.operationId,
        journeyId,
        turnId,
        revision,
        modelId: generated.modelId,
        modelVersion: generated.modelVersion,
        usage: generated.usage,
        simulator: this.deps.engine.isSimulator || generated.modelId === SIMULATOR_MODEL_ID,
      });

      await this.deps.operations.complete(command.operationId, envelope);
      return { journeyId, worldVersion: world.world_version, opening: envelope };
    } catch (error) {
      // Operasi gagal dilepas agar percobaan ulang dapat dikerjakan (FR-52).
      await this.releaseOperation(command.operationId, error);
      throw error;
    }
  }

  async listJourneys(accountId: string): Promise<JourneySummary[]> {
    return this.deps.journeys.listByAccount(accountId);
  }

  async journeyDetail(journeyId: string, accountId: string): Promise<JourneyDetailDTO> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);

    const detail = await this.deps.journeys.detail(journeyId);
    if (!detail) {
      throw notFound('Perjalanan tidak ditemukan.');
    }
    return detail;
  }

  /**
   * Membuka sesi bermain.
   *
   * `relationsBaseline` sengaja berisi hubungan SEBELUM beat mana pun, bukan
   * keadaan kanonik. Frontend menurunkan hubungan yang boleh dilihat dari beat
   * yang sudah dibaca; mengirim keadaan kanonik di sini akan membocorkan
   * perubahan dari beat yang belum dibaca (R-04, AC-12).
   */
  async openSession(journeyId: string, accountId: string): Promise<JourneySessionDTO> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);

    const session = await this.deps.journeys.sessionData(journeyId);
    if (!session || !journey) {
      throw notFound('Perjalanan tidak ditemukan.');
    }

    const world = await this.deps.catalog.getWorldDetail(journey.world_id, journey.world_version);
    if (!world) {
      throw worldRetired();
    }

    // `simulator` disebut DI SINI, dari mesin yang benar-benar terpasang — bukan
    // dari repository, yang hanya bisa menebak. Pola yang sama dengan `buildEnvelope`.
    return {
      ...session,
      simulator: this.deps.engine.isSimulator,
      // Bahasa dari PERJALANAN, bukan dari klien — nilai yang sama dengan yang
      // dipakai `submitTurn` saat menyusun cerita.
      responseLocale: journey.response_locale === 'en-US' ? 'en-US' : 'id-ID',
      world: world satisfies WorldDetailDTO,
    };
  }

  async syncReadProgress(
    journeyId: string,
    accountId: string,
    input: {
      lastReadSequence: number;
      lastReadBeatId: string;
      decisionCount: number;
      hasUnreadBeats: boolean;
    },
  ): Promise<void> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);
    await this.deps.journeys.syncReadProgress(journeyId, input);
  }

  /**
   * Keadaan satu operasi.
   *
   * Dipakai klien untuk menanyakan hasil operasi yang tertunda, misalnya setelah
   * permintaan pertama terputus sebelum balasannya diterima (FR-52).
   */
  async operationStatus(
    operationId: string,
    accountId: string,
  ): Promise<{
    operationId: string;
    state: 'running' | 'succeeded' | 'failed';
    result: TurnResultEnvelope | null;
    errorCode: string | null;
  }> {
    const operation = await this.deps.operations.find(operationId);
    // Milik akun lain dijawab sama persis dengan "tidak ada": id operasi dibuat
    // klien, dan hasilnya memuat isi cerita pemilik aslinya.
    if (!operation || operation.accountId !== accountId) {
      throw notFound('Operasi tidak ditemukan.');
    }
    return {
      operationId: operation.operationId,
      state: operation.state,
      result: operation.result,
      errorCode: operation.errorCode,
    };
  }

  async deleteJourney(journeyId: string, accountId: string): Promise<void> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);
    await this.deps.journeys.delete(journeyId);
  }

  /* ------------------------------------------------------------------ */
  /* Giliran                                                             */
  /* ------------------------------------------------------------------ */

  async submitTurn(command: SubmitTurnCommand): Promise<TurnResultEnvelope> {
    const kind = command.optionId ? 'submit_choice' : 'submit_custom';
    const cached = await this.replayIfDone(command.operationId, kind);
    if (cached) {
      return cached;
    }

    const journey = await this.deps.journeys.findById(command.journeyId);
    this.assertOwnership(journey, command.accountId);
    if (!journey) {
      throw notFound('Perjalanan tidak ditemukan.');
    }

    const world = await this.deps.catalog.getWorldDetail(journey.world_id, journey.world_version);
    if (!world) {
      throw worldRetired();
    }

    const claimed = await this.deps.operations.claim({
      operationId: command.operationId,
      accountId: command.accountId,
      journeyId: command.journeyId,
      kind,
    });
    if (!claimed) {
      const replay = await this.replayIfDone(command.operationId, kind);
      if (replay) {
        return replay;
      }
      throw conflict('Permintaan ini sedang diproses. Coba lagi sebentar lagi.');
    }

    /*
     * Poin yang ditahan untuk giliran ini. `null` berarti tidak ada yang perlu
     * dilepas — baik belum ditahan maupun sudah ditagih/dilepas. Pelepasan di
     * `catch` hanya boleh terjadi sekali, kalau tidak `reserved` milik giliran
     * lain ikut berkurang.
     */
    let reservation: PointReservation | null = null;

    try {
      const existingBeats = await this.deps.journeys.beats(command.journeyId);
      const pending = existingBeats.find(
        (beat) =>
          beat.event.type === 'presentChoices' &&
          beat.event.decisionId === command.decisionId &&
          !hasResolution(existingBeats, beat),
      );
      if (!pending) {
        throw conflict('Keputusan ini sudah dijawab atau tidak lagi berlaku.');
      }

      /*
       * LABEL opsi yang dipilih, bukan hanya id-nya.
       *
       * `aksiPemain()` di mesin cerita membaca `context.optionLabel` dan
       * `context.customText` — ia TIDAK melihat `optionId`. Sebelum ini yang
       * dikirim hanya `optionId`, sehingga `aksiPemain()` selalu mengembalikan
       * null. Akibatnya prompt jatuh ke cabang "Tulis ADEGAN PEMBUKA" dan model
       * menulis ulang pembuka setiap giliran: pertanyaan, latar, dan kalimatnya
       * berulang persis. Pilihan pemain tidak pernah sampai ke model.
       */
      const opsiTerpilih =
        pending.event.type === 'presentChoices'
          ? pending.event.options.find((opsi) => opsi.optionId === command.optionId)
          : undefined;
      if (command.optionId !== undefined && !opsiTerpilih) {
        throw conflict('Pilihan ini tidak lagi berlaku. Muat ulang perjalanan, lalu pilih lagi.');
      }

      /*
       * Ringkasan terakhir yang ditulis mesin sendiri (`memoryWrite`).
       *
       * Prompt punya bagian "RINGKASAN CERITA SEJAUH INI" yang selama ini selalu
       * kosong. Datanya sudah ada di beat — tidak perlu memanggil model lagi.
       */
      const ringkasanTerakhir = [...existingBeats]
        .reverse()
        .find((beat) => beat.event.type === 'memoryWrite');

      const turnId = `t_${randomUUID()}`;

      const context: StoryContext = {
        worldTitle: world.title,
        premise: world.premise,
        /*
         * Sama seperti adegan pembuka: hanya ekspresi berpotret yang ditawarkan
         * ke model, supaya gambar tidak pernah bertentangan dengan narasinya.
         */
        characters: karakterDenganEkspresiTampil(world.characters, world.assetManifest),
        manifest: world.assetManifest,
        personaName: journey.persona_name,
        personaAge: journey.persona_age,
        synopsis: world.synopsis,
        /*
         * Bahasa diambil dari PERJALANAN, bukan dari permintaan giliran.
         *
         * Nilainya ditetapkan sekali saat perjalanan dibuat, dan tidak boleh
         * berubah di tengah cerita — kalau bahasa bisa berganti per giliran,
         * satu perjalanan dapat bercampur dua bahasa.
         */
        responseLocale: journey.response_locale === 'en-US' ? 'en-US' : 'id-ID',
        turnOrdinal: countTurns(existingBeats) + 1,
        // Awalan unik: tanpa ini, giliran pertama setiap perjalanan menghasilkan
        // beat_id yang sama dan penyimpanan gagal pada kunci utama.
        beatIdPrefix: turnId,
        // Kesinambungan: ringkasan, ekor riwayat, dan pilihan pemain.
        storySoFar:
          ringkasanTerakhir && ringkasanTerakhir.event.type === 'memoryWrite'
            ? ringkasanTerakhir.event.summary
            : null,
        recentBeats: ringkasBeatTerakhir(existingBeats),
        /*
         * Keadaan hubungan yang BERLAKU SEKARANG, dari beat yang sudah di-commit.
         *
         * Tanpa ini model diminta memutuskan apakah seorang tokoh tersinggung
         * atau menyukai tindakan pemain tanpa tahu bagaimana hubungan mereka
         * sekarang — sehingga arah perubahannya tidak bermakna. `canonicalRelations`
         * sudah ada dan sudah benar (baseline ditimpa tiap `relationshipDelta`);
         * yang belum ada hanyalah jalur dari sana ke prompt.
         */
        relations: await this.deps.journeys.canonicalRelations(command.journeyId),
        /*
         * Kosakata hubungan versi dunia perjalanan ini, sama seperti pembuka.
         *
         * Ia dibaca ulang setiap giliran dari SALINAN yang dibekukan, bukan dari
         * master: penyuntingan arti sebuah status di panel hari ini tidak boleh
         * mengubah cara tokoh bersikap di perjalanan yang sudah berjalan.
         */
        relationVocabulary: await this.deps.journeys.relationshipVocabulary(
          journey.world_id,
          journey.world_version,
        ),
        ...(opsiTerpilih ? { optionLabel: opsiTerpilih.label } : null),
        ...(command.customText !== undefined ? { customText: command.customText } : null),
        ...(command.optionId !== undefined ? { optionId: command.optionId } : null),
      };

      /*
       * TAHAN poin sebelum memanggil model. Ini SATU pernyataan atomik, bukan
       * pemeriksaan yang diikuti penagihan belakangan; lihat `UsageRepository.reserve`.
       */
      const reserved = await this.deps.usage.reserve(command.accountId, this.deps.now());
      if (!reserved.ok) {
        throw await this.reserveFailure(command.accountId, reserved.reason);
      }
      reservation = reserved.reservation;

      const generated = this.siapkan(await this.deps.engine.generateTurn(context), context);
      const issues = validateEngineBeats(generated.beats, context);
      if (issues.length > 0) {
        throw new AppError({
          code: 'INTERNAL',
          message: 'Cerita yang disusun tidak lolos pemeriksaan. Tidak ada yang disimpan.',
          internalDetail: issues.map((issue) => `${issue.beatId}: ${issue.reason}`).join(' | '),
        });
      }

      const playerInputText = opsiTerpilih?.label ?? command.customText;
      if (playerInputText === undefined) {
        throw conflict('Masukan pemain tidak tersedia. Muat ulang perjalanan, lalu coba lagi.');
      }

      const committedBeats: Beat[] = [
        {
          beatId: `${turnId}-b001`,
          turnId,
          sequence: 1,
          event: {
            type: 'playerInput',
            inputKind: command.optionId ? 'choice' : 'custom',
            text: playerInputText,
          },
        },
        ...generated.beats.map((beat, index) => {
          const sequence = index + 2;
          return {
            ...beat,
            beatId: `${turnId}-b${String(sequence).padStart(3, '0')}`,
            turnId,
            sequence,
          };
        }),
      ];

      /*
       * Tagih hanya bila giliran ini benar-benar ditulis MESIN AI (docs/17
       * bagian 3 butir 3).
       *
       * Dua keadaan sengaja tidak ditagih:
       *   - mesin yang terpasang simulator (mode uji/rudi);
       *   - mesin AI menyerahkan giliran ini ke simulator cadangan
       *     (modelId === SIMULATOR_MODEL_ID).
       * Pemain tidak membayar untuk barang yang tidak jadi — poin yang ditahan
       * dilepas. Jalur yang gagal tidak pernah sampai ke sini; galatnya
       * ditangkap di bawah dan reservasinya dilepas.
       *
       * Untuk giliran yang ditagih, penagihan berjalan DI DALAM transaksi
       * penyimpanan beat: keduanya berhasil bersama atau batal bersama.
       */
      const simulatorTurn =
        this.deps.engine.isSimulator || generated.modelId === SIMULATOR_MODEL_ID;
      const held = reservation;

      const revision = await this.deps.journeys.appendTurn(
        {
          turnId,
          journeyId: command.journeyId,
          operationId: command.operationId,
          inputKind: command.optionId ? 'option' : 'custom',
          inputOptionId: command.optionId ?? null,
          beats: committedBeats,
          expectedTurnCount: countTurns(existingBeats),
        },
        simulatorTurn
          ? undefined
          : async (client) => {
              await this.deps.usage.settleReservation(client, {
                reservation: held,
                operationId: command.operationId,
                entryId: `ue_${randomUUID()}`,
                promptTokens: generated.usage.promptTokens,
                completionTokens: generated.usage.completionTokens,
              });
            },
      );

      if (simulatorTurn) {
        reservation = null;
        await this.deps.usage.release(held);
      } else {
        // Sudah ditagih di dalam transaksi; tidak ada yang tersisa untuk dilepas.
        reservation = null;
      }

      const envelope = await this.buildEnvelope({
        accountId: command.accountId,
        operationId: command.operationId,
        journeyId: command.journeyId,
        turnId,
        revision,
        modelId: generated.modelId,
        modelVersion: generated.modelVersion,
        usage: generated.usage,
        simulator: this.deps.engine.isSimulator || generated.modelId === SIMULATOR_MODEL_ID,
      });

      await this.deps.operations.complete(command.operationId, envelope);
      return envelope;
    } catch (error) {
      if (reservation) {
        try {
          await this.deps.usage.release(reservation);
        } catch {
          // Gagal melepas tidak boleh menutupi galat aslinya.
        }
      }
      await this.releaseOperation(command.operationId, error);
      throw error;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Internal                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Menyiapkan keluaran mesin sebelum dipakai lebih jauh.
   *
   * Penanda nama (`@user`, `@rina`) diganti di SINI — sekali, untuk SEMUA jalur.
   * Sebelumnya tidak ada yang menggantinya sama sekali, sehingga pemain melihat
   * `@user` mentah di layar padahal namanya sudah diisi di lembar persona.
   * Diletakkan di satu fungsi supaya jalur yang ditulis nanti tidak dapat lupa.
   */
  /**
   * Menandai operasi gagal lalu melepasnya supaya dapat dicoba ulang.
   *
   * Galat pembersihan DITELAN: pemanggilnya sedang melempar galat yang
   * sebenarnya, dan galat sekunder dari sini tidak boleh menggantikannya —
   * pemain dan log harus melihat sebab aslinya, bukan akibat pembersihannya.
   */
  private async releaseOperation(operationId: string, cause: unknown): Promise<void> {
    try {
      await this.deps.operations.fail(operationId, toErrorCode(cause));
      await this.deps.operations.releaseFailed(operationId);
    } catch {
      // Klaim yang tertinggal diambil alih setelah STALE_CLAIM_MS.
    }
  }

  private siapkan(hasil: StoryEngineResult, context: StoryContext): StoryEngineResult {
    return { ...hasil, beats: gantiPenandaBeats(hasil.beats, context) };
  }

  private async replayIfDone(
    operationId: string,
    expectedKind: string,
  ): Promise<TurnResultEnvelope | null> {
    const operation = await this.deps.operations.find(operationId);
    if (!operation || operation.kind !== expectedKind) {
      return null;
    }
    if (operation.state === 'succeeded' && operation.result) {
      return operation.result;
    }
    return null;
  }

  /**
   * Galat untuk penahanan poin yang ditolak (FR-50).
   *
   * Sejak ekonomi poin (docs/17), biaya satu giliran adalah ANGKA PASTI dari
   * konfigurasi (`SCENE_POINT_COST`, bawaan 10), bukan estimasi token mesin.
   * Tanpa klaim harian, `available` memang 0 — dan pesannya mengarahkan
   * pemain ke popup klaim, bukan sekadar "coba lagi besok".
   */
  private async reserveFailure(
    accountId: string,
    reason: 'insufficient' | 'global-cap',
  ): Promise<AppError> {
    if (reason === 'global-cap') {
      return new AppError({
        code: 'MAINTENANCE',
        message: 'Layanan cerita sedang sangat padat hari ini. Coba lagi besok.',
        retryable: false,
        internalDetail: 'GLOBAL_DAILY_POINT_CAP tercapai.',
      });
    }

    const usage = await this.deps.usage.usage(accountId, this.deps.now());
    return quotaExhausted(
      usage.claimableToday
        ? 'Sisa poinmu belum cukup untuk melanjutkan cerita. Klaim poin harianmu dulu dari Beranda — gratis, sekali sehari.'
        : 'Sisa poin harianmu sudah habis. Riwayat dan pengaturan tetap bisa dibuka; poin baru bisa diklaim besok.',
    );
  }

  private async buildEnvelope(input: {
    accountId: string;
    operationId: string;
    journeyId: string;
    turnId: string;
    revision: number;
    modelId: string;
    modelVersion: string;
    usage: { promptTokens: number; completionTokens: number; chargedTotal: number };
    /** Sumber giliran aktual; AI dapat menyerahkan giliran tertentu ke simulator. */
    simulator?: boolean;
  }): Promise<TurnResultEnvelope> {
    const allBeats = await this.deps.journeys.beats(input.journeyId);
    const beats: Beat[] = allBeats.filter((beat) => beat.turnId === input.turnId);

    // Anggaran dibaca SETELAH penagihan, sehingga angka yang dikirim ke pemain
    // adalah sisa yang sebenarnya, bukan perkiraan.
    const usage = await this.deps.usage.usage(input.accountId, this.deps.now());

    return {
      operationId: input.operationId,
      journeyId: input.journeyId,
      turnId: input.turnId,
      revision: input.revision,
      beats,
      usage: input.usage,
      memory: await this.deps.journeys.memorySnapshot(input.journeyId),
      budget: {
        availableAfter: usage.available,
        allowanceLimit: usage.allowanceLimit,
        resetAt: usage.resetAt,
      },
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      simulator: input.simulator ?? this.deps.engine.isSimulator,
    };
  }

  private assertOwnership(
    journey: { account_id: string } | null,
    accountId: string,
  ): asserts journey is { account_id: string } {
    if (!journey) {
      throw notFound('Perjalanan tidak ditemukan.');
    }
    if (journey.account_id !== accountId) {
      // Sengaja memakai NOT_FOUND, bukan FORBIDDEN: keberadaan perjalanan milik
      // akun lain tidak boleh terbaca dari kode kesalahan.
      throw notFound('Perjalanan tidak ditemukan.');
    }
  }
}

/** Giliran baru dihitung dari jumlah keputusan yang sudah ada. */
function countTurns(beats: Beat[]): number {
  const turnIds = new Set(beats.map((beat) => beat.turnId));
  return turnIds.size;
}

/** Keputusan dianggap sudah dijawab bila ada turn setelahnya di perjalanan. */
function hasResolution(beats: Beat[], decisionBeat: Beat): boolean {
  const index = beats.findIndex((beat) => beat.beatId === decisionBeat.beatId);
  if (index === -1) {
    return false;
  }
  return beats.slice(index + 1).some((beat) => beat.turnId !== decisionBeat.turnId);
}

function toErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    return error.code;
  }
  return 'INTERNAL';
}

export type { TurnResultEnvelope };
