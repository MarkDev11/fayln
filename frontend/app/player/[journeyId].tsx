import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGateway } from '@/data/GatewayProvider';
import type { JourneySession } from '@/data/gateway';
import { useSyncReadProgress } from '@/data/queries';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SimulatorBadge } from '@/components/SimulatorBadge';
import { StateView } from '@/components/StateView';
import { Text } from '@/components/Text';

import { AutoDelayControl } from '@/features/player/components/AutoDelayControl';
import { ChoiceSheet } from '@/features/player/components/ChoiceSheet';
import { Composer, MAX_CUSTOM_ACTION_CHARS } from '@/features/player/components/Composer';
import { GatewayErrorSheet } from '@/features/player/components/GatewayErrorSheet';
import { LogDrawer } from '@/features/player/components/LogDrawer';
import { NPCInspector, type InspectorCharacter } from '@/features/player/components/NPCInspector';
import { PlayerControls } from '@/features/player/components/PlayerControls';
import { RelationNotice } from '@/features/player/components/RelationNotice';
import { assetUri } from '@/domain/assets';
import { Stage } from '@/features/player/components/Stage';
import { StageHud } from '@/features/player/components/StageHud';
import { StageNav } from '@/features/player/components/StageNav';
import { StageText } from '@/features/player/components/StageText';
import { usePlayerEngine } from '@/features/player/usePlayerEngine';
import type { SceneNotice } from '@/features/player/types';

