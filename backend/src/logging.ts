/**
 * Log terstruktur.
 *
 * Aturan keras: log tidak boleh memuat isi cerita, tindakan pemain, nama, usia,
 * token sesi, atau kredensial (NFR-10, R-15). Yang boleh dicatat hanya metadata
 * teknis: rute, kode status, durasi, dan kode kesalahan.
 */

import pino, { type Logger } from 'pino';

/** Kunci yang tidak boleh muncul di log. Dipertahankan sebagai pengaman ganda. */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.customText',
  'req.body.detail',
  'req.body.persona.name',
  'res.headers["set-cookie"]',
  'databaseUrl',
  'password',
  'token',
];

export type LoggerOptions = {
  level: string;
  isProduction: boolean;
  /** Dipakai pengujian untuk menangkap keluaran tanpa mencetak ke stdout. */
  destination?: NodeJS.WritableStream;
};

export function createLogger(options: LoggerOptions): Logger {
  const base: pino.LoggerOptions = {
    level: options.level,
    redact: { paths: REDACTED_PATHS, censor: '[disunting]' },
    // Nama field dipendekkan agar log tetap terbaca di dashboard platform.
    base: { service: 'fayln-backend' },
  };

  // Di produksi log berupa JSON agar dapat dibaca mesin. Di lokal dibuat rapi.
  if (options.isProduction) {
    return options.destination ? pino(base, options.destination) : pino(base);
  }

  return pino({
    ...base,
    transport: options.destination
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
  });
}
