/**
 * Fixture katalog dan demo — deterministik.
 *
 * Sumber: docs/11-demo-dan-skenario-uji.md, seed `demo_bosku_mantan_v1`.
 *
 * Catatan kejujuran:
 * - Aset gambar dibuat manual dan BELUM ada. Karena itu URI memakai skema internal
 *   `asset://` yang sengaja tidak dapat dimuat. Komponen gambar akan menampilkan
 *   placeholder netral berlabel, bukan mengarang gambar atau memakai URL palsu.
 * - Data ini hanya untuk pengujian dan pratinjau. Bukan konten produksi.
 */

import type {
  AssetManifest,
  GenreId,
  NPCPublicDTO,
  PortraitRef,
  WorldCatalogItem,
  WorldDetailDTO,
} from '@/domain/types';

export const FIXTURE_SEED = 'demo_bosku_mantan_v1';

/** Awalan URI aset internal. Tidak ada host eksternal yang dikarang. */
export const LOCAL_ASSET_SCHEME = 'asset://';

/**
 * Gambar contoh untuk PRATINJAU VISUAL — bukan aset produk.
 *
 * Aset sungguhan belum dibuat, sehingga tata letak tidak dapat dinilai dengan
 * gambar nyata. Agar bentuk kartu, hero, dan rel dapat diperiksa sebagaimana
 * nanti terlihat, fixture memakai foto acak dari layanan gambar publik.
 *
 * PENTING: ini BUKAN konten fayLN, bukan sampul resmi, dan tidak boleh ikut
 * dirilis. Untuk kembali ke perilaku asli, ganti tiap nilai di bawah menjadi
 * ID asetnya (`a_cover_kantor`, `a_cover_lentera`, `a_cover_rapat`,
 * `a_cover_arsip`) — `AssetImage` akan kembali menampilkan placeholder.
 */
const SAMPLE_COVERS = {
  kantor: 'https://picsum.photos/seed/fayln-kantor/600/800',
  lentera: 'https://picsum.photos/seed/fayln-lentera/600/800',
  rapat: 'https://picsum.photos/seed/fayln-rapat/600/800',
  arsip: 'https://picsum.photos/seed/fayln-arsip/600/800',
} as const;

function asset(assetId: string, label: string): { assetId: string; label: string; uri: string } {
  return { assetId, label, uri: `${LOCAL_ASSET_SCHEME}${assetId}` };
}

function portrait(
  assetId: string,
  label: string,
  npcId: string,
  expression: string,
): PortraitRef {
  return { ...asset(assetId, label), npcId, expression };
}

/* ------------------------------------------------------------------ */
/* World 1 — demo utama                                                */
/* ------------------------------------------------------------------ */

export const elysia: NPCPublicDTO = {
  npcId: 'npc_elysia',
  name: 'Elysia',
  role: 'Atasan langsung',
  // Jiwa berupa paragraf: apa yang mendorongnya, dan di mana ia bertentangan.
  soul:
    'Tegas dan tidak pernah mengulang perintah dua kali. Ia menjaga batas profesional seperti garis yang tidak boleh disentuh siapa pun — termasuk dirinya sendiri. Sinismenya muncul hanya bila seseorang mencoba mendekat tanpa alasan yang jelas, dan ia sendiri tidak pernah yakin apakah itu benteng atau kebiasaan lama.',
  publicBackstory:
    'Elysia memimpin tim operasional dan dikenal menuntut standar tinggi. Ia mengenal protagonis dari masa kuliah, sebuah bab yang tidak pernah ia bahas di kantor.',
  initialRelation: 'normal',
  expressions: ['netral', 'kesal', 'tercengang', 'tersenyum_tipis'],
  defaultPortraitAssetId: 'p_elysia_netral',
};

export const leo: NPCPublicDTO = {
  npcId: 'npc_leo',
  name: 'Leo',
  role: 'Rekan senior',
  soul:
    'Santai sampai orang lain mengira ia tidak peduli, padahal ia membaca suasana ruangan lebih cepat daripada siapa pun. Ia selalu menengahi — bukan karena ingin disukai, tetapi karena pertengkaran membuatnya gelisah dan ia tidak pernah menjelaskan mengapa.',
  publicBackstory:
    'Leo sudah tiga tahun di tim yang sama dan mengenal Elysia maupun protagonis sejak masa kuliah. Ia satu-satunya orang yang berani menggoda keduanya.',
  initialRelation: 'normal',
  expressions: ['senang', 'netral', 'bingung'],
  defaultPortraitAssetId: 'p_leo_netral',
};

