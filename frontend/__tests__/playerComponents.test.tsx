import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { AUTO_DELAY_OPTIONS_MS, AutoDelayControl } from '@/features/player/components/AutoDelayControl';
import { ChoiceSheet } from '@/features/player/components/ChoiceSheet';
import { Composer, MAX_CUSTOM_ACTION_CHARS } from '@/features/player/components/Composer';
import { GatewayErrorSheet, mapGatewayError } from '@/features/player/components/GatewayErrorSheet';
import { PlayerControls } from '@/features/player/components/PlayerControls';
import { NPCInspector } from '@/features/player/components/NPCInspector';
import { RelationNotice } from '@/features/player/components/RelationNotice';
import { StageHud } from '@/features/player/components/StageHud';
import { StageNav } from '@/features/player/components/StageNav';
import { StageText } from '@/features/player/components/StageText';
import { DEFAULT_AUTO_DELAY_MS, type PendingDecision } from '@/features/player/types';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Catatan: pada @testing-library/react-native v14, `render` DAN `fireEvent.press`
 * sama-sama async dan wajib di-await. Melewatkan await membuat act() bocor ke tes
 * berikutnya.
 */

const decision: PendingDecision = {
  beatId: 'b007',
  decisionId: 'd001',
  prompt: 'Bagaimana kamu merespons?',
  options: [
    { optionId: 'opt1', label: 'Minta maaf secara profesional', description: 'Akui keterlambatan.' },
    { optionId: 'opt2', label: 'Jelaskan singkat', description: 'Sebut alasan seperlunya.' },
    { optionId: 'opt3', label: 'Coba meredakan dengan humor', description: 'Nada ringan.' },
  ],
};

