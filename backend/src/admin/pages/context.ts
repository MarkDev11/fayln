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
  /** Berkas gambar unggahan; dipakai halaman Aset untuk menghitung pemakaian. */
  media: MediaRepository;
};
