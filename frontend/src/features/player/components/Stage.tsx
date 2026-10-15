import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssetImage } from '@/components/AssetImage';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import type { PresentedScene } from '../types';

import { withAlpha } from '@/theme/gradient';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Kekuatan blur latar saat karakter tampil. Diputuskan pemilik produk.
 *
 * Angka 4, BUKAN 12. Nilai 12 sempat dipilih, lalu terukur terlalu kuat: gambar
 * latar hanya selebar layar ponsel (~390 px), jadi `blur(12px)` menghapus hampir
 * seluruh detail ruangan dan menyisakan noda warna rata. Pemilik produk melihat
 * hasilnya dan memilih 4 — cukup untuk memisahkan karakter dari latar, tanpa
 * menghilangkan tempatnya.
 */
const BACKGROUND_BLUR_RADIUS = 4;

/** Tinggi gradasi pelindung di kaki panggung, sebagai bagian dari tinggi panggung. */
const SCRIM_HEIGHT = '58%';

/**
 * Gradasi tipis di kepala panggung.
 *
 * HUD (hubungan, tempat, tombol) duduk di atas ilustrasi. Tanpa penggelapan di
 * belakangnya, teks putihnya hilang begitu latarnya langit terang — dan itu
 * terjadi pada gambar apa pun, bukan hanya pada tema terang. Jauh lebih tipis
 * daripada gradasi kaki, karena di sini tidak ada kalimat panjang yang dibaca.
 */
const TOP_SCRIM_HEIGHT = '22%';
const TOP_SCRIM_ALPHA = 0.6;

/**
 * Kekuatan gelap di ujung terbawah gradasi kaki.
 *
 * Dipatok mendekati pekat karena di bawahnya duduk TEKS CERITA. Kepekatan pada
 * POSISI kalimatnya diatur oleh `locations` di `STAGE_SCRIM`, bukan oleh angka
 * ini — angka ini hanya ujungnya.
 */
const SCRIM_ALPHA = 0.97;

/**
 * Warna gradasi, DIPATOK — bukan token tema.
 *
 * Panggung berdiri di atas GAMBAR, bukan di atas latar aplikasi. Gambar tidak
 * ikut berubah saat tema berganti, jadi gradasi yang "benar" di tema terang
 * belum tentu terbaca di tema gelap. Hitam adalah pilihan yang stabil di
 * atas ilustrasi apa pun.
 */
const SCRIM_INK = '#000000';

/**
 * Warna gradasi pelindung panggung, beserta posisi tiap perhentiannya.
 *
 * Diekspor supaya KEPUTUSANNYA dapat diuji. Di dalam pohon render, `colors`
 * sudah dinormalkan `expo-linear-gradient` menjadi bilangan bulat, sehingga uji
 * tidak lagi dapat membaca "seberapa pekat" gradasinya — dan uji yang tidak
 * dapat membaca nilainya tidak menjaga apa pun.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA PERHENTIANNYA EMPAT, BUKAN DUA
 * ---------------------------------------------------------------------------
 * Bentuk dua-perhentian (`0 → 0,94`) menaikkan kepekatan SECARA LINIER sepanjang
 * 58% layar. Akibatnya di posisi kalimat cerita (≈77% tinggi layar) kepekatannya
 * baru **≈0,58** — dan di atas lantai kantor yang terang, teks putihnya terbaca
 * samar. Dua peninjau visual menemukannya dari tangkapan layar, dan hitungannya
 * cocok: `0,94 × (0,775 − 0,42) / 0,58 ≈ 0,58`.
 *
 * Sekarang rampasannya menanjak lebih cepat: 0,40 pada 30% panjang gradasi dan
 * 0,85 pada 60% — sehingga di posisi kalimat kepekatannya ≈0,85, cukup untuk
 * teks putih di atas latar seterang apa pun.
 *
 * Ujung atasnya `rgba(0,0,0,0)` — BUKAN `'transparent'`. Di React Native
 * `transparent` adalah `rgba(0,0,0,0)`, jadi keduanya sebenarnya sama; ditulis
 * eksplisit lewat `withAlpha` supaya maksudnya terbaca dan tidak ada yang
 * tergoda menggantinya dengan kata `'transparent'`.
 */
