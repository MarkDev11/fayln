/**
 * Telemetri nonteks.
 *
 * Aturan keras (NFR-10, R-15, docs/10 §4):
 * - TIDAK boleh memuat isi dialog, draft pemain, nama, usia mentah, token sesi,
 *   atau rahasia dunia.
 * - Hanya nama peristiwa, hasil operasi, dan metadata teknis.
 *
 * Implementasi saat ini menulis ke buffer dalam memori dan meneruskan ke sink
 * yang dapat diganti. Tidak ada pengiriman jaringan sampai backend siap.
 */

export type TelemetryEvent =
  | 'screen_view'
  | 'catalog_search'
  | 'catalog_filter_apply'
  | 'world_detail_view'
  | 'journey_start_requested'
  | 'journey_start_result'
  | 'journey_continue_requested'
  | 'journey_delete_requested'
  | 'journey_delete_result'
  | 'decision_committed'
  | 'auto_toggled'
  | 'log_opened'
  | 'settings_changed'
  | 'gateway_error';

export type TelemetryPayload = {
  /** Nama layar atau rute; bukan judul cerita. */
  screen?: string;
  /** Jumlah hasil, durasi, atau hitungan teknis. */
  count?: number;
  /** Kode kesalahan gateway, bukan pesan mentah. */
  errorCode?: string;
  /** Nama pengaturan yang berubah, bukan nilainya bila nilainya sensitif. */
  setting?: string;
  /** Penanda mode simulator. */
  simulator?: boolean;
};

export type TelemetrySink = (event: TelemetryEvent, payload: TelemetryPayload) => void;

/** Kunci yang dilarang muncul di payload. Dipertahankan sebagai pengaman ganda. */
const FORBIDDEN_KEYS = [
  'text',
  'dialogue',
  'narration',
  'draft',
  'name',
  'age',
  'persona',
  'token',
  'secret',
  'prompt',
  'customText',
  'email',
] as const;

export function sanitizePayload(payload: TelemetryPayload): TelemetryPayload {
  const entries = Object.entries(payload).filter(
    ([key]) => !(FORBIDDEN_KEYS as readonly string[]).includes(key),
  );
  return Object.fromEntries(entries) as TelemetryPayload;
}

class TelemetryClient {
  private sink: TelemetrySink | null = null;
  private readonly buffer: { event: TelemetryEvent; payload: TelemetryPayload; at: string }[] = [];
  private readonly maxBuffer = 200;

  setSink(sink: TelemetrySink | null): void {
    this.sink = sink;
  }

  track(event: TelemetryEvent, payload: TelemetryPayload = {}): void {
    const safe = sanitizePayload(payload);
    const record = { event, payload: safe, at: new Date().toISOString() };

    this.buffer.push(record);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }

    this.sink?.(event, safe);
  }

  /** Dipakai pengujian untuk memastikan tidak ada data sensitif yang tercatat. */
  snapshot(): readonly { event: TelemetryEvent; payload: TelemetryPayload; at: string }[] {
    return this.buffer;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}

export const telemetry = new TelemetryClient();
