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
  JourneyDetailDTO,
  JourneySummary,
  TurnResultEnvelope,
  UsageDTO,
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
} from '../gateway';

export type HttpGatewayConfig = {
  /** Alamat dasar API, mis. `https://fayln-api.marky.blitz.cloud`. */
  baseUrl: string;
  /**
   * ID akun yang dikirim pada header `x-account-id`, atau penyedia yang
   * menghasilkannya secara asinkron.
   *
   * Penyedia diperlukan karena identitas perangkat disimpan di penyimpanan aman
   * yang bersifat asinkron, sedangkan gateway harus dapat dibuat segera agar
   * pohon komponen tidak perlu menunggu.
   */
  accountId: string | (() => Promise<string>);
  /** Disuntikkan pengujian. */
  fetchImpl?: typeof globalThis.fetch;
  /** Batas waktu dalam milidetik. Bawaan 20 detik. */
  timeoutMs?: number;
};

type MetaResponse = { storyEngine?: { simulator?: boolean } };

export class HttpStoryGateway implements StoryGateway {
  private readonly baseUrl: string;
  private readonly accountIdProvider: string | (() => Promise<string>);
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  /** Menyimpan hasil penyedia supaya penyimpanan tidak dibaca setiap permintaan. */
  private resolvedAccountId: string | null = null;

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
    if (typeof config.accountId === 'string') {
      this.resolvedAccountId = config.accountId;
    }
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
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

  async fetchWorld(worldId: string): Promise<WorldDetailDTO> {
    return this.request<WorldDetailDTO>(`/v1/worlds/${encodeURIComponent(worldId)}`, {
      method: 'GET',
    });
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

  private async request<T>(
    path: string,
    options: { method: string; body?: unknown },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const accountId = await this.resolveAccountId();

      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          accept: 'application/json',
          'x-account-id': accountId,
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
      clearTimeout(timer);
    }
  }

  private async resolveAccountId(): Promise<string> {
    if (this.resolvedAccountId) {
      return this.resolvedAccountId;
    }
    if (typeof this.accountIdProvider === 'string') {
      this.resolvedAccountId = this.accountIdProvider;
      return this.resolvedAccountId;
    }
    this.resolvedAccountId = await this.accountIdProvider();
    return this.resolvedAccountId;
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
