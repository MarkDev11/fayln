/**
 * Konteks yang diterima setiap halaman admin.
 *
 * Sengaja berupa objek tunggal, bukan daftar argumen: menambah kemampuan baru
 * (mis. repository baru) tidak mengubah tanda tangan seluruh halaman.
 */

import type { AdminRepository } from '../adminRepository';
import type { SettingsRepository } from '../settingsRepository';
import type { CatalogAdminRepository } from '../catalogAdminRepository';
import type { AccountsAdminRepository } from '../accountsAdminRepository';
import type { PromotionsRepository } from '../promotionsRepository';
import type { ModelsRepository } from '../modelsRepository';
import type { WorldDraftRepository } from '../worldDraftRepository';
import type { GenresRepository } from '../genresRepository';
import type { CharactersRepository } from '../charactersRepository';
import type { LocationsRepository } from '../locationsRepository';
import type { ProvidersRepository } from '../providersRepository';
import type { RelationsRepository } from '../relationsRepository';
import type { EngineEventRepository } from '../../repositories/engineEventRepository';
import type { MediaRepository } from '../../repositories/mediaRepository';

export type AdminPageContext = {
  admins: AdminRepository;
  settings: SettingsRepository;
  catalog: CatalogAdminRepository;
  accounts: AccountsAdminRepository;
  promotions: PromotionsRepository;
  models: ModelsRepository;
  /** Draf wizard "Dunia baru". */
  drafts: WorldDraftRepository;
  /**
   * Master genre.
   *
   * Berada di sini — bukan di dalam `catalog` — karena genre adalah data yang
   * berdiri sendiri: ia tidak hidup di dalam satu versi dunia, sehingga
   * mengubahnya tidak membuat versi baru. Formulir dunia dan wizard hanya
   * MEMBACA daftarnya; yang menulis adalah halaman Genre.
   */
  genres: GenresRepository;
  /**
   * Master karakter — nama dan gambar-gambar ekspresinya.
   *
   * Berdiri sendiri dengan alasan yang sama seperti genre: nama dan gambar
   * ekspresi tidak khas satu dunia, jadi mengubahnya tidak boleh membuat versi
   * dunia baru. Yang khas dunia (peran, latar belakang, hubungan awal) tetap
   * tinggal di `world_characters`.
   */
  characters: CharactersRepository;
  /**
   * Master status hubungan.
   *
   * Berdiri sendiri dengan alasan yang sama seperti genre dan karakter: daftar
   * status hubungan bukan milik satu dunia, jadi menambah atau menyuntingnya
   * tidak boleh membuat versi dunia baru. Yang khas dunia adalah PILIHANNYA —
   * hubungan awal tiap karakter, dan kosakata yang dibekukan saat versi itu
   * terbit. Keduanya tetap tinggal di `world_characters` dan
   * `world_relationship_definitions`.
   */
  relations: RelationsRepository;
  /**
   * Master lokasi — kategori (era/setting), tempat, dan latar belakangnya.
   *
   * Berdiri sendiri dengan alasan yang sama seperti genre dan karakter: nama
   * tempat dan gambar latarnya tidak khas satu dunia, jadi mengubahnya tidak
   * boleh membuat versi dunia baru. Yang khas dunia (keterangan yang dibaca
   * mesin cerita, blur, titik fokus, peluang kemunculan) tetap tinggal di
   * `world_assets`, dan wizard hanya MEMUNGUT latar dari sini.
   */
  locations: LocationsRepository;
  /**
   * Provider model — alamat, jenis API, dan awalan id.
   *
   * Dipisah dari model dengan alasan yang sama seperti genre dipisah dari dunia:
   * satu alamat dipakai banyak model, dan menuliskannya ulang di setiap baris
   * berarti satu salah ketik menghasilkan model yang menembak alamat yang salah.
   * Kunci API tidak ada di sini — bahkan di tabelnya pun yang disimpan hanya
   * NAMA variabel lingkungannya.
   */
  providers: ProvidersRepository;
  /**
   * Kejadian mesin cerita: kegagalan model, penolakan adegan, pengambilalihan
   * simulator. Hanya MEMBACA; yang menulis adalah hook mesin di `index.ts`,
   * dan pencatatnya sengaja tidak pernah menggagalkan permintaan.
   */
  engineEvents: EngineEventRepository;
  /** Berkas gambar unggahan; dipakai halaman Aset untuk menghitung pemakaian. */
  media: MediaRepository;
  /**
   * Batas konteks per paket, dibaca dari konfigurasi server.
   *
   * Satu-satunya pengaturan token yang masih ada di jalur pemain: batas
   * konteks tidak berkaitan dengan ekonomi poin (docs/17).
   */
  plan: {
    free: { contextTokens: number };
    paid: { contextTokens: number };
  };
  /**
   * Aturan ekonomi poin harian (docs/17), dibaca dari konfigurasi server.
   *
   * Halaman yang menyebut jatah poin wajib membacanya dari sini, bukan
   * menuliskan angkanya: angka yang ditulis ulang akan berbeda dari yang
   * benar-benar ditegakkan begitu seseorang menyetel variabel lingkungannya.
   */
  points: {
    dailyPoints: number;
    sceneCost: number;
    streakBonusPoints: number;
    streakCycleDays: number;
  };
};
