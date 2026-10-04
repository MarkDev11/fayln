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
  /** Berkas gambar unggahan; dipakai halaman Aset untuk menghitung pemakaian. */
  media: MediaRepository;
};
