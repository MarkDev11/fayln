/**
 * Pemetaan ID aset menjadi URI yang dapat dimuat.
 *
 * Aset dapat datang dalam dua bentuk:
 * - **ID internal**, mis. `a_cover_kantor` — belum ada berkasnya, sehingga
 *   `AssetImage` menampilkan placeholder berlabel.
 * - **URL absolut** (`https://…`) — dipakai oleh gateway HTTP dan oleh fixture
 *   pratinjau visual.
 *
 * Tanpa pemetaan ini, URL absolut akan ikut ditempeli awalan `asset://` dan
 * tidak pernah dapat dimuat. Itu kegagalan yang senyap: gambarnya hanya tampak
 * seperti placeholder biasa, tanpa galat apa pun.
 */

/** Awalan skema aset internal. Disimpan di sini agar hanya ada satu definisi. */
export const LOCAL_ASSET_SCHEME = 'asset://';

const ABSOLUTE_URL = /^https?:\/\//i;

/** `true` bila nilainya sudah berupa URL absolut yang dapat dimuat langsung. */
export function isAbsoluteAssetUrl(value: string): boolean {
  return ABSOLUTE_URL.test(value);
}

/**
 * Mengubah ID aset atau URL menjadi URI yang dapat dimuat.
 *
 * Nilai yang sudah berupa URL absolut diteruskan apa adanya; selain itu
 * diberi awalan skema internal.
 */
export function assetUri(idOrUrl: string): string {
  return isAbsoluteAssetUrl(idOrUrl) ? idOrUrl : `${LOCAL_ASSET_SCHEME}${idOrUrl}`;
}
