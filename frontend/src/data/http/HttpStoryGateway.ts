/**
 * Gateway HTTP ke backend fayLN.
 *
 * Implementasi ini yang menggantikan `MockStoryGateway` ketika aplikasi diarahkan
 * ke backend sungguhan. Tidak ada satu pun komponen layar yang berubah: mereka
 * tetap hanya berbicara dengan antarmuka `StoryGateway` (NFR-15).
 *
 * Hal yang sengaja dijaga di sini:
 * - Kesalahan server dipetakan ke `StoryGatewayError` dengan kode yang sama,
 *   sehingga lembar galat di UI menampilkan pesan yang tepat.
 * - Kegagalan jaringan menjadi kode `NETWORK`, bukan `UNKNOWN`.
 * - Permintaan yang mengubah keadaan selalu membawa `clientOperationId`, karena
 *   idempotensi ditegakkan server berdasar nilai itu (FR-52).
 * - Penanda simulator dibaca dari `/v1/meta`, bukan dikarang, sehingga UI tidak
 *   pernah mengklaim AI sungguhan (NFR-16).
 */

import type {
  Beat,
  GenreOption,
  JourneyDetailDTO,
  JourneySummary,
  TurnResultEnvelope,
  UsageDTO,
  WorldCatalogItem,
  WorldDetailDTO,
} from '@/domain/types';

import {
  StoryGatewayError,
  type CatalogPage,
  type CatalogQuery,
  type CreateJourneyInput,
  type CreateJourneyResult,
  type JourneySession,
  type OperationStatus,
  type ReadProgressInput,
  type ReportInput,
  type ReportResult,
  type StoryGateway,
  type SubmitChoiceInput,
  type SubmitCustomInput,
  type TopWorldsPage,
  type UpdatedWorldItem,
} from '../gateway';

export type HttpGatewayConfig = {
  /** Alamat dasar API, mis. `https://fayln-api.marky.blitz.cloud`. */
  baseUrl: string;
  /**
   * Token sesi pemain, atau penyedia yang menghasilkannya secara asinkron.
   *
   * Menggantikan `x-account-id` sejak 9 Oktober 2026. Server membuktikan token
   * ini terhadap tabel sesi; nilai `null` berarti pemain belum masuk, dan
   * permintaan akan dijawab 401 — yang memang diinginkan.
   *
   * Penyedia diperlukan karena token dibaca dari penyimpanan perangkat yang
   * bersifat asinkron, sedangkan gateway harus dapat dibuat segera agar pohon
   * komponen tidak perlu menunggu.
   */
  accountId: string | (() => Promise<string | null>);
  /** Disuntikkan pengujian. */
  fetchImpl?: typeof globalThis.fetch;
  /** Batas waktu dalam milidetik. Bawaan 20 detik. */
  timeoutMs?: number;
};

type MetaResponse = { storyEngine?: { simulator?: boolean } };

/**
 * Anggaran waktu untuk rute yang menyusun adegan lewat model cerita.
 *
 * Terukur 9 Oktober 2026 terhadap API produksi: membuat perjalanan butuh
 * 19,1–24,0 detik (tiga kali pengukuran). Batas bawaan 20 detik karena itu
 * memutus permintaan yang sebenarnya akan berhasil — pengguna melihat
 * "Perjalanan gagal dibuat" padahal server mengembalikan 201.
 *
 * 90 detik memberi ruang bagi model yang sedang lambat tanpa membiarkan
 * antarmuka menggantung selamanya. Rute baca tetap memakai batas bawaan.
 */
const STORY_GENERATION_TIMEOUT_MS = 90_000;

export class HttpStoryGateway implements StoryGateway {
  private readonly baseUrl: string;
  private readonly accountIdProvider: string | (() => Promise<string | null>);
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  /**
   * Penanda simulator. Nilai awalnya `true` karena itu pilihan yang aman: bila
   * `/v1/meta` belum sempat dibaca, UI akan menganggap cerita berasal dari
   * simulator, bukan mengklaim AI sungguhan.
   */
  private simulator: boolean = true;

