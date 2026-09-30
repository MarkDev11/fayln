/**
 * Kode kesalahan yang dipakai backend.
 *
 * Nilainya HARUS sama dengan `frontend/src/domain/types.ts`. Frontend memetakan
 * setiap kode ke pesan yang berbeda; kode yang tidak dikenal jatuh ke pesan umum,
 * jadi menambah kode di sini tanpa menambah penanganan di frontend tidak akan
 * merusak apa pun — tetapi juga tidak akan tampil spesifik.
 */

export const ERROR_CODES = [
  'NETWORK',
  'UNAUTHORIZED',
  'VALIDATION',
  'CONFLICT',
  'NOT_FOUND',
  'QUOTA_EXHAUSTED',
  'CONTEXT_FULL',
  'RATE_LIMITED',
  'ABUSE_WARN',
  'ABUSE_BLOCKED',
  'MODEL_UNAVAILABLE',
  'WORLD_RETIRED',
  'MAINTENANCE',
  'INTERNAL',
  'UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Pemetaan kode ke status HTTP. Satu tempat, agar tidak tersebar. */
export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  NETWORK: 503,
  UNAUTHORIZED: 401,
  VALIDATION: 400,
  CONFLICT: 409,
  NOT_FOUND: 404,
  QUOTA_EXHAUSTED: 402,
  CONTEXT_FULL: 409,
  RATE_LIMITED: 429,
  ABUSE_WARN: 429,
  ABUSE_BLOCKED: 403,
  MODEL_UNAVAILABLE: 503,
  WORLD_RETIRED: 410,
  MAINTENANCE: 503,
  INTERNAL: 500,
  UNKNOWN: 500,
};

/**
 * Kesalahan yang aman ditampilkan ke pemain.
 *
 * `message` tidak boleh memuat detail internal: tidak ada nama tabel, tidak ada
 * jejak tumpukan, tidak ada nama penyedia model.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSec?: number;
  readonly blockedUntil?: string;
  /** Detail internal untuk log; TIDAK pernah dikirim ke klien. */
  readonly internalDetail?: string;

  constructor(options: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    retryAfterSec?: number;
    blockedUntil?: string;
    internalDetail?: string;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.retryAfterSec = options.retryAfterSec;
    this.blockedUntil = options.blockedUntil;
    this.internalDetail = options.internalDetail;
  }

  get statusCode(): number {
    return HTTP_STATUS_BY_CODE[this.code];
  }

  /** Bentuk yang dikirim ke klien. Tidak pernah memuat `internalDetail`. */
  toResponse(): {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfterSec?: number;
    blockedUntil?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.retryAfterSec !== undefined ? { retryAfterSec: this.retryAfterSec } : null),
      ...(this.blockedUntil !== undefined ? { blockedUntil: this.blockedUntil } : null),
    };
  }
}

export const notFound = (message = 'Data yang diminta tidak ditemukan.') =>
  new AppError({ code: 'NOT_FOUND', message });

export const validationError = (message: string, internalDetail?: string) =>
  new AppError({ code: 'VALIDATION', message, internalDetail });

export const conflict = (message: string) =>
  new AppError({ code: 'CONFLICT', message, retryable: false });

export const worldRetired = () =>
  new AppError({
    code: 'WORLD_RETIRED',
    message: 'Dunia ini sudah diarsipkan dan tidak dapat dimulai lagi.',
  });

export const quotaExhausted = (message = 'Kuota harianmu sudah habis.') =>
  new AppError({ code: 'QUOTA_EXHAUSTED', message });
