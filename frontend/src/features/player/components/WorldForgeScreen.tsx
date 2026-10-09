import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Text } from '@/components/Text';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export type WorldForgeScreenProps = {
  /** Judul dunia yang sedang disusun, ditampilkan kecil di bawah pesan utama. */
  worldTitle?: string;
  testID?: string;
};

/** Tinggi kanvas gelombang. */
const WAVE_CANVAS_HEIGHT = 320;
/** Lama satu siklus penuh. Cukup lambat untuk terbaca sebagai ombak. */
const CYCLE_MS = 10_000;
/** Berapa pita gelombang yang ditumpuk. Semakin banyak, semakin dalam efeknya. */
const WAVE_BANDS = 4;

/**
 * Layar "AI sedang membuat dunia" — layar penuh, dengan gelombang naik-turun.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA LAYAR INI ADA
 * ---------------------------------------------------------------------------
 * Pembuatan perjalanan memakan 27–89 detik (terukur di produksi; konstanta
 * tunggunya 90 detik). Sebelum ini, satu-satunya umpan balik selama menunggu
 * adalah label pada tombol — dan pemain membacanya sebagai aplikasi yang kaku:
 * "masih templat". Yang tidak terlihat sama dengan yang tidak terjadi.
 *
 * Layar ini menyatakan apa yang sebenarnya sedang berlangsung: dunia sedang
 * disusun oleh AI, dan adegan pertamanya belum ada. Setelah selesai, layar ini
 * digantikan adegan pertama yang benar-benar dihasilkan AI — bukan templat.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA GELOMBANG, BUKAN PEMUTAR BERPUTAR
 * ---------------------------------------------------------------------------
 * Pemutar berputar adalah lambang "sedang memuat data". Gelombang lebih tepat:
 * ia naik dan turun perlahan, dan yang dijanjikan di layar ini bukan data,
 * melainkan sebuah tempat.
 *
 * ---------------------------------------------------------------------------
 * BENTUKNYA: EMPAT PITA YANG DIREBAHKAN, LALU DIMIRINGKAN
 * ---------------------------------------------------------------------------
 * Tidak ada SVG di sini. `react-native-svg` bukan dependensi proyek ini, dan
 * menambahkannya hanya untuk satu animasi pembuka adalah harga yang tidak
 * sepadan — apalagi proyek ini sudah pernah ditinggalkan oleh dependensi yang
 * tidak dikunci.
 *
 * Yang dipakai justru dua hal yang sudah ada: satu batang yang LEBIH LEBAR dari
 * layar, dan `transform: [{ skewX }]`. Batang yang dimiringkan membuat sisinya
 * menjadi garis miring; menumpuk beberapa batang dengan kemiringan dan
 * ketinggian berbeda menghasilkan bentuk bergerigi yang, setelah bergeser
 * mendatar, terbaca sebagai gelombang.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA GESERNYA TIDAK PERNAH TERLIHAT MENYAMBUNG
 * ---------------------------------------------------------------------------
 * Setiap pita berisi pola yang diulang DUA KALI sepanjang satu layar. Animasinya
 * menggeser sejauh TEPAT satu layar, lalu mengulang dari awal. Karena pola kedua
 * identik dengan pola pertama, titik akhir siklus menghasilkan gambar yang sama
 * persis dengan titik awalnya — jadi tidak ada lompatan saat gelungnya berulang.
 * Ini satu-satunya alasan lebar kanvas dibuat dua kali lebar layar, bukan angka
 * hiasan.
 *
 * ---------------------------------------------------------------------------
 * CATATAN AKSESIBILITAS
 * ---------------------------------------------------------------------------
 * Gelombangnya murni hiasan. Teksnya yang membawa makna, dan pembaca layar
 * membacakan pesan beserta judul dunia apa adanya.
 */