const boskuMantanManifest: AssetManifest = {
  cover: asset('a_cover_kantor', 'Kantor AAA'),
  backgrounds: [
    asset('bg_gedung_luar', 'Luar Gedung AAA'),
    asset('bg_kantor_dalam', 'Interior Kantor'),
    asset('bg_ruang_rapat', 'Ruang Rapat Kecil'),
  ],
  portraits: [
    portrait('p_elysia_netral', 'Elysia — netral', 'npc_elysia', 'netral'),
    portrait('p_elysia_kesal', 'Elysia — kesal', 'npc_elysia', 'kesal'),
    portrait('p_elysia_tercengang', 'Elysia — tercengang', 'npc_elysia', 'tercengang'),
    portrait('p_elysia_tersenyum_tipis', 'Elysia — senyum tipis', 'npc_elysia', 'tersenyum_tipis'),
    portrait('p_leo_netral', 'Leo — netral', 'npc_leo', 'netral'),
    portrait('p_leo_senang', 'Leo — senang', 'npc_leo', 'senang'),
    portrait('p_leo_bingung', 'Leo — bingung', 'npc_leo', 'bingung'),
  ],
};

export const worldBoskuMantan: WorldDetailDTO = {
  worldId: 'w_bosku-mantan',
  title: 'Bosku Adalah Mantan Pacarku di Kampus Dulu',
  synopsis:
    'Hari pertama kerja di perusahaan AAA mempertemukanmu kembali dengan seseorang yang pernah kau kenal baik — kini ia atasanmu.',
  genres: ['romance', 'drama', 'office'] satisfies GenreId[],
  coverAssetId: SAMPLE_COVERS.kantor,
  worldVersion: 7,
  status: 'published',
  contentRating: '18_plus',
  supportedResponseLocales: ['id-ID', 'en-US'],
  publishedAt: '2026-09-20T02:00:00.000Z',
  premise:
    'Protagonis memulai pekerjaan pertama di perusahaan AAA. Elysia, mantan dari masa kampus, kini menjadi atasannya. Leo, sahabat keduanya, bekerja di tim yang sama.',
  locations: [
    { locationId: 'loc_gedung_luar', label: 'Luar Gedung AAA' },
    { locationId: 'loc_kantor_dalam', label: 'Interior Kantor' },
    { locationId: 'loc_ruang_rapat', label: 'Ruang Rapat Kecil' },
  ],
  characters: [elysia, leo],
  assetManifest: boskuMantanManifest,
};

/* ------------------------------------------------------------------ */
/* World tambahan agar katalog dan filter punya isi                    */
/* ------------------------------------------------------------------ */

export const worldLenteraTerakhir: WorldDetailDTO = {
  worldId: 'w_lentera-terakhir',
  title: 'Lentera Terakhir di Ujung Desa',
  synopsis:
    'Sebuah desa kehilangan cahayanya satu per satu. Kau satu-satunya yang masih bisa menyalakan lentera.',
  genres: ['fantasy', 'mystery'] satisfies GenreId[],
  coverAssetId: SAMPLE_COVERS.lentera,
  worldVersion: 3,
  status: 'published',
  contentRating: '13_plus',
  supportedResponseLocales: ['id-ID'],
  publishedAt: '2026-09-18T04:30:00.000Z',
  premise:
    'Setiap malam satu lentera di desa padam. Penjaga lentera terakhir harus mencari sebabnya sebelum desa kehilangan cahaya sepenuhnya.',
  locations: [{ locationId: 'loc_alun_alun', label: 'Alun-Alun Desa' }],
  characters: [
    {
      npcId: 'npc_penjaga',
      name: 'Penjaga Lentera',
      role: 'Mentor',
      soul:
        'Pendiam karena terbiasa mengamati, bukan karena tidak peduli. Ia menyimpan pertanyaannya sampai yakin jawabannya tidak akan menyakiti siapa pun — dan karena itu sering terlambat bertanya.',
      publicBackstory: 'Ia menjaga lentera desa sejak lama dan menyimpan catatan yang tidak dibaca siapa pun.',
      initialRelation: 'normal',
      expressions: ['netral', 'khawatir'],
      defaultPortraitAssetId: 'p_penjaga_netral',
    },
  ],
  assetManifest: {
    cover: asset('a_cover_lentera', 'Lentera Desa'),
    backgrounds: [asset('bg_alun_alun', 'Alun-Alun Desa')],
    portraits: [portrait('p_penjaga_netral', 'Penjaga — netral', 'npc_penjaga', 'netral')],
  },
};

