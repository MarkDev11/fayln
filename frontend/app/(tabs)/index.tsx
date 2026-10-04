import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { HeroCard } from '@/components/HeroCard';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { SectionHeader } from '@/components/SectionHeader';
import { StateView } from '@/components/StateView';
import { StoryCard } from '@/components/StoryCard';
import { Text } from '@/components/Text';

import { useGateway } from '@/data/GatewayProvider';
import { StoryGatewayError } from '@/data/gateway';
import {
  useCatalog,
  useJourneys,
  useNewWorlds,
  useTopWorlds,
  useUpdatedWorlds,
  useUsage,
} from '@/data/queries';
import { QuotaSheet } from '@/features/home/QuotaSheet';
import { JourneyCard } from '@/features/journeys/JourneyCard';
import { formatCount } from '@/domain/format';
import { genreLabelKey, worldStatusLabelKey } from '@/domain/labels';
import {
  GENRES,
  type GenreId,
  type WorldCatalogItem,
  type WorldStatus,
} from '@/domain/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatRelativeDay, useI18n } from '@/i18n';
import { telemetry } from '@/telemetry/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const GRID_COLUMNS = 2;
const HERO_FEATURED_LIMIT = 4;
const RESUME_LIMIT = 3;
const RAIL_CARD_WIDTH = 132;
const RESUME_CARD_WIDTH = 300;

/**
 * Jumlah kartu yang ditampilkan di rail tetap.
 *
 * `TOP_RAIL_LIMIT` disetel 10 karena judul railnya menyebut "Top 10" — menampilkan
 * lebih sedikit daripada yang dijanjikan judul adalah kebohongan kecil yang tidak
 * perlu. Rail tetap memuatnya dari server, jadi angka ini juga batas permintaan.
 */
const TOP_RAIL_LIMIT = 10;
const RAIL_LIMIT = 10;

/**
 * Minimal kandidat sebelum sebuah rail ditampilkan.
 *
 * Satu kartu sendirian di dalam rail terbaca seperti baris yang rusak, bukan
 * seperti pilihan. Untuk rail peringkat ambangnya lebih tinggi: "Top 10" yang
 * berisi dua dunia bukan peringkat, melainkan seluruh katalog.
 */
const MIN_RAIL_ITEMS = 2;
const MIN_TOP_ITEMS = 3;

/** Durasi animasi masuk daftar saat saringan berubah. */
const FILTER_REVEAL_MS = 260;

/**
 * Batas atas kueri status dunia. Sengaja longgar supaya seluruh katalog muat.
 * Bila katalog kelak melampaui angka ini, jalan yang benar adalah membawa
 * `worldStatus` bersama `JourneySummary` dari gateway — bukan memperbesar angka ini.
 */
const STATUS_PAGE_SIZE = 50;

/**
 * Jeda geser otomatis hero.
 *
 * Cukup lama untuk membaca judul dan genre, cukup pendek agar hero terasa hidup.
 */
const HERO_AUTOSLIDE_MS = 5000;

/**
 * Durasi animasi tajuk ⇄ pencarian, terpisah per arah.
 *
 * Membuka sengaja lebih lambat daripada menutup. Bilah pencarian datang dari
 * luar layar dan harus terbaca sebagai sesuatu yang masuk; pada durasi yang sama
 * dengan menutup, kedatangannya terasa menyentak.
 */
const SEARCH_OPEN_MS = 700;
const SEARCH_CLOSE_MS = 520;

/**
 * Perluasan area sentuh chip: vertikal 8 agar mencapai 48 unit logis, horizontal 0
 * agar tidak tumpang tindih dengan chip sebelah (docs/05 §8.3).
 */
const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 0, right: 0 } as const;

type PublishedItem = Pick<WorldCatalogItem, 'publishedAt' | 'worldId'>;

/**
 * Urutan deterministik: `publishedAt` menurun, dipecah oleh `worldId` naik.
 * Tanpa tie-break, urutan dapat berubah antar render.
 */
function byPublishedAtDesc(a: PublishedItem, b: PublishedItem): number {
  if (a.publishedAt === b.publishedAt) {
    return a.worldId < b.worldId ? -1 : 1;
  }
  return a.publishedAt < b.publishedAt ? 1 : -1;
}

function isGatewayCode(error: Error | null, code: string): boolean {
  return error instanceof StoryGatewayError && error.code === code;
}