  constructor(config: HttpGatewayConfig) {
    // Buang garis miring di akhir agar tidak menjadi alamat ganda.
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.accountIdProvider = config.accountId;
    /*
     * WAJIB diikat ke `globalThis`.
     *
     * `fetchImpl` dipanggil sebagai metode (`this.fetchImpl(...)`), sehingga
     * `this`-nya adalah objek gateway ini. Di web, `fetch` adalah API native
     * yang menolak penerima selain Window: ia melempar "Illegal invocation"
     * SEBELUM permintaan dikirim. Gejalanya menipu — tidak ada permintaan
     * jaringan sama sekali, dan galatnya terbaca sebagai kegagalan jaringan
     * sehingga UI menampilkan "Kamu sedang offline" padahal server sehat.
     *
     * Cacat ini tidak pernah muncul selama pengembangan web memakai gateway
     * contoh, karena gateway itu tidak menyentuh `fetch` sama sekali.
     *
     * `config.fetchImpl` sengaja TIDAK diikat: pengujian menyuntikkan fungsi
     * biasa, dan mengikatnya akan mengubah perilaku yang mereka andalkan.
     */
    this.fetchImpl =
      config.fetchImpl ??
      (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : globalThis.fetch);
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  get isSimulator(): boolean {
    return this.simulator;
  }

  /** Membaca penanda simulator dari server. Aman dipanggil berulang. */
  async refreshMeta(): Promise<void> {
    try {
      const meta = await this.request<MetaResponse>('/v1/meta', { method: 'GET' });
      this.simulator = meta.storyEngine?.simulator ?? true;
    } catch {
      // Gagal membaca meta tidak boleh merusak aplikasi; penanda tetap aman.
    }
  }

  /* ---------------------------------------------------------------- */
  /* Katalog                                                            */
  /* ---------------------------------------------------------------- */

  async fetchCatalog(query: CatalogQuery): Promise<CatalogPage> {
    const params = new URLSearchParams();
    if (query.search) {
      params.set('search', query.search);
    }
    if (query.genres && query.genres.length > 0) {
      params.set('genres', query.genres.join(','));
    }
    if (query.page !== undefined) {
      params.set('page', String(query.page));
    }
    if (query.pageSize !== undefined) {
      params.set('pageSize', String(query.pageSize));
    }

    const suffix = params.toString();
    return this.request<CatalogPage>(`/v1/worlds${suffix ? `?${suffix}` : ''}`, { method: 'GET' });
  }

  /**
   * Daftar genre dari server.
   *
   * Responsnya `{ items }`, sama seperti rail. Bila server mengembalikan bentuk
   * lain (mis. larik telanjang), yang dikembalikan adalah larik kosong — bukan
   * galat. Chip genre yang hilang jauh lebih ringan akibatnya daripada layar
   * Beranda yang gagal tampil karena satu bidang pendamping.
   */
  async fetchGenres(): Promise<GenreOption[]> {
    const body = await this.request<{ items?: GenreOption[] }>('/v1/genres', { method: 'GET' });
    return Array.isArray(body.items) ? body.items : [];
  }

  async fetchWorld(worldId: string): Promise<WorldDetailDTO> {
    return this.request<WorldDetailDTO>(`/v1/worlds/${encodeURIComponent(worldId)}`, {
      method: 'GET',
    });
  }

  async fetchTopWorlds(limit = 10): Promise<TopWorldsPage> {
    return this.request<TopWorldsPage>(`/v1/worlds/top?limit=${String(limit)}`, { method: 'GET' });
  }

  async fetchNewWorlds(limit = 10): Promise<WorldCatalogItem[]> {
    const response = await this.request<{ items: WorldCatalogItem[] }>(
      `/v1/worlds/new?limit=${String(limit)}`,
      { method: 'GET' },
    );
    return response.items;
  }

  /** Rail "Baru Diperbarui": diurutkan server menurut waktu revisi terakhir. */
  async fetchUpdatedWorlds(limit = 10): Promise<UpdatedWorldItem[]> {
    const response = await this.request<{ items: UpdatedWorldItem[] }>(
      `/v1/worlds/updated?limit=${String(limit)}`,
      { method: 'GET' },
    );
    return response.items;
  }

  /* ---------------------------------------------------------------- */
  /* Perjalanan                                                          */
  /* ---------------------------------------------------------------- */

  async fetchJourneys(): Promise<JourneySummary[]> {
    const response = await this.request<{ items: JourneySummary[] }>('/v1/journeys', {
      method: 'GET',
    });
    return response.items ?? [];
  }

  async fetchJourneyDetail(journeyId: string): Promise<JourneyDetailDTO> {
    return this.request<JourneyDetailDTO>(`/v1/journeys/${encodeURIComponent(journeyId)}`, {
      method: 'GET',
    });
  }

  async openJourneySession(journeyId: string): Promise<JourneySession> {
    return this.request<JourneySession>(`/v1/journeys/${encodeURIComponent(journeyId)}/session`, {
      method: 'GET',
    });
  }

  async createJourney(input: CreateJourneyInput): Promise<CreateJourneyResult> {
    return this.request<CreateJourneyResult>('/v1/journeys', {
      method: 'POST',
      timeoutMs: STORY_GENERATION_TIMEOUT_MS,
      body: {
        clientOperationId: input.clientOperationId,
        worldId: input.worldId,
        persona: input.persona,
        responseLocale: input.responseLocale,
      },
    });
  }

  async deleteJourney(journeyId: string): Promise<void> {
    await this.request<void>(`/v1/journeys/${encodeURIComponent(journeyId)}`, {
      method: 'DELETE',
    });
  }

  async syncReadProgress(input: ReadProgressInput): Promise<void> {
    await this.request<void>(`/v1/journeys/${encodeURIComponent(input.journeyId)}/progress`, {
      method: 'PUT',
      body: {
        lastReadSequence: input.lastReadSequence,
        lastReadBeatId: input.lastReadBeatId,
        decisionCount: input.decisionCount,
        hasUnreadBeats: input.hasUnreadBeats,
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* Giliran                                                             */
  /* ---------------------------------------------------------------- */

  async submitChoice(input: SubmitChoiceInput): Promise<TurnResultEnvelope> {
    return this.postTurn(input, { selection: { optionId: input.optionId } });
  }

  async submitCustom(input: SubmitCustomInput): Promise<TurnResultEnvelope> {
    return this.postTurn(input, { customText: input.customText });
  }

  private async postTurn(
    input: { clientOperationId: string; journeyId: string; decisionId: string; responseLocale: 'id-ID' | 'en-US' },
    extra: { selection?: { optionId: string }; customText?: string },
  ): Promise<TurnResultEnvelope> {
    return this.request<TurnResultEnvelope>(
      `/v1/journeys/${encodeURIComponent(input.journeyId)}/turns`,
      {
        method: 'POST',
        timeoutMs: STORY_GENERATION_TIMEOUT_MS,
        body: {
          clientOperationId: input.clientOperationId,
          decisionId: input.decisionId,
          responseLocale: input.responseLocale,
          ...extra,
        },
      },
    );
  }

  async fetchOperation(operationId: string): Promise<OperationStatus> {
    return this.request<OperationStatus>(`/v1/operations/${encodeURIComponent(operationId)}`, {
      method: 'GET',
    });
  }

  /* ---------------------------------------------------------------- */
  /* Paket dan laporan                                                   */
  /* ---------------------------------------------------------------- */

  async fetchUsage(): Promise<UsageDTO> {
    return this.request<UsageDTO>('/v1/usage', { method: 'GET' });
  }

  async submitReport(input: ReportInput): Promise<ReportResult> {
    return this.request<ReportResult>('/v1/reports', {
      method: 'POST',
      body: {
        clientOperationId: input.clientOperationId,
        category: input.category,
        detail: input.detail,
        ...(input.journeyId !== undefined ? { journeyId: input.journeyId } : null),
        ...(input.beatId !== undefined ? { beatId: input.beatId } : null),
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* Internal                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Mengirim satu permintaan.
   *
   * `timeoutMs` dapat ditimpa per panggilan. Rute yang menyentuh model cerita
   * (membuat perjalanan, mengirim giliran) perlu anggaran lebih besar daripada
   * rute baca biasa: menyusun satu adegan penuh butuh belasan detik, sedangkan
   * katalog hanya membaca baris basis data.
   */
  private async request<T>(
    path: string,
    options: { method: string; body?: unknown; timeoutMs?: number },
  ): Promise<T> {
    const controller = new AbortController();

    /*
     * Penghitung waktu dipasang SETELAH identitas akun diselesaikan, bukan sebelum.
     *
     * Alasannya: `resolveAccountId()` dapat menyentuh penyimpanan aman secara
     * asinkron. Bila penghitung sudah berjalan sejak awal, waktu yang dipakai
     * membuka penyimpanan ikut termakan oleh batas waktu permintaan — dan rute
     * lambat (membuat perjalanan) menjadi gagal hanya karena perangkat lambat,
     * bukan karena server tidak menjawab. Gejalanya menipu: pesan yang muncul
     * adalah "Tidak dapat menghubungi server", padahal server sehat.
     */
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      /*
       * Token sesi, bukan id akun.
       *
       * Identitas tidak lagi berupa klaim yang dikirim klien — server membuktikan
       * token terhadap tabel sesi. Bila belum ada token, header `Authorization`
       * tidak dikirim sama sekali, dan server akan menjawab 401. Itu memang yang
       * diinginkan: permintaan tanpa identitas harus gagal, bukan dilayani
       * sebagai akun demo seperti sebelumnya.
       */
      const token = await this.resolveAccountId();

      timer = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);

      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          accept: 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : null),
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : null),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : null),
        signal: controller.signal,
      });

      // Balasan tanpa isi (204) tidak boleh diurai sebagai JSON.
      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      const payload = text.length > 0 ? tryParseJson(text) : null;

      if (!response.ok) {
        throw this.toGatewayError(response.status, payload);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof StoryGatewayError) {
        throw error;
      }
      // Batas waktu dan kegagalan jaringan: keduanya dapat dicoba ulang.
      throw new StoryGatewayError({
        code: 'NETWORK',
        message: 'Tidak dapat menghubungi server. Periksa koneksi, lalu coba lagi.',
        retryable: true,
      });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Mengembalikan token sesi yang berlaku.
   *
   * TIDAK di-cache di tingkat instance. Versi sebelumnya menyimpan id akun di
   * `resolvedAccountId` supaya penyimpanan tidak dibaca berulang — tetapi untuk
   * token, cache itu menjadi salah begitu pemain keluar lalu masuk dengan akun
   * lain: permintaan berikutnya masih membawa token LAMA, dan pemain melihat
   * perjalanan akun sebelumnya. `authSession.ts` sudah memoized pembacaannya,
   * jadi tidak ada pembacaan mahal yang perlu dihindari di sini.
   */
  private async resolveAccountId(): Promise<string | null> {
    if (typeof this.accountIdProvider === 'string') {
      return this.accountIdProvider;
    }
    return this.accountIdProvider();
  }

  private toGatewayError(status: number, payload: unknown): StoryGatewayError {
    // Bentuk kesalahan server: { code, message, retryable, retryAfterSec? }
    if (payload && typeof payload === 'object') {
      const body = payload as Record<string, unknown>;
      const code = typeof body.code === 'string' ? body.code : 'UNKNOWN';
      const message =
        typeof body.message === 'string'
          ? body.message
          : 'Permintaan tidak dapat diproses.';
      return new StoryGatewayError({
        code,
        message,
        retryable: body.retryable === true,
        ...(typeof body.retryAfterSec === 'number' ? { retryAfterSec: body.retryAfterSec } : null),
        ...(typeof body.blockedUntil === 'string' ? { blockedUntil: body.blockedUntil } : null),
      });
    }

    return new StoryGatewayError({
      code: status === 404 ? 'NOT_FOUND' : 'UNKNOWN',
      message: 'Permintaan tidak dapat diproses.',
      retryable: status >= 500,
    });
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Dipakai pengujian untuk memastikan bentuk beat tidak menyimpang. */
export type { Beat };