export const worldRapatTengahMalam: WorldDetailDTO = {
  worldId: 'w_rapat-tengah-malam',
  title: 'Rapat Tengah Malam',
  synopsis:
    'Rapat pukul dua pagi terasa aneh. Tak ada siapa pun yang mengirim undangan itu.',
  genres: ['mystery', 'office'] satisfies GenreId[],
  coverAssetId: SAMPLE_COVERS.rapat,
  worldVersion: 1,
  status: 'published',
  contentRating: '13_plus',
  supportedResponseLocales: ['id-ID', 'en-US'],
  publishedAt: '2026-09-10T09:15:00.000Z',
  premise: 'Kantor mengadakan rapat tengah malam yang tidak pernah dijadwalkan siapa pun.',
  locations: [{ locationId: 'loc_ruang_rapat_besar', label: 'Ruang Rapat Besar' }],
  characters: [
    {
      npcId: 'npc_rekan_baru',
      name: 'Rekan Baru',
      role: 'Rekan sekantor',
      soul:
        'Cemas pada hal-hal kecil dan sangat teliti pada hal-hal besar. Ia memeriksa ulang pekerjaannya bukan karena kurang percaya diri, tetapi karena pernah sekali kehilangan sesuatu yang tidak pernah ia periksa.',
      publicBackstory: 'Ia ikut rapat itu dan sejak malam tersebut tidak mau membicarakannya.',
      initialRelation: 'normal',
      expressions: ['cemas', 'netral'],
      defaultPortraitAssetId: 'p_rekan_cemas',
    },
  ],
  assetManifest: {
    cover: asset('a_cover_rapat', 'Ruang Rapat'),
    backgrounds: [asset('bg_ruang_rapat_besar', 'Ruang Rapat Besar')],
    portraits: [portrait('p_rekan_cemas', 'Rekan — cemas', 'npc_rekan_baru', 'cemas')],
  },
};

/** World terarsip, dipakai menguji state `retired` (AC-04). */
export const worldDiarsipkan: WorldDetailDTO = {
  worldId: 'w_arsip-lama',
  title: 'Musim Panas yang Tertunda',
  synopsis: 'Cerita ini sudah diarsipkan kurator dan tidak dapat dimulai lagi.',
  genres: ['drama'] satisfies GenreId[],
  coverAssetId: SAMPLE_COVERS.arsip,
  worldVersion: 2,
  status: 'retired',
  contentRating: '13_plus',
  supportedResponseLocales: ['id-ID'],
  publishedAt: '2026-06-01T00:00:00.000Z',
  premise: 'Arsip.',
  locations: [],
  characters: [],
  assetManifest: {
    cover: asset('a_cover_arsip', 'Arsip'),
    backgrounds: [],
    portraits: [],
  },
};

export const allWorlds: WorldDetailDTO[] = [
  worldBoskuMantan,
  worldLenteraTerakhir,
  worldRapatTengahMalam,
  worldDiarsipkan,
];

export function toCatalogItem(world: WorldDetailDTO): WorldCatalogItem {
  const { premise, locations, characters, assetManifest, ...catalog } = world;
  return catalog;
}

export const catalogFixtures: WorldCatalogItem[] = allWorlds.map(toCatalogItem);

export function findWorld(worldId: string): WorldDetailDTO | undefined {
  return allWorlds.find((world) => world.worldId === worldId);
}