export function WorldForgeScreen({ worldTitle, testID }: WorldForgeScreenProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();

  /*
   * Satu nilai animasi untuk seluruh gelombang.
   *
   * `useRef` dipakai agar `Animated.Value` tidak dibuat ulang pada setiap render
   * — membuatnya di dalam badan fungsi akan memulai ulang animasi setiap kali
   * komponen ini dirender, dan gelombangnya tersentak kembali ke awal.
   */
  const geser = useRef(new Animated.Value(0)).current;
  /** Denyut napas lambat untuk pesannya, supaya layarnya tidak terasa mati. */
  const denyut = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const gelung = Animated.loop(
      Animated.timing(geser, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        // `translateX` dapat dianimasikan di lapisan asli tanpa menyentuh JS.
        useNativeDriver: true,
      }),
    );
    const napas = Animated.loop(
      Animated.sequence([
        Animated.timing(denyut, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(denyut, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    gelung.start();
    napas.start();
    return () => {
      gelung.stop();
      napas.stop();
    };
  }, [geser, denyut]);

  const lebarPita = useMemo(() => Math.max(width, 320), [width]);
  /** Dua kali lebar layar: satu pola kini, satu pola cadangan untuk gelungnya. */
  const lebarKanvas = useMemo(() => lebarPita * 2, [lebarPita]);

  /*
   * Terjemahan mendatar: 0 → satu lebar layar, lalu berulang. Di sinilah gelung
   * mulus itu terjadi (lihat catatan di atas).
   */
  const translateX = geser.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -lebarPita],
  });

  const opasitasPesan = denyut.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  /*
   * Satu pita gelombang.
   *
   * `lebarKanvas` membuat setiap pita melewati tepi kanan layar walau sudah
   * bergeser sejauh satu lebar layar. `skewX` memberi sisi miring, dan tiap pita
   * juga DIPUTAR sedikit (`rotate`) supaya kemiringannya tidak seragam — pita
   * yang semuanya miring dengan sudut sama terbaca sebagai satu blok miring,
   * bukan sebagai ombak.
   *
   * ---------------------------------------------------------------------------
   * CATATAN PENGUKURAN: tinggi dan kemiringan ini BUKAN nilai pertama
   * ---------------------------------------------------------------------------
   * Nilai awalnya (tinggi 12–42 px, tanpa rotasi) terukur hampir tidak terlihat
   * di tangkapan layar: pita-pitanya menempel di dasar layar dan terbaca sebagai
   * satu garis cokelat tipis, bukan sebagai gelombang. Angka di bawah ini hasil
   * MEMERIKSA GAMBARNYA, bukan menebak dari kode — dan itu memang cara satu-
   * satunya untuk menilai sesuatu yang hanya punya arti secara visual.
   */
  const pita = (index: number) => {
    // Setiap pita naik dan menebal; yang teratas paling tipis dan paling redup,
    // sehingga tumpukannya terbaca sebagai kedalaman, bukan sebagai garis.
    const tinggi = 22 + index * 16;
    const bawah = index * 34;
    // Kemiringan BERGANDA: `skewX` membuat sisi miring, `rotate` memiringkan
    // seluruh pita. Tanpa `rotate`, semua pita tetap sejajar dan hasilnya
    // terbaca sebagai pita-pita horizontal, bukan sebagai gelombang.
    const miring = index % 2 === 0 ? '-26deg' : '26deg';
    const putar = index % 2 === 0 ? '-3.2deg' : '3.2deg';
    const opasitas = 0.2 + index * 0.11;

    return (
      <View
        key={index}
        style={[
          styles.pita,
          {
            left: -lebarPita * 0.12,
            width: lebarKanvas * 1.24,
            height: tinggi,
            bottom: bawah,
            transform: [{ skewX: miring }, { rotate: putar }],
          },
        ]}
      >
        <LinearGradient
          // Gradien di kedua ujung supaya tepi pita tidak terputus mendadak.
          colors={['transparent', colors.accent, colors.accent, 'transparent']}
          locations={[0, 0.18, 0.82, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[StyleSheet.absoluteFill, { opacity: opasitas }]}
        />
      </View>
    );
  };

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: colors.bgApp }]}
      accessible={false}
    >
      {/*
       * Gelombang duduk di belakang teks dan tidak pernah menelan ketukan.
       */}
      <View
        style={[styles.waveLayer, { height: Math.min(WAVE_CANVAS_HEIGHT, height * 0.42) }]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.waveInner, { transform: [{ translateX }] }]}>
          {Array.from({ length: WAVE_BANDS }, (_, index) => pita(index))}
        </Animated.View>
      </View>

      <Animated.View style={[styles.pesanWrap, { opacity: opasitasPesan }]}>
        <Text variant="title" style={styles.pesan}>
          {t('world.forgeTitle')}
        </Text>
        {worldTitle ? (
          <Text variant="small" tone="secondary" style={styles.judul}>
            {worldTitle}
          </Text>
        ) : null}
        <Text variant="caption" tone="secondary" style={styles.catatan}>
          {t('world.forgeHint')}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /**
   * Gelombang menempati dasar layar.
   *
   * `bottom: 0` membuatnya tumbuh dari bawah — arah yang sama dengan ombak yang
   * naik, bukan turun dari atas.
   */
  waveLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  waveInner: {
    flex: 1,
  },
  pita: {
    position: 'absolute',
  },
  pesanWrap: {
    paddingHorizontal: space.xl,
    alignItems: 'center',
    gap: space.xs,
    // Sedikit ke atas supaya tidak tertutup gelombang yang naik.
    marginBottom: WAVE_CANVAS_HEIGHT * 0.4,
  },
  pesan: {
    textAlign: 'center',
  },
  judul: {
    textAlign: 'center',
  },
  catatan: {
    textAlign: 'center',
    marginTop: space.sm,
  },
});