export const STAGE_SCRIM = {
  bottom: {
    colors: [
      withAlpha(SCRIM_INK, 0),
      withAlpha(SCRIM_INK, 0.4),
      withAlpha(SCRIM_INK, 0.85),
      withAlpha(SCRIM_INK, SCRIM_ALPHA),
    ],
    locations: [0, 0.3, 0.6, 1],
  },
  top: {
    colors: [withAlpha(SCRIM_INK, TOP_SCRIM_ALPHA), withAlpha(SCRIM_INK, 0)],
    locations: [0, 1],
  },
} as const;

export type StageProps = {
  scene: PresentedScene;
  /** Nama karakter fokus, bila ada. */
  focusName: string | null;
  /** Label lokasi untuk pembaca layar dan placeholder latar. */
  locationLabel?: string;
  /**
   * URL latar yang SIAP DIMUAT, atau undefined bila belum ada.
   *
   * Panggung tidak mencari sendiri di manifest: ia tidak memegang dunia, hanya
   * satu adegan. Pemanggilnya yang menyelesaikan id menjadi URL.
   */
  backgroundUri?: string | undefined;
  /** URL potret karakter fokus yang siap dimuat. */
  portraitUri?: string | undefined;
  /**
   * Ketukan di area kosong panggung. Dipakai oleh layar pemain untuk majukan
   * cerita (FR-16) — seluruh panggung ditanami Pressable di belakang seluruh
   * lapisan lain; tombol HUD, dialog, dan nav berada di atas dan menelan
   * ketukannya sendiri, sehingga yang sampai ke sini adalah ketukan pada
   * latar, potret, atau area kosong.
   */
  onTap?: () => void;
  /**
   * Lapisan yang digambar DI ATAS latar, potret, dan gradasi — HUD, teks, dan
   * kendali.
   *
   * Panggung tidak tahu apa pun tentang isinya. Bentuk sebelumnya menaruh kotak
   * dialog sebagai SAUDARA panggung di dalam satu kolom, sehingga gambar hanya
   * mengisi sisa layar dan separuh bawahnya menjadi kotak hitam. Dengan slot ini
   * seluruh layar dapat dipakai gambar, dan teksnya duduk di atasnya.
   */
  children?: React.ReactNode;
  testID?: string;
};

/**
 * Panggung visual novel — PENUH LAYAR.
 *
 * Latar mengisi SELURUH area layar, potret karakter fokus berdiri di kakinya,
 * dan gradasi gelap menjaga agar teks yang menumpang di atasnya tetap terbaca
 * (docs/05 §6). Tidak ada bingkai, tidak ada kotak, dan tidak ada sisa area yang
 * disisihkan untuk panel.
 *
 * ---------------------------------------------------------------------------
 * KENAPA URL-NYA DIKIRIM, BUKAN ID-nya
 * ---------------------------------------------------------------------------
 * Bentuk pertama komponen ini hanya menerima ID aset, dan karena itu ia TIDAK
 * PERNAH dapat menggambar apa pun — ia hanya menampilkan bidang netral berlabel.
 * Itu benar selama aset belum ada, tetapi menjadi bug senyap begitu asetnya ada:
 * latar dan potret tetap kosong, tanpa galat, dan tampilannya masuk akal.
 *
 * Sekarang URL-nya datang dari pemanggil, yang memang memegang `assetManifest`.
 * Bidang netral tetap dipakai sebagai CADANGAN saat URL-nya tidak ada — bukan
 * sebagai satu-satunya tampilan.
 */