describe('StageText', () => {
  it('menampilkan nama pembicara dan isi dialog', async () => {
    await render(
      <TestProviders>
        <StageText
          line={{ beatId: 'b1', kind: 'say', speakerNpcId: 'npc_elysia', text: 'Kamu telat.' }}
          speakerName="Elysia"
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    expect(screen.getByText('Elysia')).toBeTruthy();
    // Ucapan tokoh dikutip; model cerita tidak pernah menuliskan kutipnya sendiri.
    expect(screen.getByText('“Kamu telat.”')).toBeTruthy();
  });

  it('tidak menampilkan nama pembicara pada narasi', async () => {
    /*
     * BUKTI MUTASI — versi pertama uji ini mengirim `speakerName={null}` juga,
     * sehingga `queryByText('Elysia')` tidak akan pernah bisa gagal: nama itu
     * memang tidak pernah diberikan. Uji seperti itu hijau walaupun komponennya
     * menampilkan nama pada narasi. Sekarang nama BENAR-BENAR dikirim, dan yang
     * dijaga adalah komponen yang MEMUTUSKAN untuk tidak menampilkannya.
     */
    await render(
      <TestProviders>
        <StageText
          line={{ beatId: 'b2', kind: 'narrate', speakerNpcId: null, text: 'Kamu memasuki gedung.' }}
          speakerName="Elysia"
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    // Narasi TANPA nama pembicara dan TANPA tanda kutip.
    expect(screen.getByText('Kamu memasuki gedung.')).toBeTruthy();
    expect(screen.queryByText('Elysia')).toBeNull();
  });

  it('memanggil onAdvance saat ditekan setelah teks selesai', async () => {
    const onAdvance = jest.fn();
    await render(
      <TestProviders>
        <StageText
          line={{ beatId: 'b3', kind: 'narrate', speakerNpcId: null, text: 'Teks pendek.' }}
          speakerName={null}
          onRevealed={() => {}}
          onAdvance={onAdvance}
          instant
        />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByText('Teks pendek.'));

    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  /**
   * Teks cerita TANPA kotak.
   *
   * Bentuk lamanya adalah kotak berlatar hitam pekat yang memakan seluruh lebar
   * layar. Pemilik produk menunjukkan komposisi yang dituju: kalimatnya duduk
   * LANGSUNG di atas ilustrasi, dan keterbacaannya dijaga gradasi gelap milik
   * panggung — bukan oleh kotak milik teksnya.
   *
   * BUKTI MUTASI: kembalikan `backgroundColor: '#000000'` ke `styles.root`,
   * lalu uji ini memerah.
   */
  it('tidak menggambar kotak di belakang teks', async () => {
    await render(
      <TestProviders>
        <StageText
          line={{ beatId: 'b4', kind: 'say', speakerNpcId: 'npc_elysia', text: 'Kamu telat.' }}
          speakerName="Elysia"
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    /*
     * Simpul terluar adalah Pressable. `getByLabelText` menemukannya lewat label
     * aksesibilitas yang memang dibentuk komponen ini.
     */
    const kotak = screen.getByLabelText(/Elysia: Kamu telat\./);
    const gaya = StyleSheet.flatten(kotak.props.style);

    expect(gaya.backgroundColor).toBeUndefined();
    expect(gaya.borderWidth ?? 0).toBe(0);
    expect(gaya.borderColor).toBeUndefined();
    expect(gaya.borderRadius ?? 0).toBe(0);

    // Teks isi dialog harus putih, apa pun temanya.
    expect(StyleSheet.flatten(screen.getByText('“Kamu telat.”').props.style).color).toBe(
      '#FFFFFF',
    );
  });

  it('memberi bayangan pada teks sebagai jaring pengaman kontras', async () => {
    /*
     * Gradasi panggung menutupi kaki layar, tetapi teks tetap bisa meleset ke
     * area yang lebih terang pada layar pendek. Bayangan tipis menjaga kalimatnya
     * tetap terbaca tanpa perlu menggelapkan seluruh gambar.
     *
     * BUKTI MUTASI: hapus `textShadowColor` dari `styles.body`, lalu uji ini
     * memerah.
     */
    await render(
      <TestProviders>
        <StageText
          line={{ beatId: 'b5', kind: 'narrate', speakerNpcId: null, text: 'Narasi.' }}
          speakerName={null}
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    const gaya = StyleSheet.flatten(screen.getByText('Narasi.').props.style);
    expect(String(gaya.textShadowColor)).toBe('rgba(0, 0, 0, 0.85)');
    expect(gaya.textShadowRadius).toBeGreaterThan(0);
  });
});

describe('StageText — tanda kutip', () => {
  /*
   * Uji ini MERENDER komponennya, bukan memanggil helper.
   *
   * Bentuk sebelumnya menguji `quoteDialogue()` secara langsung — dan helper itu
   * ternyata tidak pernah dipakai `StageText`, sehingga uji tersebut hijau
   * terlepas dari apa yang dilihat pemain. BUKTI MUTASI: hapus
   * `const needsQuotes = …isQuoted(fullText)` dan ganti dengan `true`, lalu uji
   * "tidak mengutip dua kali" memerah.
   */
  it('mengutip ucapan tokoh', async () => {
    await render(
      <TestProviders>
        <StageText
          line={{ beatId: 'q1', kind: 'say', speakerNpcId: 'npc_1', text: 'Aku tidak bisa berhenti.' }}
          speakerName="Rina"
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    expect(screen.getByText('“Aku tidak bisa berhenti.”')).toBeTruthy();
  });

  it('tidak mengutip dua kali bila model sudah menuliskan kutipnya', async () => {
    await render(
      <TestProviders>
        <StageText
          line={{ beatId: 'q2', kind: 'say', speakerNpcId: 'npc_1', text: '“Sudah dikutip.”' }}
          speakerName="Rina"
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    expect(screen.getByText('“Sudah dikutip.”')).toBeTruthy();
    expect(screen.queryByText('““Sudah dikutip.””')).toBeNull();
  });
});

describe('StageHud', () => {
  it('menampilkan hubungan dan tempat dengan data yang nyata', async () => {
    await render(
      <TestProviders>
        <StageHud
          relationStatus="dekat"
          relationName="Elysia"
          locationLabel="Kedai Teh"
          autoActive={false}
          onToggleAuto={() => {}}
          onHideUi={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Hubungan')).toBeTruthy();
    expect(screen.getByText('Dekat')).toBeTruthy();
    expect(screen.getByText('Tempat')).toBeTruthy();
    expect(screen.getByText('Kedai Teh')).toBeTruthy();
  });

  it('memakai label netral saat tidak ada tokoh di panggung', async () => {
    // Adegan tanpa tokoh tetap menampilkan blok hubungan — dan tidak boleh
    // kosong atau menampilkan id mentah.
    await render(
      <TestProviders>
        <StageHud
          relationStatus={null}
          relationName={null}
          locationLabel={null}
          autoActive={false}
          onToggleAuto={() => {}}
          onHideUi={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Belum diketahui')).toBeTruthy();
  });

  it('menandai mode Auto yang menyala lewat `selected`, bukan hanya warna', async () => {
    /*
     * Penanda mode aktif tidak boleh bergantung pada warna saja: pembaca layar
     * tidak membacakannya, dan pemain dengan buta warna tidak melihat bedanya
     * (NFR-01).
     */
    const onToggleAuto = jest.fn();
    await render(
      <TestProviders>
        <StageHud
          relationStatus="normal"
          relationName={null}
          locationLabel="Kantor"
          autoActive
          onToggleAuto={onToggleAuto}
          onHideUi={() => {}}
        />
      </TestProviders>,
    );

    const auto = screen.getByTestId('player-hud-auto');
    expect(auto.props.accessibilityState?.selected).toBe(true);

    await fireEvent.press(auto);
    expect(onToggleAuto).toHaveBeenCalledTimes(1);
  });

  it('memanggil aksi sembunyikan UI', async () => {
    const onHideUi = jest.fn();
    await render(
      <TestProviders>
        <StageHud
          relationStatus="normal"
          relationName={null}
          locationLabel="Kantor"
          autoActive={false}
          onToggleAuto={() => {}}
          onHideUi={onHideUi}
        />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('player-hud-hide'));
    expect(onHideUi).toHaveBeenCalledTimes(1);
  });
});

describe('StageNav', () => {
  it('meneruskan aksi keluar', async () => {
    const onBack = jest.fn();
    await render(
      <TestProviders>
        <StageNav onBack={onBack} backLabel="Kembali ke menu" />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('player-nav-back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  /**
   * HANYA satu tombol di kaki panggung.
   *
   * Pemilik produk menghapus panah kanan. Sebelumnya layar punya TIGA isyarat
   * maju sekaligus (ketuk di mana saja, tombol `»`, dan petunjuk "Ketuk untuk
   * lanjut"), dan itu keluhan yang sama dari tiga peninjau independen.
   *
   * BUKTI MUTASI: kembalikan tombol `player-nav-forward`, lalu uji ini memerah.
   */
  it('TIDAK punya tombol maju', async () => {
    await render(
      <TestProviders>
        <StageNav onBack={() => {}} backLabel="Kembali ke menu" />
      </TestProviders>,
    );

    expect(screen.queryByTestId('player-nav-forward')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('memakai target sentuh minimum 44 px', async () => {
    /*
     * Peninjau QA mengukur tombol ini dan menemukannya 38 px — di bawah
     * `touchTarget` (48) yang dipakai aplikasi ini di tempat lain, dan lebih
     * kecil daripada referensi. Dinaikkan ke 44 px + `hitSlop`.
     *
     * BUKTI MUTASI: kembalikan `width: 38`, lalu uji ini memerah.
     */
    await render(
      <TestProviders>
        <StageNav onBack={() => {}} backLabel="Kembali ke menu" />
      </TestProviders>,
    );

    const tombol = screen.getByTestId('player-nav-back');
    const gaya = StyleSheet.flatten(tombol.props.style);
    expect(gaya.width).toBe(44);
    expect(gaya.height).toBe(44);
  });
});

describe('ChoiceSheet', () => {
  it('menampilkan tepat tiga opsi dengan nomor urut', async () => {
    await render(
      <TestProviders>
        <ChoiceSheet decision={decision} onSelect={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Minta maaf secara profesional')).toBeTruthy();
    expect(screen.getByText('Coba meredakan dengan humor')).toBeTruthy();
  });

  it('mengirim optionId yang dipilih', async () => {
    const onSelect = jest.fn();
    await render(
      <TestProviders>
        <ChoiceSheet decision={decision} onSelect={onSelect} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByText('Jelaskan singkat'));

    expect(onSelect).toHaveBeenCalledWith('opt2');
  });

  it('menonaktifkan seluruh opsi saat pengiriman berlangsung', async () => {
    const onSelect = jest.fn();
    await render(
      <TestProviders>
        <ChoiceSheet decision={decision} disabled onSelect={onSelect} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByText('Jelaskan singkat'));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('menulis pertanyaannya dengan warna yang terbaca di atas gambar', async () => {
    /*
     * Pertanyaan ini duduk di atas ilustrasi panggung yang digelapkan gradasi,
     * bukan di atas permukaan aplikasi. Dengan `tone="secondary"` ia bernilai
     * GELAP pada tema terang dan lenyap ke dalam gambarnya.
     *
     * BUKTI MUTASI: kembalikan `tone="secondary"` pada prompt di `ChoiceSheet`,
     * lalu uji ini memerah.
     */
    await render(
      <TestProviders>
        <ChoiceSheet decision={decision} onSelect={() => {}} />
      </TestProviders>,
    );

    const gaya = StyleSheet.flatten(screen.getByText('Bagaimana kamu merespons?').props.style);
    expect(gaya.color).toBe('#FFFFFF');
  });
});

describe('Composer', () => {
  it('menonaktifkan tombol kirim saat draft kosong', async () => {
    const onSubmit = jest.fn();
    await render(
      <TestProviders>
        <Composer value="   " onChange={() => {}} onSubmit={onSubmit} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('composer-send'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mengirim draft yang berisi teks', async () => {
    const onSubmit = jest.fn();
    await render(
      <TestProviders>
        <Composer value="aku bertanya soal pekerjaan" onChange={() => {}} onSubmit={onSubmit} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('composer-send'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('menampilkan peringatan dan menonaktifkan kirim saat melebihi batas', async () => {
    const onSubmit = jest.fn();
    await render(
      <TestProviders>
        <Composer
          value={'a'.repeat(MAX_CUSTOM_ACTION_CHARS + 1)}
          onChange={() => {}}
          onSubmit={onSubmit}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Tindakanmu terlalu panjang. Pendekkan sedikit.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('GatewayErrorSheet', () => {
  it('memetakan rate limit ke pesan tanpa tombol coba lagi', () => {
    const copy = mapGatewayError({
      code: 'RATE_LIMITED',
      message: 'Terlalu cepat.',
      retryable: true,
      retryAfterSec: 30,
    });

    expect(copy.titleKey).toBe('gateway.rateLimitedTitle');
    expect(copy.canRetry).toBe(false);
  });

  it('mengizinkan coba lagi untuk gangguan jaringan', () => {
    const copy = mapGatewayError({
      code: 'NETWORK',
      message: 'Koneksi terputus.',
      retryable: true,
    });

    expect(copy.canRetry).toBe(true);
  });

  it('tidak menampilkan tombol coba lagi untuk blokir abuse (FR-74)', async () => {
    await render(
      <TestProviders>
        <GatewayErrorSheet
          error={{
            code: 'ABUSE_BLOCKED',
            message: 'Dijeda.',
            retryable: false,
            blockedUntil: new Date(Date.now() + 60_000).toISOString(),
          }}
          onRetry={() => {}}
          onDismiss={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.queryByTestId('error-retry')).toBeNull();
    expect(screen.getByTestId('error-dismiss')).toBeTruthy();
  });

  it('menampilkan tombol coba lagi untuk model yang tidak tersedia', async () => {
    await render(
      <TestProviders>
        <GatewayErrorSheet
          error={{ code: 'MODEL_UNAVAILABLE', message: 'Sedang tidak tersedia.', retryable: true }}
          onRetry={() => {}}
          onDismiss={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByTestId('error-retry')).toBeTruthy();
  });
});

describe('PlayerControls', () => {
  it('menandai kontrol aktif dan memanggil aksinya', async () => {
    const onPress = jest.fn();
    await render(
      <TestProviders>
        <PlayerControls
          items={[
            { id: 'auto', icon: 'pause', label: 'Auto aktif', active: true, onPress },
            { id: 'log', icon: 'book', label: 'Riwayat', onPress: () => {} },
          ]}
        />
      </TestProviders>,
    );

    const auto = screen.getByLabelText('Auto aktif');
    expect(auto.props.accessibilityState?.selected).toBe(true);

    await fireEvent.press(auto);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * Regresi "masih templat": kontrol pemutar harus TANPA bingkai.
   *
   * Pemilik produk melihat empat chip bergaris di layar pemain dan menyebutnya
   * templat. Perbaikannya adalah membuang bingkainya — dan itulah yang dijaga
   * di sini.
   *
   * Yang diperiksa BUKAN tangkapan layar, melainkan gaya yang benar-benar
   * terpasang pada simpul Pressable. Cara ini menangkap bingkai yang kembali
   * lewat `borderWidth`, `borderRadius`, atau `backgroundColor` per item —
   * ketiganya sama-sama membentuk kotak, jadi ketiganya harus kosong.
   */
  it('TIDAK memberi bingkai pada kontrolnya', async () => {
    await render(
      <TestProviders>
        <PlayerControls
          items={[
            { id: 'auto', icon: 'pause', label: 'Auto', active: true, onPress: () => {} },
            { id: 'log', icon: 'book', label: 'Riwayat', onPress: () => {} },
          ]}
        />
      </TestProviders>,
    );

    for (const label of ['Auto', 'Riwayat']) {
      const node = screen.getByLabelText(label);
      const gaya = StyleSheet.flatten(node.props.style);

      // Bingkai: tidak boleh ada, dalam bentuk apa pun.
      expect(gaya.borderWidth ?? 0).toBe(0);
      expect(gaya.borderColor).toBeUndefined();
      expect(gaya.borderRadius ?? 0).toBe(0);

      /*
       * Latar per item. Mode aktif DULU memakai `colors.bgMuted`, dan itulah
       * yang membuatnya tampak seperti chip. `transparent` (atau tidak diisi
       * sama sekali) berarti tidak ada kotak yang terbentuk.
       */
      const latar = gaya.backgroundColor;
      expect(latar === undefined || latar === 'transparent').toBe(true);
    }
  });

  /** Mode aktif tetap terbaca — tanpa bingkai, penandanya harus tetap ada. */
  it('tetap menandai mode aktif walau tanpa bingkai', async () => {
    await render(
      <TestProviders>
        <PlayerControls
          items={[
            { id: 'auto', icon: 'pause', label: 'Auto', active: true, onPress: () => {} },
            { id: 'log', icon: 'book', label: 'Riwayat', onPress: () => {} },
          ]}
        />
      </TestProviders>,
    );

    // Penanda mode aktif TIDAK boleh lagi bergantung pada warna teks saja:
    // warna aksen dipakai ulang untuk keadaan lain, sedangkan `selected`
    // adalah satu-satunya penanda yang dapat dibaca pembaca layar.
    expect(screen.getByLabelText('Auto').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByLabelText('Riwayat').props.accessibilityState?.selected).toBe(false);

    // Label tetap berupa TEKS tebal, bukan ikon saja.
    const teks = StyleSheet.flatten(screen.getByText('Auto').props.style);
    expect(String(teks.fontWeight)).toBe('700');
  });

  /**
   * Nada warna baris kontrol harus dapat diminta `onMedia`.
   *
   * Di layar pemain baris ini menumpang di atas ILUSTRASI. Dengan nada bawaan
   * (`'primary'`), labelnya bernilai gelap pada tema terang — terbaca di atas
   * langit-langit kantor yang terang, tetapi lenyap begitu adegannya berlatar
   * gelap. `onMedia` bernilai putih pada kedua tema.
   *
   * BUKTI MUTASI: hapus `tone={tone}` pada `PlayerControls` (kembalikan ke
   * `'primary'`), lalu uji ini memerah.
   */
  it('mengikuti nada `onMedia` saat diminta', async () => {
    await render(
      <TestProviders>
        <PlayerControls
          tone="onMedia"
          items={[{ id: 'log', icon: 'book', label: 'Riwayat', onPress: () => {} }]}
        />
      </TestProviders>,
    );

    const teks = StyleSheet.flatten(screen.getByText('Riwayat').props.style);
    expect(teks.color).toBe('#FFFFFF');
  });
});

describe('RelationNotice', () => {
  it('menampilkan status dan alasan publik', async () => {
    await render(
      <TestProviders>
        <RelationNotice
          notice={{
            id: 'n1',
            kind: 'relationship',
            npcId: 'npc_elysia',
            status: 'waspada',
            reasonPublic: 'Elysia menilai perilakumu melewati batas profesional.',
          }}
          npcName="Elysia"
          onDismiss={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Hubungan dengan Elysia: Waspada')).toBeTruthy();
    expect(
      screen.getByText('Elysia menilai perilakumu melewati batas profesional.'),
    ).toBeTruthy();
  });

  it('memanggil onDismiss saat ditutup', async () => {
    const onDismiss = jest.fn();
    await render(
      <TestProviders>
        <RelationNotice
          notice={{
            id: 'n2',
            kind: 'relationship',
            npcId: 'npc_elysia',
            status: 'normal',
            reasonPublic: 'Alasan.',
          }}
          npcName="Elysia"
          onDismiss={onDismiss}
        />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByLabelText('Tutup pemberitahuan'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('NPCInspector — daftar tokoh dan hubungannya', () => {
  /*
   * Pemilik produk menjelaskan fungsi panel ini: "tokoh itu untuk liat list nama
   * nama tokoh/npc (yang ada karakter) beserta hubungan statusnya".
   *
   * Komponen ini sebelumnya TIDAK PUNYA SATU PUN UJI. Yang dijaga di sini
   * persis yang ia sebutkan: nama, status hubungan, dan alasan publiknya.
   */
  const TOKOH = [
    {
      npcId: 'npc_rina',
      name: 'Rina',
      role: 'Atasanmu',
      soul: 'Keras di permukaan, tetapi menyimpan banyak hal.',
      relation: 'waspada' as const,
      reasonPublic: 'Kamu menyebut masa lalu di depan tim.',
    },
    {
      npcId: 'npc_leo',
      name: 'Leo',
      role: 'Rekan senior',
      soul: 'Santai sampai orang lain mengira ia tidak peduli.',
      relation: 'dekat' as const,
      reasonPublic: 'Ia menolongmu tanpa diminta.',
    },
  ];

  it('mendaftar nama, peran, dan status hubungan setiap tokoh', async () => {
    await render(
      <TestProviders>
        <NPCInspector visible characters={TOKOH} onClose={() => {}} />
      </TestProviders>,
    );

    // Nama muncul di kartu DAN di lencana hubungannya, jadi dihitung, bukan dicari satu.
    expect(screen.getAllByText('Rina').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Leo').length).toBeGreaterThan(0);
    expect(screen.getByText('Atasanmu')).toBeTruthy();

    // Status hubungan ditampilkan lewat label terjemahan, bukan enum mentah.
    expect(screen.getAllByText('Waspada').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dekat').length).toBeGreaterThan(0);
  });

  it('menyertakan ALASAN perubahan hubungan, bukan hanya statusnya', async () => {
    /*
     * FR-19: perubahan hubungan harus dapat dipercaya pemain, dan itu hanya
     * mungkin bila alasannya ikut ditampilkan. Status tanpa alasan terbaca
     * seperti angka yang berubah sendiri.
     */
    await render(
      <TestProviders>
        <NPCInspector visible characters={TOKOH} onClose={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('Kamu menyebut masa lalu di depan tim.')).toBeTruthy();
    expect(screen.getByText('Ia menolongmu tanpa diminta.')).toBeTruthy();
  });

  it('menampilkan keadaan kosong sebelum ada tokoh yang muncul', async () => {
    // Tokoh hanya masuk daftar setelah muncul di panggung (punya potret).
    await render(
      <TestProviders>
        <NPCInspector visible characters={[]} onClose={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('Belum ada tokoh yang muncul di perjalanan ini.')).toBeTruthy();
  });

  it('memanggil onClose dari tombol tutup', async () => {
    const onClose = jest.fn();
    await render(
      <TestProviders>
        <NPCInspector visible characters={TOKOH} onClose={onClose} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('inspector-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AutoDelayControl — pengatur jeda Auto', () => {
  /*
   * Kontrol ini menutup kontrol MATI: `engine.setAutoDelay` dan `autoDelayMs`
   * sudah ada sejak awal, lengkap dengan penjepitan 1–5 detik, tetapi NOL
   * pemanggil. Jeda Auto terpaku dan pemain tidak dapat mengubahnya — kemampuan
   * yang tidak pernah muncul, tanpa satu pun yang tampak rusak.
   */
  it('menampilkan seluruh pilihan jeda', async () => {
    await render(
      <TestProviders>
        <AutoDelayControl value={2000} onChange={() => {}} />
      </TestProviders>,
    );

    for (const ms of AUTO_DELAY_OPTIONS_MS) {
      expect(screen.getByTestId(`auto-delay-${String(ms)}`)).toBeTruthy();
    }
  });

  it('menandai pilihan yang sedang aktif lewat `selected`, bukan hanya warna', async () => {
    await render(
      <TestProviders>
        <AutoDelayControl value={3000} onChange={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByTestId('auto-delay-3000').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('auto-delay-1000').props.accessibilityState?.selected).toBe(false);
  });

  it('mengirim nilai dalam milidetik saat dipilih', async () => {
    const onChange = jest.fn();
    await render(
      <TestProviders>
        <AutoDelayControl value={2000} onChange={onChange} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('auto-delay-5000'));
    expect(onChange).toHaveBeenCalledWith(5000);
  });

  it('jeda bawaan HARUS salah satu pilihan yang tersedia', () => {
    /*
     * Kalau bawaan tidak cocok dengan pilihan mana pun, pengaturnya terbuka
     * tanpa satu pun pilihan tersorot — dan itu terbaca seperti kontrol yang
     * rusak, bukan seperti nilai bawaan.
     *
     * BUKTI MUTASI: ubah `DEFAULT_AUTO_DELAY_MS` menjadi 2200, lalu uji ini
     * memerah.
     */
    expect(AUTO_DELAY_OPTIONS_MS).toContain(DEFAULT_AUTO_DELAY_MS);
  });
});
