/**
 * Identitas akun.
 *
 * ---------------------------------------------------------------------------
 * PERUBAHAN BESAR 9 OKTOBER 2026: KLAIM DIGANTI PEMBUKTIAN
 * ---------------------------------------------------------------------------
 * Sebelum berkas ini diubah, akun ditentukan oleh header `x-account-id` yang
 * DIKIRIM KLIEN dan dipercaya apa adanya. Itu bukan autentikasi. Buktinya diukur
 * langsung terhadap produksi: satu permintaan `GET /v1/journeys` dengan id akun
 * milik orang lain mengembalikan HTTP 200 beserta perjalanan akun tersebut.
 *
 * Sekarang akun hanya dapat ditentukan oleh token sesi yang dibuktikan terhadap
 * tabel `player_sessions`. Header lama masih diterima HANYA bila mode transisi
 * dinyalakan lewat `FAYLN_ALLOW_LEGACY_ACCOUNT_HEADER=1`, dan mode itu mati
 * secara bawaan. Tujuannya satu: memberi jalan agar panel admin dan pengujian
 * lama tidak langsung rusak, tanpa membiarkan pintu itu terbuka diam-diam di
 * produksi.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA `resolveAccountId` MASIH SINKRON
 * ---------------------------------------------------------------------------
 * Ia dipanggil di dalam puluhan route, dan mengubahnya menjadi asinkron berarti
 * menyentuh setiap satu di antaranya. Sebaliknya, hook `onRequest` menyelesaikan
 * identitas SEKALI per permintaan lalu menempelkannya ke objek request. Route
 * tetap memanggil fungsi sinkron yang sama; yang berubah hanya dari mana nilainya
 * datang. Satu perubahan, seluruh route terlindungi — termasuk route yang belum
 * ditulis.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { readBearerToken } from '../routes/auth';

export const ACCOUNT_HEADER = 'x-account-id';

/** Akun demo yang dibuat oleh migrasi seed. */
export const DEMO_ACCOUNT_ID = 'acc_demo';

export type IdentityMode = 'placeholder' | 'authenticated';

/** Mode identitas yang berlaku saat ini. */
export const CURRENT_IDENTITY_MODE: IdentityMode = 'authenticated';

/**
 * Apakah header lama masih diterima.
 *
 * Dibaca dari lingkungan setiap kali dipanggil, bukan disimpan saat modul dimuat,
 * supaya pengujian dapat menyalakannya tanpa memuat ulang modul.
 */
export function legacyHeaderAllowed(): boolean {
  return process.env.FAYLN_ALLOW_LEGACY_ACCOUNT_HEADER === '1';
}

/**
 * Akun yang sudah dibuktikan untuk permintaan ini.
 *
 * Disimpan di `request` alih-alih di variabel modul: satu proses melayani banyak
 * permintaan sekaligus, dan variabel modul akan mencampuradukkan identitas antar
 * permintaan — persis jenis cacat yang paling sulit dilacak.
 */
const RESOLVED = Symbol('fayln.resolvedAccountId');

type WithIdentity = FastifyRequest & { [RESOLVED]?: string };

/**
 * Mengembalikan akun untuk permintaan ini.
 *
 * Melempar UNAUTHORIZED bila identitas belum terbukti. Pelemparan dilakukan di
 * sini, bukan dikembalikan sebagai null, karena route mana pun yang memanggilnya
 * MEMANG membutuhkan identitas — mengembalikan null hanya memindahkan pemeriksaan
 * ke setiap pemanggil, dan satu yang terlewat menjadi lubang.
 */