export function Stage({
  scene,
  focusName,
  locationLabel,
  backgroundUri,
  portraitUri,
  onTap,
  children,
  testID,
}: StageProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const hasBackground = Boolean(backgroundUri);
  const hasPortrait = Boolean(portraitUri);

  /*
   * Latar diblur HANYA saat ada karakter.
   *
   * Alasannya bukan sekadar gaya. Potret karakter adalah PNG tembus pandang yang
   * berdiri di atas latar; latar yang tajam dan ramai (papan tulis, jendela,
   * meja berderet) menarik mata menjauh dari karakter dan membuat potretnya
   * terbaca seperti tempelan. Diblur, latar tetap memberi tahu pemain DI MANA
   * adegan ini berlangsung, tanpa bersaing dengan siapa yang sedang bicara.
   *
   * Saat tidak ada karakter, latar dibiarkan tajam: pada adegan pembuka ruangan
   * kosong itulah yang justru ingin dilihat pemain.
   *
   * Kekuatan blurnya ada di BACKGROUND_BLUR_RADIUS; angkanya TIDAK diulang di
   * sini. Dulu kalimat ini berbunyi "angkanya 12" sementara konstantanya 4 —
   * komentar yang menyebut angka dua kali akan menyimpang begitu salah satunya
   * diubah, dan pembaca berikutnya mempercayai yang salah. Satu tempat saja.
   */
  const backgroundBlur = hasPortrait ? BACKGROUND_BLUR_RADIUS : 0;

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: colors.placeholder }]}>
      {/* Latar — menutupi SELURUH panggung, bukan mengikuti rasio gambarnya. */}
      <View
        style={[styles.background, { backgroundColor: colors.placeholder }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          locationLabel
            ? `${t('player.stageBackgroundLabel')}: ${locationLabel}${hasBackground ? '' : `. ${t('player.stageBackgroundPlaceholder')}`}`
            : t('player.stageBackgroundUnavailable')
        }
      >
        {hasBackground ? (
          <AssetImage
            uri={backgroundUri as string}
            accessibilityLabel={locationLabel ?? t('player.stageBackgroundLabel')}
            contentFit="cover"
            blurRadius={backgroundBlur}
            style={styles.backgroundImage}
          />
        ) : (
          <View style={styles.backgroundPlaceholder}>
            <Icon name="book" size={30} color={colors.inkSecondary} />
            <Text variant="caption" tone="secondary">
              {t('player.stageBackgroundUnavailable')}
            </Text>
          </View>
        )}
      </View>

      {/*
        * Portrait karakter fokus — berdiri memenuhi frame, bahu terpotong
        * pinggir. Lihat `styles.portrait` di bawah untuk alasannya.
        *
        * `accessible={false}` di PEMBUNGKUS — tetapi TIDAK
        * `importantForAccessibility="no-hide-descendants"`.
        *
        * Pembungkus ini membentang SELURUH layar; kalau ia `accessible`, pembaca
        * layar memunculkan satu kotak fokus sebesar layar untuknya, di samping
        * potret yang sudah punya labelnya sendiri di dalam. Yang dibuang hanya
        * peran pembungkusnya — anaknya (gambar potret) TETAP diumumkan, karena
        * itulah satu-satunya suara yang memberi tahu pemain siapa yang tampil.
        *
        * BUKTI MUTASI: tambahkan `importantForAccessibility="no-hide-descendants"`
        * pada pembungkus ini, lalu uji "menggambar potret saat karakter masuk"
        * memerah — nama tokoh hilang sama sekali dari pohon aksesibilitas.
        */}
      {scene.focusPortraitAssetId ? (
        <View style={styles.portraitWrap} accessible={false}>
          {hasPortrait ? (
            <AssetImage
              uri={portraitUri as string}
              accessibilityLabel={focusName ?? 'Karakter'}
              contentFit="contain"
              style={styles.portrait}
            />
          ) : (
            <View
              style={[
                styles.portrait,
                styles.portraitPlaceholder,
                { backgroundColor: colors.bgMuted, borderColor: colors.line },
              ]}
            >
              <Icon name="book" size={34} color={colors.inkSecondary} />
              <Text variant="caption" tone="secondary" center>
                {focusName ?? t('player.stageCharacterLoading')}
              </Text>
              {scene.focusExpression ? (
                <Text variant="caption" tone="secondary" center>
                  ({scene.focusExpression})
                </Text>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {/*
        * Gradasi pelindung di kaki panggung.
        *
        * Menggantikan kotak dialog hitam pekat. Bedanya bukan sekadar gaya: kotak
        * itu memotong gambar tepat di atas kepala pemain dan membuat separuh
        * layar tidak lagi terpakai. Gradasi memberi latar yang sama gelapnya
        * untuk teks, tetapi gambar tetap mengalir sampai tepi bawah.
        *
        * Ujung atasnya `rgba(0,0,0,0)` — BUKAN `'transparent'`. Di React Native
        * `transparent` adalah `rgba(0,0,0,0)`, jadi keduanya sebenarnya sama;
        * ditulis eksplisit lewat `withAlpha` supaya maksudnya terbaca dan tidak
        * ada yang tergoda menggantinya dengan kata `'transparent'` yang di
        * peramban berperilaku berbeda saat diinterpolasi.
        *
        * `pointerEvents="none"`: gradasi tidak boleh menelan ketukan yang
        * memajukan cerita.
        */}
      {/*
        * Gradasi kepala — penjaga kontras untuk HUD.
        *
        * Digambar SETELAH gradasi kaki supaya teks cerita (yang merupakan anak
        * `children` di bawah) menumpang di atas KEDUA gradasi. Urutan ini
        * penting: bila gradien ditukar, teks narasi akan terkubur di bawah
        * hitam pekat yang tidak relevan.
        */}
      <LinearGradient
        testID="stage-scrim-bottom"
        colors={[...STAGE_SCRIM.bottom.colors]}
        locations={[...STAGE_SCRIM.bottom.locations]}
        style={styles.scrim}
        pointerEvents="none"
        accessible={false}
      />

      {/* Gradasi kepala — penjaga kontras untuk HUD. */}
      <LinearGradient
        testID="stage-scrim-top"
        colors={[...STAGE_SCRIM.top.colors]}
        locations={[...STAGE_SCRIM.top.locations]}
        style={styles.topScrim}
        pointerEvents="none"
        accessible={false}
      />

      {/*
        * Tap-ke-maju menyeluruh. Pressable ini dibungkus DI BELAKANG seluruh
        * lapisan di atasnya (HUD, teks, nav). Tombol-tombol itu menelan
        * ketukannya sendiri-sendiri, yang sampai ke sini adalah ketukan pada
        * latar, potret, atau area kosong panggung.
        *
        * Sebelumnya hanya `StageText` yang bisa menerima ketukan, dan yang
        * diluar strip teks menjadi mati (FR-16). Risiko: tombol decision
        * akan tetap berfungsi (mereka menelan ketukannya); StageText pun tetap
        * berfungsi (mereka menelan ketukannya juga). Untuk keputusan yang
        * menunggu, pemanggil dapat memutuskan untuk tidak memanggil `onTap`.
        */}
      {/*
        * Tap-ke-maju menyeluruh. Pressable ini dibungkus DI BELAKANG seluruh
        * lapisan di atasnya (HUD, teks, nav). Tombol-tombol itu menelan
        * ketukannya sendiri-sendiri, yang sampai ke sini adalah ketukan pada
        * latar, potret, atau area kosong panggung.
        *
        * Sebelumnya hanya `StageText` yang bisa menerima ketukan, dan yang
        * diluar strip teks menjadi mati (FR-16). Risiko: tombol decision
        * akan tetap berfungsi (mereka menelan ketukannya); StageText pun tetap
        * berfungsi (mereka menelan ketukannya juga). Untuk keputusan yang
        * menunggu, pemanggil dapat memutuskan untuk tidak memanggil `onTap`.
        *
        * `accessible={false}` — dan BUKAN `importantForAccessibility`. Area ini
        * murni untuk pengguna yang melihat: pembaca layar sudah punya tombol
        * dialog eksplisit untuk majukan cerita, dan mengumumkan satu tombol
        * sebesar seluruh layar hanya akan mengaburkan yang lain.
        * `importantForAccessibility="no-hide-descendants"` juga TIDAK dipakai
        * karena ia menyembunyikan simpul ini dari SELURUH kueri — termasuk
        * `getByTestId` di uji — sehingga penjaganya tidak bisa menemukannya.
        */}
      {onTap ? (
        <Pressable
          testID="player-stage-tap"
          style={styles.tapCatcher}
          onPress={onTap}
          accessible={false}
        />
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Latar mengisi seluruh panggung.
   *
   * "absoluteFill" tidak dipakai karena AssetImage membungkus gambarnya dalam
   * View ber-aspectRatio; latar harus menutupi area, bukan mengikuti rasionya.
   */
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    // Sampul panggung menyentuh tepi layar; sudut membulat di sini hanya akan
    // memotong gambarnya tanpa alasan.
    borderRadius: 0,
  },
  backgroundPlaceholder: {
    alignItems: 'center',
    gap: space.xs,
    opacity: 0.7,
  },
  portraitWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  /**
   * Potret karakter fokus — TANPA bingkai dan TANPA sudut membulat.
   *
   * Bentuk sebelumnya memberi `borderTopLeftRadius`/`borderTopRightRadius` 120
   * plus `borderWidth` satu helai, sehingga tergambar LENGKUNGAN seperti pintu
   * di sekeliling karakter. Pemilik produk melihatnya sebagai "frame di pinggir
   * karakter" — dan memang bukan bagian dari ilustrasinya: potret sudah punya
   * siluetnya sendiri yang tembus pandang, jadi lengkungan tambahan itu hanya
   * garis asing yang menempel di ruang kosong.
   *
   * Radius DAN garis tepinya dibuang bersama: menyisakan salah satunya tetap
   * memperlihatkan bentuk lengkung yang sama. `borderRadius: 0` di sini juga
   * menimpa sudut membulat bawaan `AssetImage` — pada potret yang memenuhi
   * lebar layar, sudut itu terlihat sebagai potongan di bahu tokoh.
   *
   * Bentuk SEBELUM dilakukan:
   *   `width:'100%' + aspectRatio 2/3` → tinggi = 1,5 × lebar. Untuk layar 390px,
   *   tinggi = 585px — tokoh hanya mengisi ~70% dari layar 844px, dan ada ruang
   *   kosong yang cukup besar di atas kepala.
   *
   * Bentuk SEKARANG MENGISI FRAME (pemilik produk menunjuk komposisi ini lewat
   * tiga tangkapan layar): `height:'100%'` — tinggi mengikuti layar, lebar
   * diturunkan sebagai `w/h = 2/3`. Untuk layar 390×844 → lebar = 563, menepih
   * ~86 px di kiri dan kanan. Sama dengan referensi: bahu tokoh terpotong
   * pinggir, kepala dan dada penuh. `overflow:'hidden'` di root memastikan
   * potongannya rapi, bukan melepuh keluar layar.
   */
  portrait: {
    height: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  /**
   * Hanya untuk CADANGAN saat gambar potret belum tersedia.
   *
   * Di sinilah garis tepi masih berguna: tanpa gambar, bidang ini tidak punya
   * siluet apa pun dan akan lenyap ke dalam latar. Pada potret sungguhan, garis
   * itu justru menjadi lengkungan asing yang mengelilingi karakter.
   */
  portraitPlaceholder: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCRIM_HEIGHT,
  },
  topScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: TOP_SCRIM_HEIGHT,
  },
  /**
   * Tap catcher untuk maju cerita. `position:'absolute'` dengan `top/left/right/
   * bottom:0` mengisi SELURUH panggung; tombol-tombol di atasnya (HUD, dialog,
   * nav, choice sheet) menelan ketukannya sendiri sehingga yang sampai ke
   * sini adalah area kosong.
   */
  tapCatcher: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