/**
 * Beranda (SC-01).
 *
 * Dua peran sekaligus: pintu kembali ke cerita yang sedang berjalan (blok
 * "Lanjutkan Bermain") dan etalase penemuan yang dapat dipindai dalam satu layar.
 *
 * Urutan vertikal: tajuk + pencarian → hero → chip genre → Lanjutkan Bermain →
 * Baru Diperbarui → Semua Cerita. Blok "Lanjutkan Bermain" naik ke ATAS hero
 * saat perjalanan teratas punya adegan belum dibaca dan saringan tidak aktif
 * (A1) — pemain yang baru saja meninggalkan cerita tidak perlu menggulir
 * melewati etalase untuk kembali.
 *
 * Tidak ada metrik yang diada-adakan: satu-satunya angka yang tampil adalah milik
 * pemain sendiri (beat dan jumlah keputusan) atau berasal dari data dunia.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const gateway = useGateway();

  const [searchInput, setSearchInput] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<GenreId[]>([]);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  /** Dinaikkan setiap pemain memilih halaman sendiri; menyetel ulang jeda geser. */
  const [heroInteractionTick, setHeroInteractionTick] = useState(0);
  /**
   * Bilah pencarian SELALU terpasang, hanya menunggu di luar layar.
   *
   * Sebelumnya ia baru dipasang saat dibuka, dan itu penyebab keluhan "tiba-tiba
   * muncul": pada bingkai pertama setelah pemasangan, gaya animasinya belum
   * sempat terpasang sehingga bilah sempat ter-render pada posisi 0 — penuh di
   * layar — sebelum animasinya mendorongnya keluar lalu meluncurnya masuk.
   * Selalu terpasang berarti tidak ada bingkai pertama seperti itu.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  /** Lembar pemakaian kuota ringkas (C1) sedang terbuka. */
  const [quotaOpen, setQuotaOpen] = useState(false);
  /** 0 = tajuk biasa, 1 = bilah pencarian penuh. */
  const searchProgress = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);

  /**
   * Animasi masuk daftar saat saringan berubah.
   *
   * Nilainya dinaikkan setiap chip ditekan; satu efek menurunkannya kembali ke 0
   * lalu menghidupkannya ke 1. Pola ini dipakai, bukan `Animated.loop` atau
   * animasi per kartu, karena yang perlu terasa adalah "daftar ini baru" — bukan
   * tujuh animasi terpisah yang saling bersaing perhatian.
   */
  const filterReveal = useRef(new Animated.Value(1)).current;

  /**
   * Lebar halaman hero diambil dari lebar jendela, bukan dari `onLayout`.
   *
   * Hero memenuhi lebar layar, jadi lebarnya sudah diketahui tanpa perlu diukur.
   * `onLayout` terbukti rapuh di sini: ia kadang tidak melaporkan lebar sama
   * sekali, dan saat itu terjadi setiap halaman kehilangan lebar sehingga kartu
   * menyusut jadi nol dan hero menghilang tanpa galat apa pun.
   */
  const { width: windowWidth } = useWindowDimensions();
  const heroPageWidth = Math.max(windowWidth, 1);
  const heroRef = useRef<ScrollView>(null);

  const debouncedSearch = useDebouncedValue(searchInput, 250);

  const query = useMemo(
    () => ({ search: debouncedSearch, genres: selectedGenres, page: 1, pageSize: 20 }),
    [debouncedSearch, selectedGenres],
  );

  const catalog = useCatalog(query);
  const journeys = useJourneys();
  const usage = useUsage();

  /**
   * Dua rail tetap: peringkat mingguan dan rilis terbaru.
   *
   * Keduanya SENGAJA tidak mengikuti chip genre maupun pencarian. Alasannya sama
   * dengan "Lanjutkan Bermain": keduanya adalah etalase lintas katalog, bukan
   * hasil pencarian. Menyaringnya akan membuat "Top 10 Minggu Ini" berubah makna
   * menjadi "Top 10 di antara yang Anda saring" — dan itu bukan yang tertulis.
   */
  const topWorlds = useTopWorlds(TOP_RAIL_LIMIT);
  const newWorlds = useNewWorlds(RAIL_LIMIT);
  const updatedWorlds = useUpdatedWorlds(RAIL_LIMIT);

  /**
   * Katalog TANPA saringan, khusus untuk peta status dunia.
   *
   * Dipisahkan dari `catalog` karena `catalog` mengikuti chip genre dan kolom
   * pencarian. Bila peta status dibangun dari hasil yang sudah tersaring, label
   * "Diarsipkan" pada kartu "Lanjutkan Bermain" ikut hilang begitu pemain
   * menyaring dunia itu keluar dari hasil — tepat pada kasus yang peringatannya
   * paling dibutuhkan (NFR-12: status dunia wajib berupa teks).
   *
   * Ketika tidak ada saringan aktif, kunci kuerinya sama dengan `query`, sehingga
   * react-query memakai entri cache yang sama dan tidak ada permintaan tambahan.
   */
  const statusQuery = useMemo(
    () => ({ search: '', genres: [] as GenreId[], page: 1, pageSize: STATUS_PAGE_SIZE }),
    [],
  );
  const statusCatalog = useCatalog(statusQuery);

  const openWorld = useCallback(
    (worldId: string) => {
      telemetry.track('world_detail_view', { simulator: gateway.isSimulator });
      router.push(`/world/${worldId}`);
    },
    [router, gateway],
  );

  /** Beranda = melanjutkan; tab Perjalanan = mengelola (SC-01.7). */
  const openPlayer = useCallback(
    (journeyId: string) => {
      router.push(`/player/${journeyId}`);
    },
    [router],
  );

  /**
   * Memicu animasi masuk daftar.
   *
   * Dipisahkan dari `toggleGenre` supaya chip "Semua genre" dan tombol setel ulang
   * juga mendapat animasi yang sama — tanpa itu, menghapus saringan terasa seperti
   * daftar yang tiba-tiba berkedip kembali.
   *
   * `useNativeDriver: false` karena yang dianimasikan adalah `opacity` DAN
   * `translateY`, dan runtime web tidak mendukung keduanya lewat driver native.
   * Bila dipaksa `true`, animasinya diam-diam tidak berjalan di peramban.
   */
  const playFilterReveal = useCallback(() => {
    filterReveal.setValue(0);
    Animated.timing(filterReveal, {
      toValue: 1,
      duration: FILTER_REVEAL_MS,
      // `out` saja: daftar datang lalu melambat. `inOut` akan terasa seperti
      // ditarik dua kali — pelan di awal, lalu tersentak di tengah.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [filterReveal]);

  const toggleGenre = useCallback(
    (genre: GenreId) => {
      const next = selectedGenres.includes(genre)
        ? selectedGenres.filter((item) => item !== genre)
        : [...selectedGenres, genre];

      setSelectedGenres(next);
      playFilterReveal();
      // Tanpa teks: hanya jumlah filter yang dikirim (NFR-10).
      telemetry.track('catalog_filter_apply', { count: next.length, simulator: gateway.isSimulator });
    },
    [selectedGenres, gateway, playFilterReveal],
  );

  /** Chip "Semua genre": mengosongkan pilihan genre (SC-01.3). */
  const clearGenres = useCallback(() => {
    setSelectedGenres([]);
    playFilterReveal();
    telemetry.track('catalog_filter_apply', { count: 0, simulator: gateway.isSimulator });
  }, [gateway, playFilterReveal]);

  /** Aksi `common.reset` pada keadaan hasil kosong: genre dan pencarian dibersihkan. */
  const resetFilters = useCallback(() => {
    setSelectedGenres([]);
    setSearchInput('');
    playFilterReveal();
  }, [playFilterReveal]);

  const items = catalog.data?.items ?? [];
  const hasFilters = selectedGenres.length > 0 || debouncedSearch.trim().length > 0;

  /** Dunia unggulan: hanya `published`, karena tombol "Mulai" tidak boleh berbohong. */
  const featured = useMemo(
    () =>
      items
        .filter((item) => item.status === 'published')
        .sort(byPublishedAtDesc)
        .slice(0, HERO_FEATURED_LIMIT),
    [items],
  );

  /**
   * Rail "Baru Diperbarui" — dunia yang isinya paling baru DISUNTING.
   *
   * Sebelumnya rail ini diturunkan dari katalog lalu diurutkan dengan
   * `publishedAt`, sehingga isinya identik dengan "Terbaru Dirilis": nama
   * berbeda, isi kembar. Sekarang sumbernya endpoint tersendiri yang mengurutkan
   * menurut waktu revisi terakhir, dan waktunya dibawa di `updatedAt`.
   *
   * Hanya dunia `published`. Baris ini menawarkan cerita untuk DIMULAI, jadi
   * dunia yang sudah diarsipkan tidak boleh muncul di sini — menawarkannya
   * berarti mengantar pemain ke jalan buntu. Dunia arsip tetap terlihat di
   * "Semua Cerita" beserta label statusnya, jadi tidak ada yang disembunyikan.
   */
  const updatedItems = useMemo(() => {
    const heroWorldId = featured[0]?.worldId;
    return (updatedWorlds.data ?? []).filter((item) => item.worldId !== heroWorldId);
  }, [updatedWorlds.data, featured]);

  /**
   * Isi rail "Terbaru Dirilis".
   *
   * Dunia pertama di hero disembunyikan agar tidak muncul dua kali di satu layar —
   * aturan yang sama dengan rail "Baru Diperbarui".
   */
  const newItems = useMemo(() => {
    const heroWorldId = featured[0]?.worldId;
    return (newWorlds.data ?? []).filter((item) => item.worldId !== heroWorldId);
  }, [newWorlds.data, featured]);

  /**
   * Data rail "Top 10 Minggu Ini".
   *
   * `ranked` adalah daftar APA ADANYA dari server — dipakai untuk memutuskan
   * apakah rail layak tampil. `visible` adalah daftar yang benar-benar
   * digambar, setelah dunia yang sudah tampil di hero dibuang agar tidak
   * muncul dua kali di satu layar.
   *
   * Keduanya dipisah karena ambang kelayakan harus dinilai atas daftar asli,
   * BUKAN atas daftar yang sudah dipotong hero. Peringkat asli 3 entri memang
   * peringkat; setelah hero memakan #1 ia menyisakan 2 kartu — dan dua kartu
   * tetap daftar peringkat yang sah. Menilai ambang setelah pemotongan akan
   * membuat rail ini lenyap di katalog kecil justru karena hero kebetulan
   * memuat juaranya, yaitu kasus yang paling mungkin terjadi.
   */
  const rankedTopItems = topWorlds.data?.items ?? [];
  const topItems = useMemo(() => {
    const heroWorldId = featured[0]?.worldId;
    return rankedTopItems.filter((item) => item.worldId !== heroWorldId);
  }, [rankedTopItems, featured]);

  const gridRows = useMemo(() => {
    const rows: WorldCatalogItem[][] = [];
    for (let index = 0; index < items.length; index += GRID_COLUMNS) {
      rows.push(items.slice(index, index + GRID_COLUMNS));
    }
    return rows;
  }, [items]);

  /**
   * Peta status dunia — sumber utamanya katalog TANPA saringan.
   *
   * `items` hanya dipakai sebagai cadangan untuk menutup selang waktu sebelum
   * kueri status selesai; ia tidak boleh menjadi sumber utama karena isinya ikut
   * tersaring oleh chip dan pencarian.
   */
  const statusByWorldId = useMemo(() => {
    const map = new Map<string, WorldStatus>();
    for (const item of statusCatalog.data?.items ?? []) {
      map.set(item.worldId, item.status);
    }
    for (const item of items) {
      if (!map.has(item.worldId)) {
        map.set(item.worldId, item.status);
      }
    }
    return map;
  }, [statusCatalog.data, items]);

  const worldStatusLabel = useCallback(
    (worldId: string): string | undefined => {
      const status = statusByWorldId.get(worldId);
      // Status selalu teks, bukan warna, dan hanya bila bukan `published` (NFR-12).
      return status && status !== 'published' ? t(worldStatusLabelKey(status)) : undefined;
    },
    [statusByWorldId, t],
  );

  /* ---------------- Keadaan ---------------- */

  const isInitialLoading = catalog.isLoading && !catalog.data;
  const catalogError = catalog.isError ? catalog.error : null;
  const catalogOffline = isGatewayCode(catalogError, 'NETWORK');
  const showCatalogErrorScreen = catalog.isError && !catalog.data;
  const showCatalogErrorBanner = catalog.isError && Boolean(catalog.data);

  const journeysError = journeys.isError ? journeys.error : null;
  const journeysOffline = isGatewayCode(journeysError, 'NETWORK');
  const journeysUnauthorized = isGatewayCode(journeysError, 'UNAUTHORIZED');
  // Blok 5 tidak dirender dan tidak menyimpan ruang selama `journeys` memuat.
  const journeysLoading = journeys.isLoading && !journeys.data;
  const resumeItems = (journeys.data ?? []).slice(0, RESUME_LIMIT);
  const showResume = !journeysLoading && !journeysUnauthorized && resumeItems.length > 0;
  // Tamu/`UNAUTHORIZED` disembunyikan tanpa baris galat: menjelajah tanpa
  // identitas adalah keadaan sah (SC-02), bukan kegagalan.
  const showJourneyError = !journeysLoading && !journeysUnauthorized && journeys.isError;

  /**
   * Peta dunia → perjalanan aktif, dipakai menandai CTA hero dan kartu katalog
   * (A2, D-12).
   *
   * Kontrak `JourneySummary` tidak punya status "selesai", jadi seluruh
   * perjalanan yang dikembalikan gateway dianggap aktif. D-12 menjamin satu
   * perjalanan per dunia; bila server kelak mengirim lebih dari satu, entri
   * pertama yang dipertahankan supaya hasilnya tidak bergantung urutan.
   */
  const journeyByWorldId = useMemo(() => {
    const map = new Map<string, string>();
    for (const journey of journeys.data ?? []) {
      if (!map.has(journey.worldId)) {
        map.set(journey.worldId, journey.journeyId);
      }
    }
    return map;
  }, [journeys.data]);

  /**
   * "Lanjutkan Bermain" naik ke atas hero HANYA saat perjalanan teratas punya
   * adegan belum dibaca (A1).
   *
   * Tidak dinaikkan saat pencarian terbuka atau saringan aktif: di situ pemain
   * sedang mencari, bukan kembali, dan memindahkan blok hanya akan membuat
   * tata letak terasa gelisah. Saat tidak ada adegan baru, urutan lama tetap.
   */
  const topJourney = resumeItems[0];
  const promoteResume =
    showResume && !searchOpen && !hasFilters && topJourney?.hasUnreadBeats === true;

  /**
   * Blok "Lanjutkan Bermain", dipisah agar dapat ditempatkan di dua posisi
   * (atas hero saat ada adegan baru, atau setelah chip seperti biasa).
   *
   * Judulnya tidak berubah. `accessibilityHint` hanya diisi saat blok
   * didahulukan, supaya alasan pemindahan itu terbaca oleh pembaca layar.
   */
  const resumeSection = showResume ? (
    <View style={styles.section}>
      <SectionHeader
        title={t('home.sectionResume')}
        accessibilityHint={promoteResume ? t('home.resumeUnreadHint') : undefined}
        testID="home-section-resume"
      />
      <View style={styles.sectionContent}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          testID="home-resume"
        >
          {resumeItems.map((journey) => (
            <View key={journey.journeyId} style={styles.resumeCard}>
              <JourneyCard
                journey={journey}
                mode="resume"
                onPress={openPlayer}
                worldStatusLabel={worldStatusLabel(journey.worldId)}
                testID={`journey-resume-${journey.journeyId}`}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  ) : null;

  /**
   * Hero TIDAK ikut disembunyikan saat filter aktif.
   *
   * Sebelumnya hero hilang begitu pemain mengetuk chip. Itu salah: hero adalah
   * etalase unggulan yang tidak bergantung pada saringan, dan menghilangkannya
   * membuat seluruh bagian atas layar berkedip lenyap hanya karena satu ketukan.
   * Yang boleh berubah saat menyaring hanyalah daftar di bawahnya.
   */
  const showHero = featured.length >= 1;
  // Minimal dua kartu: satu kartu sendirian di dalam rail terbaca seperti baris
  // yang rusak, bukan seperti pilihan.
  const showUpdated = !hasFilters && updatedItems.length >= MIN_RAIL_ITEMS;
  const showNew = !hasFilters && newItems.length >= MIN_RAIL_ITEMS;
  /*
   * Rail peringkat memakai ambang lebih tinggi: satu kartu jelas bukan
   * peringkat. Ambangnya dinilai atas daftar asli dari server, bukan atas
   * `topItems` yang sudah dipotong hero — lihat penjelasan di `rankedTopItems`.
   * Rail ini juga hilang saat saringan aktif, dengan alasan yang sama seperti
   * rail lain: ia etalase lintas katalog, bukan hasil pencarian.
   */
  const showTop = !hasFilters && rankedTopItems.length >= MIN_TOP_ITEMS && topItems.length > 0;

  const activeHero = Math.min(activeHeroIndex, Math.max(featured.length - 1, 0));

  /**
   * Memperbarui halaman aktif dari posisi geseran.
   *
   * Dipakai `onScroll`, bukan `onMomentumScrollEnd`: di web peristiwa momentum
   * tidak selalu dilaporkan, sehingga titik indikator dapat berhenti di halaman
   * yang salah meski geserannya sendiri berhasil.
   */
  const onHeroScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / heroPageWidth);
      setActiveHeroIndex((previous) => (previous === next ? previous : next));
    },
    [heroPageWidth],
  );

  /**
   * Pindah ke halaman hero tertentu.
   *
   * Ini yang membuat carousel benar-benar dapat dipakai di web. Kontainer gulir
   * mendatar **tidak dapat digeser dengan mouse** di peramban — hanya trackpad,
   * `shift`+roda, atau sentuh. Tanpa kontrol ini, pengguna desktop melihat
   * carousel yang seolah rusak padahal geserannya berfungsi.
   */
  const goToHero = useCallback(
    (index: number) => {
      heroRef.current?.scrollTo({ x: index * heroPageWidth, animated: true });
      setActiveHeroIndex(index);
      // Menyetel ulang timer supaya geseran otomatis tidak langsung membalap
      // pilihan yang baru saja dibuat pemain.
      setHeroInteractionTick((previous) => previous + 1);
    },
    [heroPageWidth],
  );

  /**
   * Cermin indeks aktif untuk interval.
   *
   * Interval membaca nilai ini, bukan `activeHero` langsung: penutupan `setInterval`
   * menangkap nilai saat ia dibuat, sehingga tanpa cermin geseran otomatis akan
   * selalu menghitung dari indeks yang sudah basi.
   */
  const activeHeroRef = useRef(0);
  activeHeroRef.current = activeHero;

  /**
   * Geser otomatis hero.
   *
   * Tidak berjalan bila dunia unggulan kurang dari dua — tidak ada yang digeser.
   * Efek ini bergantung pada `heroInteractionTick` sehingga setiap pilihan pemain
   * memulai ulang jeda, bukan memperpendeknya.
   */
  useEffect(() => {
    if (featured.length < 2) {
      return undefined;
    }

    const timer = setInterval(() => {
      const next = (activeHeroRef.current + 1) % featured.length;
      heroRef.current?.scrollTo({ x: next * heroPageWidth, animated: true });
      setActiveHeroIndex(next);
    }, HERO_AUTOSLIDE_MS);

    return () => {
      clearInterval(timer);
    };
  }, [featured.length, heroPageWidth, heroInteractionTick]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // Fokus TIDAK diberikan di sini — lihat efek animasi di bawah.
  }, []);

  /** Menutup pencarian sekaligus mengosongkan kata kunci, agar katalog pulih. */
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchInput('');
  }, []);

  /** Membuka lembar pemakaian kuota ringkas (C1). */
  const openQuota = useCallback(() => {
    setQuotaOpen(true);
  }, []);

  const closeQuota = useCallback(() => {
    setQuotaOpen(false);
  }, []);

  /**
   * Animasi tajuk ⇄ bilah pencarian.
   *
   * Satu nilai kemajuan menggerakkan keduanya sekaligus: tajuk biasa menggeser
   * keluar ke kiri sambil memudar, bilah pencarian masuk dari kanan. Memakai dua
   * animasi terpisah membuat keduanya mudah tampak tidak sinkron.
   *
   * `useNativeDriver: false` dipilih dengan sengaja. Pengendali native tidak
   * didukung untuk `transform` di react-native-web, dan memaksakannya membuat
   * gerakannya tersendat justru di tempat pengguna melihatnya.
   *
   * `Easing.out(Easing.cubic)` membuat gerakan mengendur di ujung, bukan
   * berhenti mendadak seperti gerakan linier.
   */
  useEffect(() => {
    const animation = Animated.timing(searchProgress, {
      toValue: searchOpen ? 1 : 0,
      duration: searchOpen ? SEARCH_OPEN_MS : SEARCH_CLOSE_MS,
      /*
       * Pengenduran yang SAMA untuk kedua arah.
       *
       * `Easing.inOut` sempat dipakai untuk membuka dan hasilnya terasa seperti
       * "mendobrak pintu": ia mempercepat di tengah, dan pada geseran selebar
       * layar percepatan itu terbaca sebagai hentakan. `Easing.out` justru
       * bergerak paling cepat di awal lalu melambat sepanjang sisa jarak, jadi
       * tidak pernah ada fase percepatan — itulah yang membuat penutupan terasa
       * enak, dan sekarang pembukaan memakai jalur yang sama.
       */
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      /*
       * Fokus diberikan SETELAH bilah selesai meluncur masuk.
       *
       * Memfokuskan elemen yang masih berada di luar layar membuat peramban
       * menggulirnya masuk secara paksa agar terlihat — dan itu terjadi seketika,
       * bukan beranimasi. Akibatnya bilah tampak "tiba-tiba muncul" meski
       * animasinya sendiri berjalan normal. Terbukti di DOM: posisi bilah
       * memang bergeser 764px → 13,9px, jadi yang salah bukan animasinya.
       */
      if (finished && searchOpen) {
        searchInputRef.current?.focus();
      }
    });

    return () => {
      animation.stop();
    };
  }, [searchOpen, searchProgress]);

  const refresh = useCallback(() => {
    void catalog.refetch();
    void statusCatalog.refetch();
    void journeys.refetch();
  }, [catalog, statusCatalog, journeys]);

  const isRefreshing =
    catalog.isRefetching || statusCatalog.isRefetching || journeys.isRefetching;

  return (
    <Screen padded={false} testID="screen-home">
      <ScrollView
        testID="home-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerStack}>
            {/*
              Tajuk bergeser KELUAR PENUH ke kiri — selebar layar, bukan beberapa
              puluh piksel sambil memudar.

              Percobaan sebelumnya hanya menggeser 32px sambil memudar, sehingga
              selama transisi kedua lapis masih terlihat dan isinya saling
              menembus (judul bertumpuk dengan angka token). Menggeser sampai
              habis keluar membuat keduanya seperti dua halaman carousel yang
              bergantian — tidak pernah ada di layar bersamaan.
            */}
            <Animated.View
              style={[
                styles.headerRow,
                {
                  transform: [
                    {
                      translateX: searchProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -windowWidth],
                      }),
                    },
                  ],
                },
              ]}
              // Tajuk yang sudah keluar layar tidak boleh lagi menerima ketukan.
              pointerEvents={searchOpen ? 'none' : 'auto'}
            >
                <Text variant="screen">{t('home.title')}</Text>

                <View style={styles.headerActions}>
                  {/*
                    Sisa kuota token. Tidak dirender selama belum diketahui — angka
                    yang belum pasti lebih buruk daripada tidak ada angka sama sekali.
                  */}
                  {usage.data ? (
                    /*
                      Lencana kuota kini KONTROL (C1), bukan pajangan: ketukan
                      membuka lembar pemakaian ringkas. Label aksesibilitasnya
                      menyebut TINDAKAN, bukan angka — angkanya sendiri sudah
                      terbaca sebagai teks di dalam tombol.
                    */
                    <Pressable
                      onPress={openQuota}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.quotaOpen')}
                      hitSlop={10}
                      style={styles.tokenBadge}
                      testID="home-token-balance"
                    >
                      {/*
                        16, bukan 13: aset bintang menyisakan padding ~7% di tepinya,
                        sehingga bintang yang TERLIHAT hanya ~86% dari angka ini
                        (16 -> ~13,7 px). Pada 13 bintang tampak lebih kecil daripada
                        teks 12 px di sebelahnya. 16 juga menyamai tinggi baris caption,
                        jadi keduanya duduk sejajar.
                      */}
                      <Icon name="star" size={16} color={colors.accent} />
                      <Text variant="caption" weight="700" tone="accent">
                        {formatCount(usage.data.available)}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={openSearch}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.searchToggle')}
                    hitSlop={10}
                    testID="home-search-toggle"
                  >
                    <Icon name="search" size={22} color={colors.inkSecondary} />
                  </Pressable>
                </View>
              </Animated.View>

            {/*
              Bilah pencarian menimpa tajuk, menunggu di luar layar dan meluncur
              masuk dari kanan. SELALU terpasang — memasangnya saat dibuka membuat
              satu bingkai di mana gaya animasinya belum terpasang, sehingga bilah
              sempat muncul penuh di layar sebelum animasinya berjalan.
            */}
            <Animated.View
              style={[
                styles.searchBar,
                {
                  transform: [
                    {
                      translateX: searchProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [windowWidth, 0],
                      }),
                    },
                  ],
                },
              ]}
              testID="home-search-bar"
              // Bilah yang menunggu di luar layar tidak boleh menangkap ketukan
              // maupun dibacakan pembaca layar.
              pointerEvents={searchOpen ? 'auto' : 'none'}
              accessibilityElementsHidden={!searchOpen}
              importantForAccessibility={searchOpen ? 'auto' : 'no-hide-descendants'}
            >
              <View style={styles.searchBarField}>
                <SearchField
                  ref={searchInputRef}
                  value={searchInput}
                  onChange={setSearchInput}
                  testID="home-search"
                />
              </View>

              <Pressable
                onPress={closeSearch}
                accessibilityRole="button"
                accessibilityLabel={t('home.searchClose')}
                hitSlop={10}
                testID="home-search-close"
              >
                <Icon name="close" size={22} color={colors.inkSecondary} />
              </Pressable>
            </Animated.View>
          </View>
        </View>

        {/*
          A1: saat ada adegan belum dibaca, blok "Lanjutkan Bermain" naik ke atas
          hero. Blok yang sama juga dirender di posisi biasa di bawah; hanya satu
          yang tampil karena `promoteResume` mengendalikan keduanya.
        */}
        {promoteResume ? resumeSection : null}

        {isInitialLoading ? (
          <View style={styles.heroWrap}>
            <View style={[styles.skeletonHero, { backgroundColor: colors.placeholder }]} />
          </View>
        ) : showHero ? (
          <View style={styles.heroWrap}>
            <ScrollView
              ref={heroRef}
              testID="home-hero"
              horizontal
              // `pagingEnabled` tidak dapat diandalkan di react-native-web,
              // sehingga geseran tidak pernah berhenti tepat di satu halaman.
              // `snapToInterval` berperilaku sama di web maupun native.
              snapToInterval={heroPageWidth}
              decelerationRate="fast"
              disableIntervalMomentum
              showsHorizontalScrollIndicator={false}
              accessibilityHint={t('home.heroSwipeHint')}
              scrollEventThrottle={16}
              onScroll={onHeroScroll}
            >
              {featured.map((item, index) => (
                <View key={item.worldId} style={[styles.heroPage, { width: heroPageWidth }]}>
                  <HeroCard
                    item={item}
                    index={index}
                    total={featured.length}
                    onOpen={openWorld}
                    journeyId={journeyByWorldId.get(item.worldId)}
                    onContinue={openPlayer}
                    testID={`hero-${item.worldId}`}
                  />
                </View>
              ))}
            </ScrollView>

            {/*
              Titik indikator sekaligus kontrol halaman.
              Di web, kontainer gulir mendatar tidak dapat digeser dengan mouse;
              tanpa kontrol ini carousel tampak rusak bagi pengguna desktop.
            */}
            {featured.length > 1 ? (
              <View style={styles.heroDots} testID="home-hero-dots">
                {featured.map((item, index) => {
                  const isActive = index === activeHero;
                  return (
                    <Pressable
                      key={item.worldId}
                      onPress={() => {
                        goToHero(index);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.heroDotOpen', { index: index + 1 })}
                      accessibilityState={{ selected: isActive }}
                      hitSlop={12}
                      testID={`home-hero-dot-${String(index)}`}
                    >
                      <View
                        style={[
                          styles.dot,
                          isActive ? styles.dotActive : styles.dotInactive,
                          isActive
                            ? { backgroundColor: colors.accent, borderColor: colors.accent }
                            : { backgroundColor: 'transparent', borderColor: colors.line },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Chip adalah kontrolnya; tetap tampil di mode hasil (SC-01.1). */}
        <ScrollView
          testID="home-chips"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip
            label={t('home.filterAny')}
            selected={selectedGenres.length === 0}
            onPress={clearGenres}
            tile
            check
            hitSlop={CHIP_HIT_SLOP}
            testID="home-chip-any"
          />
          {GENRES.map((genre) => (
            <Chip
              key={genre}
              label={t(genreLabelKey(genre))}
              selected={selectedGenres.includes(genre)}
              onPress={() => toggleGenre(genre)}
              tile
              check
              hitSlop={CHIP_HIT_SLOP}
              testID={`home-chip-${genre}`}
            />
          ))}
        </ScrollView>

        {showCatalogErrorBanner ? (
          <View
            testID="home-error-banner"
            style={[styles.inlineNotice, { backgroundColor: colors.bgMuted }]}
          >
            <Text variant="small" weight="700">
              {catalogOffline ? t('state.offlineTitle') : t('state.errorTitle')}
            </Text>
            <Text variant="caption" tone="secondary">
              {catalogOffline ? t('state.offlineBody') : t('state.errorBody')}
            </Text>
            <View style={styles.inlineAction}>
              <Button
                label={t('common.retry')}
                variant="secondary"
                onPress={() => {
                  void catalog.refetch();
                }}
                testID="home-error-banner-retry"
              />
            </View>
          </View>
        ) : null}

        {/* Blok 5 — Lanjutkan Bermain. Tidak bergantung pada filter. */}
        {!promoteResume ? resumeSection : null}

        {showJourneyError ? (
          <View
            testID="home-journey-error"
            style={[styles.inlineNotice, { backgroundColor: colors.bgMuted }]}
          >
            <Text variant="small" weight="700">
              {journeysOffline ? t('state.offlineTitle') : t('home.sectionErrorTitle')}
            </Text>
            <Text variant="caption" tone="secondary">
              {journeysOffline ? t('state.offlineBody') : t('home.sectionErrorBody')}
            </Text>
            <View style={styles.inlineAction}>
              <Button
                label={t('common.retry')}
                variant="secondary"
                onPress={() => {
                  void journeys.refetch();
                }}
                testID="home-journey-retry"
              />
            </View>
          </View>
        ) : null}

        {isInitialLoading ? (
          <View
            testID="home-skeleton"
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('common.loading')}
          >
            <View style={styles.skeletonRail}>
              <View style={[styles.skeletonRailCard, { backgroundColor: colors.placeholder }]} />
              <View style={[styles.skeletonRailCard, { backgroundColor: colors.placeholder }]} />
            </View>
            <View style={styles.skeletonGrid}>
              <View style={[styles.skeletonCell, { backgroundColor: colors.placeholder }]} />
              <View style={[styles.skeletonCell, { backgroundColor: colors.placeholder }]} />
              <View style={[styles.skeletonCell, { backgroundColor: colors.placeholder }]} />
              <View style={[styles.skeletonCell, { backgroundColor: colors.placeholder }]} />
            </View>
          </View>
        ) : showCatalogErrorScreen ? (
          <StateView
            kind={catalogOffline ? 'offline' : 'error'}
            title={catalogOffline ? t('state.offlineTitle') : t('state.errorTitle')}
            body={catalogOffline ? t('state.offlineBody') : t('state.errorBody')}
            actionLabel={t('common.retry')}
            onAction={() => {
              void catalog.refetch();
            }}
            testID="home-error"
          />
        ) : items.length === 0 ? (
          <StateView
            kind="empty"
            title={hasFilters ? t('home.emptySearchTitle') : t('home.emptyCatalogTitle')}
            body={hasFilters ? t('home.emptySearchBody') : t('home.emptyCatalogBody')}
            actionLabel={hasFilters ? t('common.reset') : undefined}
            onAction={hasFilters ? resetFilters : undefined}
            testID="home-empty"
          />
        ) : (
          <>
            {/*
              Seluruh isi daftar dibungkus SATU lapisan beranimasi.

              Mengapa satu lapisan, bukan animasi per kartu: yang perlu terasa
              saat chip ditekan adalah "daftar ini baru", bukan tujuh animasi
              terpisah yang bersaing. Satu lapisan juga berarti satu nilai
              animasi, sehingga tidak ada kartu yang bisa tertinggal di tengah
              jalan ketika daftarnya berganti lagi sebelum animasi selesai.
            */}
            <Animated.View
              testID="home-reveal"
              style={{
                opacity: filterReveal,
                transform: [
                  {
                    translateY: filterReveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              }}
            >
            {showTop ? (
              <View style={styles.section}>
                <SectionHeader title={t('home.sectionTop')} testID="home-section-top" />
                <View style={styles.sectionContent}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rail}
                    testID="home-top"
                  >
                    {topItems.map((item) => (
                      <View key={item.worldId} style={styles.railCard}>
                        {/*
                          Nomor peringkat ditampilkan sebagai teks di atas kartu,
                          bukan sebagai lencana di atas gambar: gambar sampul sudah
                          penuh, dan lencana akan menutupi wajah atau judul.
                        */}
                        <Text
                          variant="caption"
                          weight="700"
                          tone="accent"
                          style={styles.rankBadge}
                          testID={`top-rank-${item.worldId}`}
                        >
                          #{String(item.rank)}
                        </Text>
                        <StoryCard
                          item={item}
                          onPress={openWorld}
                          note={t('home.startsThisWeek', { count: item.startCount })}
                          coverRadius={radius.tile}
                          playing={journeyByWorldId.has(item.worldId)}
                          testID={`top-card-${item.worldId}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            ) : null}

            {showNew ? (
              <View style={styles.section}>
                <SectionHeader title={t('home.sectionNew')} testID="home-section-new" />
                <View style={styles.sectionContent}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rail}
                    testID="home-new"
                  >
                    {newItems.map((item) => (
                      <View key={item.worldId} style={styles.railCard}>
                        <StoryCard
                          item={item}
                          onPress={openWorld}
                          /*
                           * "Dirilis", bukan "Diperbarui". Rail ini soal kapan
                           * cerita pertama terbit, jadi labelnya harus mengikuti
                           * `publishedAt` — bukan `home.updatedAt`, yang berbunyi
                           * "Diperbarui" dan milik rail satunya.
                           */
                          note={t('home.publishedAt', {
                            when: formatRelativeDay(item.publishedAt, locale),
                          })}
                          coverRadius={radius.tile}
                          playing={journeyByWorldId.has(item.worldId)}
                          testID={`new-card-${item.worldId}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            ) : null}

            {showUpdated ? (
              <View style={styles.section}>
                <SectionHeader title={t('home.sectionUpdated')} testID="home-section-updated" />
                <View style={styles.sectionContent}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rail}
                    testID="home-updated"
                  >
                    {updatedItems.map((item) => (
                      <View key={item.worldId} style={styles.railCard}>
                        <StoryCard
                          item={item}
                          onPress={openWorld}
                          note={t('home.updatedAt', {
                            when: formatRelativeDay(item.updatedAt, locale),
                          })}
                          coverRadius={radius.tile}
                          playing={journeyByWorldId.has(item.worldId)}
                          testID={`updated-card-${item.worldId}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionHeader
                title={hasFilters ? t('home.resultsTitle') : t('home.sectionAll')}
                testID="home-section-all"
              />
              <View style={styles.sectionContent}>
                <View style={styles.grid} testID="home-grid">
                  {gridRows.map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.gridRow}>
                      {row.map((item) => (
                        <View key={item.worldId} style={styles.gridCell}>
                          <StoryCard
                            item={item}
                            onPress={openWorld}
                            coverRadius={radius.tile}
                            playing={journeyByWorldId.has(item.worldId)}
                            testID={`story-card-${item.worldId}`}
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/*
        Lembar pemakaian kuota (C1). Hanya dirender bila angka kuota sudah ada —
        lencana yang membukanya pun hanya muncul saat itu.
      */}
      {usage.data ? (
        <QuotaSheet
          visible={quotaOpen}
          usage={usage.data}
          onClose={closeQuota}
          testID="home-quota-sheet"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: space.xxl,
  },
  /**
   * Tanpa padding mendatar: padding itu pindah ke `headerRow` dan `searchBar`.
   * Dengan begitu `headerStack` membentang penuh, sehingga bilah pencarian
   * terpotong di tepi layar — bukan di tepi padding, yang akan terlihat seperti
   * bilah muncul dari tengah halaman.
   */
  header: {
    paddingTop: space.md,
    gap: space.md,
  },
  /**
   * Wadah dua lapis: tajuk biasa dan bilah pencarian menempati ruang yang sama.
   *
   * `minHeight` dikunci supaya tinggi tajuk tidak berubah saat bilah pencarian
   * masuk atau keluar — tanpa itu seluruh isi halaman di bawahnya ikut melompat.
   *
   * `overflow: 'hidden'` WAJIB ada. Bilah pencarian menunggu di luar layar
   * (`translateX` selebar jendela), dan di CSS sebuah elemen yang digeser tetap
   * memperluas area gulir. Tanpa pemotongan ini, seluruh halaman menjadi dapat
   * digulir mendatar dan semua isi Beranda tampak ikut bergeser — bukan hanya
   * tajuknya.
   */
  headerStack: {
    minHeight: 40,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** Judul di kiri, sisa kuota dan pencarian di kanan — satu baris, sejajar. */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: 40,
    paddingHorizontal: space.lg,
  },
  searchBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 40,
    paddingHorizontal: space.lg,
  },
  searchBarField: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  tokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  /**
   * Hero penuh lebar, tanpa padding samping.
   *
   * Gambarnya memudar ke warna latar di tepi bawah, jadi tepi kiri-kanannya pun
   * tidak boleh terpotong padding — kalau tidak, gradasinya berhenti di tengah
   * halaman dan justru membentuk tepi baru.
   */
  heroWrap: {
    marginTop: space.lg,
  },
  heroPage: {
    width: '100%',
    // Mencegah kontainer flex mendatar meregangkan halaman hero secara vertikal.
    // Tanpa ini, `align-items: stretch` mengalahkan `aspectRatio` pada gambar dan
    // hero melar memenuhi tinggi layar.
    alignSelf: 'flex-start',
  },
  heroDots: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  dotActive: {
    width: 14,
  },
  dotInactive: {
    width: 6,
  },
  chipRow: {
    // Jarak dari hero. Tanpa ini chip menempel ~2px di bawah kartu hero,
    // sehingga ritme spasinya pecah tepat di sambungan bagian terpenting.
    marginTop: space.lg,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  section: {
    paddingHorizontal: space.lg,
  },
  sectionContent: {
    marginTop: space.md,
  },
  rail: {
    gap: space.md,
  },
  railCard: {
    width: RAIL_CARD_WIDTH,
  },
  /** Nomor peringkat: kecil, di atas kartu, tidak menutupi sampul. */
  rankBadge: {
    marginBottom: space.xs,
  },
  resumeCard: {
    width: RESUME_CARD_WIDTH,
  },
  inlineNotice: {
    marginTop: space.lg,
    marginHorizontal: space.lg,
    padding: space.md,
    borderRadius: radius.tile,
    gap: space.xs,
  },
  inlineAction: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
  },
  grid: {
    gap: space.lg,
  },
  gridRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  gridCell: {
    flex: 1,
  },
  skeletonHero: {
    height: 201,
    borderRadius: radius.tile,
  },
  skeletonRail: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xl,
    paddingHorizontal: space.lg,
  },
  skeletonRailCard: {
    width: RAIL_CARD_WIDTH,
    height: 176,
    borderRadius: radius.tile,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.xl,
    paddingHorizontal: space.lg,
  },
  skeletonCell: {
    width: RAIL_CARD_WIDTH,
    height: 176,
    borderRadius: radius.tile,
  },
});
