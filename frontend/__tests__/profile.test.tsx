import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/Button';
import {
  AGE_MAX,
  AGE_MIN,
  EMPTY_PROFILE,
  NAME_MAX,
  isProfileComplete,
  normalizeProfile,
  validateAge,
  validateName,
} from '@/domain/profile';
import type { ResponseLocale } from '@/domain/types';
import { StartJourneySheet } from '@/features/catalog/StartJourneySheet';
import { ProfileProvider, useProfile } from '@/features/profile/ProfileProvider';
import { InMemoryProfileStore } from '@/storage/profileStore';
import { TestProviders } from '@/testing/TestProviders';

describe('validateName', () => {
  it('menolak nama kosong dan hanya spasi', () => {
    expect(validateName('')).toBe('persona.nameError');
    expect(validateName('   ')).toBe('persona.nameError');
  });

  it('menolak nama yang melebihi batas', () => {
    expect(validateName('a'.repeat(NAME_MAX + 1))).toBe('persona.nameError');
  });

  it('menerima nama yang sah', () => {
    expect(validateName('Arfan')).toBeNull();
    expect(validateName('a'.repeat(NAME_MAX))).toBeNull();
  });
});

describe('validateAge', () => {
  it('menolak nilai kosong', () => {
    expect(validateAge(null)).toBe('persona.ageError');
    expect(validateAge('')).toBe('persona.ageError');
  });

  it('menolak nilai bukan angka', () => {
    expect(validateAge('dua puluh')).toBe('persona.ageError');
  });

  it('menolak usia di luar rentang', () => {
    expect(validateAge(AGE_MIN - 1)).toBe('persona.ageError');
    expect(validateAge(AGE_MAX + 1)).toBe('persona.ageError');
  });

  it('menerima usia pada batas dan di dalam rentang', () => {
    expect(validateAge(AGE_MIN)).toBeNull();
    expect(validateAge(AGE_MAX)).toBeNull();
    expect(validateAge('24')).toBeNull();
  });
});

describe('isProfileComplete', () => {
  it('menolak profil kosong', () => {
    expect(isProfileComplete(EMPTY_PROFILE)).toBe(false);
  });

  it('menolak profil yang hanya punya nama', () => {
    expect(isProfileComplete({ ...EMPTY_PROFILE, name: 'Arfan' })).toBe(false);
  });

  it('menerima profil dengan nama dan usia yang sah', () => {
    expect(
      isProfileComplete({ name: 'Arfan', age: 24, responseLocale: 'id-ID' }),
    ).toBe(true);
  });
});

describe('normalizeProfile', () => {
  it('mengembalikan profil kosong untuk masukan tidak valid', () => {
    expect(normalizeProfile(null)).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile('bukan objek')).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile({ age: 'dua' })).toEqual(EMPTY_PROFILE);
  });

  it('mempertahankan nilai yang sah dan memperbaiki locale tak dikenal', () => {
    expect(
      normalizeProfile({ name: 'Arfan', age: 24, responseLocale: 'fr-FR' }),
    ).toEqual({ name: 'Arfan', age: 24, responseLocale: 'id-ID' });
  });
});

/** Komponen bantu untuk membaca nilai konteks di dalam pengujian. */
function ProfileProbe() {
  const { profile, isComplete, isPersistent, saveProfile } = useProfile();
  return (
    <>
      <Text testID="probe-name">{profile.name}</Text>
      <Text testID="probe-age">{profile.age === null ? 'kosong' : String(profile.age)}</Text>
      <Text testID="probe-complete">{isComplete ? 'lengkap' : 'belum'}</Text>
      <Text testID="probe-persistent">{isPersistent ? 'permanen' : 'memori'}</Text>
      <Button
        label="simpan"
        testID="probe-save"
        onPress={() => {
          void saveProfile({ name: 'Arfan', age: 24, responseLocale: 'id-ID' });
        }}
      />
    </>
  );
}

describe('ProfileProvider', () => {
  it('memuat profil kosong saat belum pernah diisi', async () => {
    const view = await render(
      <TestProviders>
        <ProfileProvider store={new InMemoryProfileStore()}>
          <ProfileProbe />
        </ProfileProvider>
      </TestProviders>,
    );

    expect(view.getByTestId('probe-name').props.children).toBe('');
    expect(view.getByTestId('probe-age').props.children).toBe('kosong');
    expect(view.getByTestId('probe-complete').props.children).toBe('belum');
  });

  it('memuat profil tersimpan', async () => {
    const store = new InMemoryProfileStore();
    await store.save({ name: 'Elysia', age: 27, responseLocale: 'en-US' });

    const view = await render(
      <TestProviders>
        <ProfileProvider store={store}>
          <ProfileProbe />
        </ProfileProvider>
      </TestProviders>,
    );

    expect(view.getByTestId('probe-name').props.children).toBe('Elysia');
    expect(view.getByTestId('probe-age').props.children).toBe('27');
    expect(view.getByTestId('probe-complete').props.children).toBe('lengkap');
  });

  it('menyimpan profil dan menandainya lengkap', async () => {
    const store = new InMemoryProfileStore();
    const view = await render(
      <TestProviders>
        <ProfileProvider store={store}>
          <ProfileProbe />
        </ProfileProvider>
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('probe-save'));

    expect(view.getByTestId('probe-complete').props.children).toBe('lengkap');
    expect(await store.load()).toEqual({ name: 'Arfan', age: 24, responseLocale: 'id-ID' });
  });

  it('melaporkan penyimpanan memori secara jujur di web', async () => {
    const view = await render(
      <TestProviders>
        <ProfileProvider store={new InMemoryProfileStore()}>
          <ProfileProbe />
        </ProfileProvider>
      </TestProviders>,
    );

    expect(view.getByTestId('probe-persistent').props.children).toBe('memori');
  });
});

