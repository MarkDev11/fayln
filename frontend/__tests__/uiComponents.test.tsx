import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon, type IconName } from '@/components/Icon';
import { StickyActionBar } from '@/components/StickyActionBar';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Catatan penting untuk @testing-library/react-native v14:
 * - `render()` bersifat ASYNC dan wajib di-await.
 * - `fireEvent.press()` juga mengembalikan Promise dan WAJIB di-await. Tanpa await,
 *   act() bocor ke tes berikutnya dan kueri di tes itu gagal menemukan elemen.
 */

const ALL_ICONS: IconName[] = [
  'home',
  'journey',
  'settings',
  'search',
  'close',
  'filter',
  'trash',
  'chevronRight',
  'chevronLeft',
  'check',
  'book',
  'pause',
  'play',
  'eye',
  'eyeOff',
];

describe('Icon', () => {
  it('merender seluruh nama ikon tanpa gagal', async () => {
    // Satu render untuk semua ikon. Merender berulang dalam satu tes menumpuk
    // act() dan dapat merusak tes berikutnya.
    await render(
      <TestProviders>
        <View>
          {ALL_ICONS.map((name) => (
            <Icon key={name} name={name} size={24} />
          ))}
        </View>
      </TestProviders>,
    );

    expect(screen.toJSON()).toBeTruthy();
    expect(ALL_ICONS).toHaveLength(15);
  });

  it('menerima ukuran dan warna kustom', async () => {
    await render(
      <TestProviders>
        <Icon name="eyeOff" size={32} color="#FF0000" strokeWidth={3} />
      </TestProviders>,
    );

    // Ikon bersifat dekoratif; label aksesibilitas disediakan kontrol pemanggil.
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  const baseProps = {
    visible: true,
    title: 'Keluar dari cerita?',
    body: 'Posisi bacamu tersimpan, jadi kamu bisa melanjutkan nanti.',
    confirmLabel: 'Keluar',
    cancelLabel: 'Tetap di sini',
    onConfirm: () => {},
    onCancel: () => {},
  };

  it('menampilkan judul dan konsekuensi, bukan pesan generik', async () => {
    await render(
      <TestProviders>
        <ConfirmDialog {...baseProps} />
      </TestProviders>,
    );

    expect(screen.getByText('Keluar dari cerita?')).toBeTruthy();
    expect(
      screen.getByText('Posisi bacamu tersimpan, jadi kamu bisa melanjutkan nanti.'),
    ).toBeTruthy();
  });

  it('memanggil onCancel dan onConfirm dengan tepat', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    // Memakai nilai kembalian render(), bukan `screen` bersama, agar tidak
    // terpengaruh sisa tes sebelumnya.
    const view = await render(
      <TestProviders>
        <ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel} testID="leave" />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('leave-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('leave-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('menonaktifkan konfirmasi saat aksi sedang berjalan', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <TestProviders>
        <ConfirmDialog {...baseProps} busy onConfirm={onConfirm} testID="busy" />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('busy-confirm'));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tidak merender apa pun saat tidak terlihat', async () => {
    const view = await render(
      <TestProviders>
        <ConfirmDialog {...baseProps} visible={false} testID="hidden" />
      </TestProviders>,
    );

    expect(view.queryByTestId('hidden-confirm')).toBeNull();
  });
});

describe('StickyActionBar', () => {
  const baseProps = {
    primaryLabel: 'Mulai Perjalanan',
    onPrimary: () => {},
  };

  it('merender label primer apa adanya', async () => {
    const view = await render(
      <TestProviders>
        <StickyActionBar {...baseProps} testID="bar" />
      </TestProviders>,
    );

    expect(view.getByText('Mulai Perjalanan')).toBeTruthy();
  });

  /*
   * `busy` dan `disabled` sengaja dibedakan. Pekerjaan sepanjang 20 detik yang
   * hanya menonaktifkan tombol tanpa indikator apa pun terbaca sebagai aplikasi
   * yang membeku — persis keluhan yang melahirkan keadaan ini.
   */
  it('menonaktifkan aksi primer selama sibuk', async () => {
    const onPrimary = jest.fn();
    const view = await render(
      <TestProviders>
        <StickyActionBar {...baseProps} busy onPrimary={onPrimary} testID="busy" />
      </TestProviders>,
    );

    /*
     * Dicari lewat LABEL AKSESIBILITAS, bukan lewat teks tombolnya.
     *
     * Saat `busy`, `Button` mengganti isi tombol dengan indikator dan tidak lagi
     * merender `Text` labelnya — jadi labelnya memang tidak ada sebagai teks di
     * pohon tampilan. Label itu tetap ada sebagai `accessibilityLabel`, dan itu
     * justru yang harus bertahan: pemain yang memakai pembaca layar tetap harus
     * dapat menemukan tombolnya.
     */
    const button = view.getByLabelText('Mulai Perjalanan');
    expect(button.props.accessibilityState.busy).toBe(true);

    await fireEvent.press(button);

    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('tetap menonaktifkan aksi primer saat tidak tersedia', async () => {
    const onPrimary = jest.fn();
    const view = await render(
      <TestProviders>
        <StickyActionBar {...baseProps} primaryDisabled onPrimary={onPrimary} testID="off" />
      </TestProviders>,
    );

    await fireEvent.press(view.getByText('Mulai Perjalanan'));

    expect(onPrimary).not.toHaveBeenCalled();
  });
});