import { useI18n } from '@/i18n';
import { telemetry } from '@/telemetry/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const NOTICE_TIMEOUT_MS = 7000;

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ journeyId?: string }>();
  const journeyId = typeof params.journeyId === 'string' ? params.journeyId : '';
  const gateway = useGateway();
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();

  const [session, setSession] = useState<JourneySession | null>(null);
  const [initialCursor, setInitialCursor] = useState(0);
  const [personaName, setPersonaName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    setSession(null);
    setInitialCursor(0);
    try {
      const [result, detail] = await Promise.all([
        gateway.openJourneySession(journeyId),
        gateway.fetchJourneyDetail(journeyId),
      ]);
      if (requestId !== loadRequestRef.current) {
        return;
      }
      setInitialCursor(detail.lastReadSequence);
      setSession(result);
      setPersonaName(detail.personaName);
    } catch {
      if (requestId === loadRequestRef.current) {
        setLoadError(t('state.errorBody'));
      }
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [gateway, journeyId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadRequestRef.current += 1;
      };
    }, [load]),
  );

  if (loading || (session !== null && session.journeyId !== journeyId)) {
    return (
      <Screen testID="player-loading">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="small" tone="secondary">
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (loadError || !session) {
    return (
      <Screen testID="player-error">
        <StateView
          kind="error"
          title={t('state.errorTitle')}
          body={loadError ?? t('state.errorBody')}
          actionLabel={t('common.retry')}
          onAction={() => {
            void load();
          }}
        />
        <View style={styles.backSlot}>
          <Button
            label={t('common.back')}
            onPress={() => router.replace('/journey')}
            variant="ghost"
            fullWidth
          />
        </View>
      </Screen>
    );
  }

  return (
    <PlayerView
      key={session.journeyId}
      session={session}
      personaName={personaName}
      initialCursor={initialCursor}
    />
  );
}

function PlayerView({
  session,
  personaName,
  initialCursor,
}: {
  session: JourneySession;
  personaName: string;
  initialCursor: number;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /*
   * Keadaan overlay dideklarasikan SEBELUM mesin, karena `suspended` di bawah
   * membacanya. Urutannya penting: sebuah nilai tidak bisa dipakai sebelum ia
   * ada, dan memindahkan mesin ke atas akan membuat Auto tidak pernah tertahan.
   */
  const [logVisible, setLogVisible] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  /** Mode bersih: seluruh UI disembunyikan agar ilustrasi terlihat penuh. */
  const [uiHidden, setUiHidden] = useState(false);
  const [leaveDialogVisible, setLeaveDialogVisible] = useState(false);

  /** Ada lapisan yang menutupi cerita? Auto ditahan selama itu. */
  const overlayTerbuka = logVisible || inspectorVisible || uiHidden || leaveDialogVisible;

  const engine = usePlayerEngine({
    journeyId: session.journeyId,
    worldId: session.world.worldId,
    worldVersion: session.world.worldVersion,
    personaName,
    initialBeats: session.beats,
    initialCursor,
    initialRelations: session.relationsBaseline,
    memory: session.memory,
    simulator: session.simulator,
    // Bahasa dari SESI — nilai yang sama dengan yang dipakai server.
    responseLocale: session.responseLocale,
    /*
     * Auto DITAHAN, bukan dimatikan, saat overlay terbuka atau UI disembunyikan.
     *
     * Pemain tidak sedang membaca pada keadaan itu, jadi Auto tidak boleh
     * memajukan cerita di belakang punggungnya — tetapi ia juga tidak dimatikan:
     * begitu overlay ditutup, Auto melanjutkan sendiri. Sebelumnya `pauseAuto()`
     * mengirim `SET_AUTO false`, sehingga membuka Riwayat mematikan Auto secara
     * permanen.
     */
    suspended: overlayTerbuka,
  });

  const { state } = engine;

  const npcNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const character of session.world.characters) {
      map[character.npcId] = character.name;
    }
    return map;
  }, [session.world.characters]);

  const locationLabel = useMemo(() => {
    const assetId = state.scene.backgroundAssetId;
    if (!assetId) {
      return undefined;
    }
    return session.world.assetManifest.backgrounds.find((item) => item.assetId === assetId)?.label;
  }, [session.world.assetManifest.backgrounds, state.scene.backgroundAssetId]);

  /*
   * URL latar dan potret diselesaikan di sini, bukan di dalam panggung.
   *
   * Panggung hanya memegang satu adegan; manifest dimiliki layar ini. Bentuk
   * lamanya hanya mengirim ID, sehingga panggung TIDAK PERNAH dapat menggambar
   * apa pun — latar dan potret selalu kosong, tanpa galat.
   */
  const backgroundUri = useMemo(() => {
    const assetId = state.scene.backgroundAssetId;
    if (!assetId) {
      return undefined;
    }
    const item = session.world.assetManifest.backgrounds.find((a) => a.assetId === assetId);
    return assetUri(item?.uri ?? assetId);
  }, [session.world.assetManifest.backgrounds, state.scene.backgroundAssetId]);

  const portraitUri = useMemo(() => {
    const assetId = state.scene.focusPortraitAssetId;
    if (!assetId) {
      return undefined;
    }
    const item = session.world.assetManifest.portraits.find((a) => a.assetId === assetId);
    return assetUri(item?.uri ?? assetId);
  }, [session.world.assetManifest.portraits, state.scene.focusPortraitAssetId]);

  const speakerName =
    state.line?.speakerNpcId != null ? (npcNameById[state.line.speakerNpcId] ?? null) : null;

  const focusName =
    state.scene.focusNpcId != null ? (npcNameById[state.scene.focusNpcId] ?? null) : null;

  /*
   * Status hubungan yang ditampilkan di HUD.
   *
   * Diambil dari tokoh yang SEDANG tampil; bila hubungannya belum pernah berubah
   * di perjalanan ini, dipakai hubungan awal dari definisi dunia — bukan
   * "belum diketahui", karena hubungan awalnya memang sudah ditetapkan admin.
   */
  const relationStatus = useMemo(() => {
    const npcId = state.scene.focusNpcId;
    if (!npcId) {
      return null;
    }
    const fromJourney = state.relations.find((item) => item.npcId === npcId);
    if (fromJourney) {
      return fromJourney.status;
    }
    return session.world.characters.find((item) => item.npcId === npcId)?.initialRelation ?? null;
  }, [session.world.characters, state.relations, state.scene.focusNpcId]);

  /** Tokoh yang sudah muncul di panggung, beserta hubungan yang sudah terlihat. */
  const inspectorCharacters = useMemo<InspectorCharacter[]>(() => {
    return state.scene.visibleNpcIds
      .map((npcId) => {
        const definition = session.world.characters.find((item) => item.npcId === npcId);
        const relation = state.relations.find((item) => item.npcId === npcId);
        if (!definition) {
          return null;
        }
        return {
          npcId,
          name: definition.name,
          role: definition.role,
          soul: definition.soul,
          relation: relation?.status ?? definition.initialRelation,
          reasonPublic: relation?.reasonPublic ?? '',
        };
      })
      .filter((item): item is InspectorCharacter => item !== null);
  }, [session.world.characters, state.relations, state.scene.visibleNpcIds]);

  /** Menyelaraskan posisi baca ke server agar daftar Perjalanan akurat. */
  const syncProgress = useSyncReadProgress();

  /**
   * Auto DITAHAN saat overlay dibuka ATAU saat UI disembunyikan.
   *
   * Saat mode bersih, pemain tidak dapat membaca teks, jadi membiarkan Auto
   * berjalan akan memajukan cerita tanpa sepengetahuannya.
   *
   * Penahanannya lewat opsi `suspended` milik mesin, BUKAN lewat `pauseAuto()`
   * seperti sebelumnya: `pauseAuto()` mengirim `SET_AUTO false`, sehingga
   * menutup Riwayat pun mematikan Auto secara permanen. Sekarang Auto menyala
   * terus sampai pemain mematikannya sendiri, dan overlay hanya menahan lajunya.
   *
   * Karena itu tidak ada lagi `useEffect` di sini — nilainya diturunkan langsung
   * dari keadaan overlay, dan mesin membacanya setiap render.
   */

  /**
   * Laporan posisi baca.
   *
   * Dikirim setelah pemain berhenti sejenak, bukan pada setiap beat, agar tidak
   * membanjiri jaringan. Kegagalan diabaikan: ini hanya menyelaraskan daftar
   * Perjalanan, bukan bagian dari integritas cerita.
   */
  useEffect(() => {
    if (state.cursor === 0) {
      return undefined;
    }
    const timer = setTimeout(() => {
      const lastBeat = state.beats[state.cursor - 1];
      syncProgress.mutate({
        journeyId: session.journeyId,
        lastReadSequence: state.cursor,
        lastReadBeatId: lastBeat?.beatId ?? '',
        decisionCount: state.beats.filter((beat) => beat.event.type === 'presentChoices').length,
        hasUnreadBeats: state.cursor < state.beats.length,
      });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cursor, state.beats, session.journeyId]);

  /** Keluar dari cerita. Posisi baca sudah tersimpan otomatis. */
  const leaveStory = useCallback(() => {
    if (engine.state.status === 'submitting') {
      // Membatalkan pengiriman agar hasil terlambat tidak diterapkan setelah keluar.
      engine.cancelSubmission();
    }
    setLeaveDialogVisible(false);
    router.replace('/journey');
  }, [engine, router]);

  const requestLeave = useCallback(() => {
    /*
     * Tidak ada `pauseAuto()` di sini. Dialog keluar termasuk `overlayTerbuka`,
     * jadi Auto sudah tertahan selama dialognya tampil — dan bila pemain menekan
     * "Tetap di sini", Auto melanjutkan sendiri, bukan mati.
     */
    setLeaveDialogVisible(true);
  }, []);

  /* Pemberitahuan hubungan tampil sementara lalu hilang sendiri. */
  const activeNotice: SceneNotice | undefined = state.notices[0];
  useEffect(() => {
    if (!activeNotice) {
      return undefined;
    }
    const timer = setTimeout(() => engine.dismissNotice(activeNotice.id), NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotice?.id]);

  const isSubmitting = state.status === 'submitting';
  const showError = state.error !== null && !errorDismissed;

  const openLog = useCallback(() => {
    setLogVisible(true);
    telemetry.track('log_opened', { simulator: session.simulator });
  }, [session.simulator]);

  const draftTooLong = state.draft.length > MAX_CUSTOM_ACTION_CHARS;

  /**
   * Mode bersih: hanya panggung yang tampil, tanpa HUD dan tanpa panel.
   * Ketuk di mana saja untuk mengembalikan UI.
   */
  if (uiHidden) {
    return (
      <Pressable
        style={styles.hiddenRoot}
        onPress={() => setUiHidden(false)}
        accessibilityRole="button"
        accessibilityLabel={t('player.showUi')}
        accessibilityHint={t('player.hiddenHint')}
        testID="player-hidden"
      >
        <Stage
          scene={state.scene}
          focusName={focusName}
          {...(locationLabel !== undefined ? { locationLabel } : null)}
          backgroundUri={backgroundUri}
          portraitUri={portraitUri}
        />
        <View style={styles.hiddenHint}>
          <Icon name="eyeOff" size={16} color="#FFFFFF" />
          <Text variant="caption" style={styles.hiddenHintText}>
            {t('player.hiddenHint')}
          </Text>
        </View>
      </Pressable>
    );
  }

  /*
   * Seluruh layar adalah panggungnya.
   *
   * Bentuk lamanya menumpuk tiga blok berurutan — panggung, lalu kotak dialog
   * hitam, lalu panel kendali berlatar aplikasi — sehingga gambarnya hanya
   * mengisi sepertiga atas layar dan sisanya menjadi dinding gelap. Sekarang
   * panggung menutupi SELURUH layar, dan HUD, teks, serta tombolnya menumpang
   * di atasnya sebagai lapisan absolut.
   */
  return (
    <View style={styles.root}>
      <Stage
        scene={state.scene}
        focusName={focusName}
        {...(locationLabel !== undefined ? { locationLabel } : null)}
        backgroundUri={backgroundUri}
        portraitUri={portraitUri}
        onTap={state.decision === null && engine.canAdvance && !isSubmitting ? engine.advance : undefined}
        testID="player-stage"
      >
        {/* Lapisan atas: hubungan, tempat, dan tombol mode. */}
        <View
          style={[styles.hud, { paddingTop: insets.top + space.sm }]}
          pointerEvents="box-none"
        >
          <StageHud
            relationStatus={relationStatus}
            relationName={focusName}
            locationLabel={locationLabel ?? null}
            autoActive={state.auto}
            autoDisabled={isSubmitting}
            onToggleAuto={engine.toggleAuto}
            onHideUi={() => setUiHidden(true)}
            relationVocabulary={state.relationVocabulary}
            testID="player-hud"
          />
          {state.simulator ? <SimulatorBadge simulator={state.simulator} /> : null}

          {/*
           * Kendali cerita tetap di PALING ATAS, di barisnya sendiri.
           *
           * Diletakkan di sini sejak layar masih berpanel, dan tetap di sini
           * setelah panelnya hilang: kalau ia turun ke kaki panggung, ia akan
           * duduk tepat di atas kalimat cerita — bagian layar yang paling perlu
           * dibaca.
           */}
          <View style={styles.controlsRow} pointerEvents="box-none">
            <PlayerControls
              testID="player-controls"
              /*
               * `onMedia`: baris ini menumpang di atas ilustrasi panggung, bukan
               * di atas permukaan aplikasi. Dengan nada bawaan, labelnya gelap
               * pada tema terang dan lenyap begitu adegannya berlatar gelap.
               */
              tone="onMedia"
              items={[
                {
                  id: 'log',
                  icon: 'book',
                  label: t('player.log'),
                  onPress: openLog,
                },
                {
                  id: 'npc',
                  icon: 'person',
                  label: t('player.characters'),
                  onPress: () => setInspectorVisible(true),
                },
              ]}
            />
          </View>

          {/*
            * Pengatur jeda Auto HANYA muncul saat Auto menyala.
            *
            * Saat Auto mati, jeda tidak berarti apa pun — menampilkannya hanya
            * menambah barang yang harus diabaikan mata. Muncul saat relevan juga
            * membuatnya dapat ditemukan: pemain yang baru menyalakan Auto melihat
            * langsung bahwa kecepatannya dapat diatur.
            */}
          {state.auto ? (
            <View style={styles.autoDelayRow} pointerEvents="box-none">
              <AutoDelayControl
                value={state.autoDelayMs}
                onChange={engine.setAutoDelay}
                testID="player-auto-delay"
              />
            </View>
          ) : null}
        </View>

        {/* Lapisan bawah: teks cerita, pilihan, dan tombol maju. */}
        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}
          pointerEvents="box-none"
        >
          {activeNotice ? (
            <RelationNotice
              notice={activeNotice}
              npcName={npcNameById[activeNotice.npcId] ?? t('log.unknownSpeaker')}
              onDismiss={() => engine.dismissNotice(activeNotice.id)}
              relationVocabulary={state.relationVocabulary}
              testID="relation-notice"
            />
          ) : null}

          {state.decision ? (
            <View style={styles.decisionBlock}>
              {/*
               * Isi blok pilihan dapat DIGULIR.
               *
               * Tiga opsi + komposer + pertanyaan bisa melebihi tinggi yang
               * tersedia di ponsel pendek; tanpa guliran, elemen pertamanya
               * terdorong keluar dari panggung yang `overflow:'hidden'` dan
               * pemain kehilangan pertanyaannya.
               */}
              <ScrollView
                style={styles.decisionScroll}
                contentContainerStyle={styles.decisionContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <ChoiceSheet
                  decision={state.decision}
                  disabled={isSubmitting}
                  onSelect={engine.submitChoice}
                  testID="player-choices"
                />
                <Composer
                  value={state.draft}
                  onChange={engine.setDraft}
                  onSubmit={engine.submitCustom}
                  disabled={isSubmitting}
                  submitting={isSubmitting}
                  testID="player-composer"
                />
              </ScrollView>
            </View>
          ) : (
            <>
              <StageText
                line={state.line}
                speakerName={speakerName}
                onRevealed={engine.revealLine}
                onAdvance={engine.advance}
                testID="player-dialogue"
              />
              {isSubmitting ? (
                /*
                 * Keadaan "AI sedang menulis" — tanpa bingkai, senada dengan
                 * sisa layar. Di layar yang sudah dibersihkan dari bingkai, satu
                 * kotak tersisa justru menarik perhatian paling besar.
                 */
                <View accessible accessibilityRole="alert" style={styles.waiting}>
                  <Text variant="small" tone="onMedia">
                    {t('player.waiting')}
                  </Text>
                  <Text variant="caption" tone="onMedia">
                    {t('player.waitingHint')}
                  </Text>
                  <View style={styles.waitingAction}>
                    <Button
                      label={t('player.cancel')}
                      onPress={engine.cancelSubmission}
                      variant="ghost"
                      testID="player-cancel"
                    />
                  </View>
                </View>
              ) : null}
              {state.decision === null && !engine.canAdvance && state.status === 'idle' && !isSubmitting ? (
                <Text variant="caption" tone="onMedia">
                  {t('player.noBeatsLeft')}
                </Text>
              ) : null}
            </>
          )}

          {showError && state.error ? (
            <GatewayErrorSheet
              error={state.error}
              onRetry={() => {
                setErrorDismissed(true);
                engine.retry();
              }}
              onDismiss={() => setErrorDismissed(true)}
              testID="player-error-sheet"
            />
          ) : null}

          {draftTooLong ? (
            <Text variant="caption" tone="onMedia">
              {t('player.customTooLong')}
            </Text>
          ) : null}

          <StageNav
            onBack={requestLeave}
            backLabel={t('player.back')}
            testID="player-nav"
          />
        </View>
      </Stage>

      <LogDrawer
        visible={logVisible}
        beats={state.beats}
        cursor={state.cursor}
        npcNameById={npcNameById}
        onClose={() => setLogVisible(false)}
        relationVocabulary={state.relationVocabulary}
        testID="player-log"
      />

      <NPCInspector
        visible={inspectorVisible}
        characters={inspectorCharacters}
        relationVocabulary={state.relationVocabulary}
        onClose={() => setInspectorVisible(false)}
        testID="player-inspector"
      />

      <ConfirmDialog
        visible={leaveDialogVisible}
        title={isSubmitting ? t('player.leaveWhileWritingTitle') : t('player.leaveTitle')}
        body={isSubmitting ? t('player.leaveWhileWritingBody') : t('player.leaveBody')}
        confirmLabel={
          isSubmitting ? t('player.leaveWhileWritingConfirm') : t('player.leaveConfirm')
        }
        cancelLabel={isSubmitting ? t('player.leaveWhileWritingCancel') : t('player.leaveCancel')}
        destructive={isSubmitting}
        onConfirm={leaveStory}
        onCancel={() => setLeaveDialogVisible(false)}
        testID="leave-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  backSlot: {
    paddingHorizontal: space.lg,
  },
  /**
   * HUD dan kaki panggung adalah LAPISAN, bukan bagian dari aliran tata letak.
   *
   * Karena panggung kini menutupi seluruh layar, keduanya harus diposisikan
   * absolut supaya tidak mendorong gambarnya. `pointerEvents="box-none"` pada
   * pembungkusnya membuat ketukan di ruang kosong tetap sampai ke teks cerita di
   * bawahnya — tanpa itu, seluruh layar menjadi mati kecuali tombolnya.
   */
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  controlsRow: {
    alignSelf: 'stretch',
    paddingTop: space.xs,
  },
  autoDelayRow: {
    alignSelf: 'stretch',
    paddingTop: space.sm,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
  },
  decisionBlock: {
    gap: space.lg,
    /*
     * Panel di belakang blok pilihan.
     *
     * Gradasi panggung paling pekat di TEPI BAWAH layar, sedangkan pertanyaan
     * pilihan duduk lebih tinggi — di situ gradasinya belum banyak menolong, dan
     * kalimat pertanyaannya jatuh di atas rambut tokoh serta jendela yang terang.
     *
     * Kepekatannya dinaikkan dari 0,55 ke 0,78 setelah peninjau QA menemukan
     * bahwa pada 0,55 "the character's face ghosts through the panel behind the
     * text". Angka ini dipatok, bukan token tema: panel ini duduk di atas
     * GAMBAR yang tidak ikut berubah bersama tema.
     *
     * `maxHeight` mencegah panel menelan seluruh layar di ponsel pendek: tiga
     * opsi + komposer + pertanyaan bisa melebihi tinggi yang tersedia, dan tanpa
     * batas ia akan mendorong elemen pertama keluar dari panggung yang
     * `overflow:'hidden'`.
     */
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    borderRadius: 16,
    padding: space.md,
    maxHeight: '72%',
  },
  decisionScroll: {
    flexGrow: 0,
  },
  decisionContent: {
    gap: space.lg,
  },
  waiting: {
    gap: 2,
  },
  waitingAction: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
  },
  hiddenRoot: {
    flex: 1,
  },
  hiddenHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    // Petunjuk tidak boleh menelan ketukan yang memulihkan UI.
    pointerEvents: 'none',
  },
  hiddenHintText: {
    color: '#FFFFFF',
    opacity: 0.9,
  },
});