describe('StartJourneySheet', () => {
  const baseProps = {
    visible: true,
    worldTitle: 'Bosku Adalah Mantan Pacarku di Kampus Dulu',
    supportedLocales: ['id-ID', 'en-US'] as ResponseLocale[],
    onConfirm: () => {},
    onCancel: () => {},
  };

  it('terisi otomatis dari profil yang sudah ada', async () => {
    const view = await render(
      <TestProviders>
        <StartJourneySheet {...baseProps} initialName="Arfan" initialAge={24} />
      </TestProviders>,
    );

    expect(view.getByTestId('persona-confirm')).toBeTruthy();
    expect(view.getByDisplayValue('Arfan')).toBeTruthy();
    expect(view.getByDisplayValue('24')).toBeTruthy();
  });

  it('memberi tahu bahwa nama dan usia akan disimpan', async () => {
    const view = await render(
      <TestProviders>
        <StartJourneySheet {...baseProps} />
      </TestProviders>,
    );

    expect(
      view.getByText(
        'Nama dan usia ini akan disimpan di Pengaturan, jadi kamu tidak perlu mengisinya lagi nanti.',
      ),
    ).toBeTruthy();
  });

  it('menolak konfirmasi saat nama dan usia belum sah', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <TestProviders>
        <StartJourneySheet {...baseProps} onConfirm={onConfirm} />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('persona-confirm'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(view.getByText('Nama wajib diisi, 1 sampai 30 karakter.')).toBeTruthy();
    expect(view.getByText('Usia harus berupa angka antara 13 dan 99.')).toBeTruthy();
  });

  it('mengirim persona yang sudah dirapikan', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <TestProviders>
        <StartJourneySheet
          {...baseProps}
          initialName="  Arfan  "
          initialAge={24}
          onConfirm={onConfirm}
        />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('persona-confirm'));

    expect(onConfirm).toHaveBeenCalledWith({
      name: 'Arfan',
      age: 24,
      responseLocale: 'id-ID',
    });
  });

  /*
   * Pembuatan perjalanan butuh 19–24 detik (terukur). Selama itu lembar ini
   * dulu tidak berubah sama sekali selain tombol yang memudar — terbaca sebagai
   * aplikasi yang membeku. Uji di bawah menuntut umpan balik yang NYATA, bukan
   * sekadar "tidak ada galat".
   */
  it('menampilkan keadaan menyusun cerita selama pembuatan berjalan', async () => {
    const view = await render(
      <TestProviders>
        <StartJourneySheet {...baseProps} submitting />
      </TestProviders>,
    );

    expect(view.getByTestId('persona-creating')).toBeTruthy();
    expect(view.getByText('Menyusun cerita…')).toBeTruthy();
    // Lamanya disebut supaya pemain tahu ini wajar, bukan tanda aplikasi macet.
    expect(view.getByText('Ini biasanya 20 detik. Tetap di halaman ini, ya.')).toBeTruthy();
  });

  it('TIDAK menampilkan keadaan menyusun cerita saat diam', async () => {
    // Pasangan wajib: tanpa uji ini, panel yang selalu tampil akan lolos juga.
    const view = await render(
      <TestProviders>
        <StartJourneySheet {...baseProps} />
      </TestProviders>,
    );

    expect(view.queryByTestId('persona-creating')).toBeNull();
  });

  /*
   * Menutup lembar tidak membatalkan permintaan yang sudah berangkat —
   * perjalanannya tetap terbuat. Batal yang tetap dapat ditekan akan
   * menjanjikan pembatalan yang tidak bisa ditepati, lalu meninggalkan
   * perjalanan hantu di dunia itu.
   */
  it('mengunci Batal selama pembuatan berjalan', async () => {
    const onCancel = jest.fn();
    const view = await render(
      <TestProviders>
        <StartJourneySheet {...baseProps} submitting onCancel={onCancel} />
      </TestProviders>,
    );

    await fireEvent.press(view.getByText('Batal'));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('mengirim hanya satu persona walau konfirmasi ditekan dua kali', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <TestProviders>
        <StartJourneySheet
          {...baseProps}
          initialName="Arfan"
          initialAge={24}
          submitting
          onConfirm={onConfirm}
        />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('persona-confirm'));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