export function resolveAccountId(request: FastifyRequest): string {
  const resolved = (request as WithIdentity)[RESOLVED];
  if (typeof resolved === 'string' && resolved.length > 0) {
    return resolved;
  }

  /*
   * Identitas belum diselesaikan. Ini hanya sah pada route yang tidak melewati
   * hook (mis. berkas aset), jadi jangan menebak: tolak.
   */
  throw new UnauthenticatedError();
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Kamu belum masuk.');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Menyelesaikan identitas sekali per permintaan.
 *
 * Urutan pemeriksaan:
 * 1. Token `Authorization: Bearer` yang sah terhadap tabel sesi → dipakai.
 * 2. Header `x-account-id` → HANYA bila mode transisi menyala.
 * 3. Selain itu → permintaan ditolak 401.
 *
 * Akun demo TIDAK lagi menjadi cadangan diam-diam. Sebelumnya permintaan tanpa
 * header apa pun menjadi `acc_demo`, sehingga pemain yang belum masuk melihat
 * perjalanan akun demo — dan itu terlihat seperti "ceritaku muncul sendiri".
 */
/**
 * Jalur API yang TIDAK menuntut identitas.
 *
 * - `/v1/auth/*` — pendaftaran dan masuk adalah pintunya; menutupnya dengan
 *   syarat "harus sudah masuk" membuat tidak seorang pun dapat masuk.
 * - `/v1/media/*` — berkas gambar. Alamatnya dipakai langsung di atribut `src`
 *   gambar, dan permintaan seperti itu tidak membawa header `Authorization`.
 *   Menuntut token di sini berarti setiap gambar gagal dimuat. Isinya sendiri
 *   tidak rahasia: alamatnya memuat hash isi, dan hanya pemilik berkas yang tahu
 *   alamatnya.
 * - `/v1/worlds*`, `/v1/genres`, `/v1/meta` — katalog. Ini etalase: orang harus
 *   dapat melihat ada cerita apa saja SEBELUM memutuskan mendaftar. Menutupnya
 *   membuat pendaftaran menjadi lompatan kepercayaan tanpa alasan.
 *
 * Yang TIDAK ada di daftar ini: `/v1/journeys*` dan `/v1/usage`. Keduanya
 * menyentuh cerita pribadi, dan justru itu yang harus terlindungi.
 */
const PUBLIC_API_PREFIXES = ['/v1/auth/', '/v1/media/', '/v1/worlds', '/v1/genres', '/v1/meta'];

function isPublicApiPath(url: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Apakah alamat ini benar-benar punya rute terdaftar.
 *
 * Hook ini berjalan SEBELUM perutean, sehingga tanpa pemeriksaan ini permintaan
 * ke alamat yang tidak ada akan dijawab 401 alih-alih 404 — dan itu menyembunyikan
 * kesalahan alamat sebagai masalah masuk. Pemain yang salah mengetik alamat akan
 * mengira sesinya bermasalah, lalu keluar dan masuk lagi tanpa hasil.
 */
function hasMatchingRoute(app: FastifyInstance, request: FastifyRequest): boolean {
  const method = request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  const found = app.findRoute({ method, url: request.url });
  return found !== undefined && found !== null;
}

export function registerIdentityHook(
  app: FastifyInstance,
  deps: {
    accounts: { ensure: (accountId: string) => Promise<void> };
    /** Menyelesaikan token sesi menjadi account_id, atau null. */
    resolveToken?: (token: string) => Promise<string | null>;
    /** Memperbarui `last_seen_at`. Opsional dan tidak boleh menggagalkan. */
    touchToken?: (token: string) => Promise<void>;
  },
): void {
  app.addHook('onRequest', async (request) => {
    // Hanya permintaan API yang butuh akun; berkas aset dan pemeriksaan kesehatan
    // tidak boleh menyentuh database sama sekali.
    if (!request.url.startsWith('/v1/')) {
      return;
    }

    if (isPublicApiPath(request.url)) {
      return;
    }

    // Alamat yang tidak terdaftar dibiarkan lewat supaya penangan "tidak
    // ditemukan" yang menjawab, bukan hook ini.
    if (!hasMatchingRoute(app, request)) {
      return;
    }

    const token = readBearerToken(request.headers.authorization);

    if (token && deps.resolveToken) {
      const accountId = await deps.resolveToken(token);
      if (accountId) {
        (request as WithIdentity)[RESOLVED] = accountId;
        if (deps.touchToken) {
          try {
            await deps.touchToken(token);
          } catch {
            // Pencatatan waktu terakhir tidak boleh menggagalkan permintaan.
          }
        }
        return;
      }
    }

    if (legacyHeaderAllowed()) {
      const legacy = readLegacyAccountId(request);
      if (legacy) {
        await deps.accounts.ensure(legacy);
        (request as WithIdentity)[RESOLVED] = legacy;
        return;
      }
    }

    throw new UnauthenticatedError();
  });
}

/** Membaca header lama beserta batas panjang dan karakternya. */
function readLegacyAccountId(request: FastifyRequest): string | null {
  const raw = request.headers[ACCOUNT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // Dibatasi agar tidak menjadi jalur penyisipan.
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null;
}
