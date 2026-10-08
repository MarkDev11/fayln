import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
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

import { ChoiceSheet } from '@/features/player/components/ChoiceSheet';
import { Composer, MAX_CUSTOM_ACTION_CHARS } from '@/features/player/components/Composer';
import { DialogueBox } from '@/features/player/components/DialogueBox';
import { GatewayErrorSheet } from '@/features/player/components/GatewayErrorSheet';
import { LogDrawer } from '@/features/player/components/LogDrawer';
import { NPCInspector, type InspectorCharacter } from '@/features/player/components/NPCInspector';
import { PlayerControls } from '@/features/player/components/PlayerControls';
import { RelationNotice } from '@/features/player/components/RelationNotice';
import { assetUri } from '@/domain/assets';
import { Stage } from '@/features/player/components/Stage';
import { usePlayerEngine } from '@/features/player/usePlayerEngine';
import type { SceneNotice } from '@/features/player/types';

import { useI18n } from '@/i18n';
import { telemetry } from '@/telemetry/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const NOTICE_TIMEOUT_MS = 7000;

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ journeyId?: string }>();
  const journeyId = typeof params.journeyId === 'string' ? params.journeyId : '';
  const gateway = useGateway();
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();

  const [session, setSession] = useState<JourneySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await gateway.openJourneySession(journeyId);
      setSession(result);
    } catch {
      setLoadError(t('state.errorBody'));
    } finally {
      setLoading(false);
    }
  }, [gateway, journeyId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
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

  return <PlayerView session={session} />;
}

function PlayerView({ session }: { session: JourneySession }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const engine = usePlayerEngine({
    journeyId: session.journeyId,
    worldId: session.world.worldId,
    worldVersion: session.world.worldVersion,
    personaName: '',
    initialBeats: session.beats,
    initialRelations: session.relationsBaseline,
    memory: session.memory,
    simulator: session.simulator,
  });

  const [logVisible, setLogVisible] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  /** Mode bersih: seluruh UI disembunyikan agar ilustrasi terlihat penuh. */
  const [uiHidden, setUiHidden] = useState(false);
  const [leaveDialogVisible, setLeaveDialogVisible] = useState(false);

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
   * Auto dijeda saat overlay dibuka ATAU saat UI disembunyikan.
   *
   * Saat mode bersih, pemain tidak dapat membaca teks, jadi membiarkan Auto
   * berjalan akan memajukan cerita tanpa sepengetahuannya.
   */
  useEffect(() => {
    if (logVisible || inspectorVisible || uiHidden) {
      engine.pauseAuto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logVisible, inspectorVisible, uiHidden]);

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
    engine.pauseAuto();
    setLeaveDialogVisible(true);
  }, [engine]);

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
   * Mode bersih: hanya panggung yang tampil, tanpa safe area dan tanpa panel.
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

  return (
    <View style={[styles.root, { backgroundColor: colors.bgApp }]}>
      <View style={[styles.stageWrap, { paddingTop: insets.top + space.sm }]}>
        <Stage
          scene={state.scene}
          focusName={focusName}
          {...(locationLabel !== undefined ? { locationLabel } : null)}
          backgroundUri={backgroundUri}
          portraitUri={portraitUri}
          testID="player-stage"
        />
      </View>

      <View style={[styles.hudTop, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.hudRow}>
          <Pressable
            onPress={requestLeave}
            accessibilityRole="button"
            accessibilityLabel={t('player.back')}
            hitSlop={8}
            style={[
              styles.hudButton,
              { backgroundColor: colors.bgSurface, borderColor: colors.line },
            ]}
            testID="player-back"
          >
            <Icon name="chevronLeft" size={20} color={colors.inkPrimary} />
          </Pressable>
          <SimulatorBadge />
        </View>
        {!engine.isPersistent ? (
          /*
           * Papan di belakang teks, bukan teks langsung di atas gambar.
           *
           * Tanpa latar, teks peringatan ini duduk di atas latar adegan — yang
           * bisa terang, gelap, atau ramai — dan kontrasnya habis. Warnanya
           * "warning" membuatnya tampak kuning pucat yang menghilang di atas
           * ilustrasi apa pun.
           */
          <View style={[styles.storagePlate, { backgroundColor: colors.bgSurface }]}>
            <Text variant="caption" tone="warning" numberOfLines={2}>
              {t('storage.memoryOnly')}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.bottom,
          { backgroundColor: colors.bgApp, paddingBottom: insets.bottom + space.md },
        ]}
      >
        {activeNotice ? (
          <RelationNotice
            notice={activeNotice}
            npcName={npcNameById[activeNotice.npcId] ?? t('log.unknownSpeaker')}
            onDismiss={() => engine.dismissNotice(activeNotice.id)}
            testID="relation-notice"
          />
        ) : null}

        <PlayerControls
          testID="player-controls"
          items={[
            {
              id: 'auto',
              icon: state.auto ? 'pause' : 'play',
              label: state.auto ? t('player.autoOn') : t('player.auto'),
              active: state.auto,
              disabled: isSubmitting,
              onPress: engine.toggleAuto,
            },
            {
              id: 'log',
              icon: 'book',
              label: t('player.log'),
              onPress: openLog,
            },
            {
              id: 'npc',
              icon: 'journey',
              label: t('player.characters'),
              onPress: () => setInspectorVisible(true),
            },
            {
              id: 'hide',
              icon: 'eyeOff',
              label: t('player.hideUi'),
              onPress: () => setUiHidden(true),
            },
          ]}
        />

        {state.decision ? (
          <View style={styles.decisionBlock}>
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
          </View>
        ) : (
          <>
            <DialogueBox
              line={state.line}
              speakerName={speakerName}
              onRevealed={engine.revealLine}
              onAdvance={engine.advance}
              testID="player-dialogue"
            />
            {isSubmitting ? (
              <View
                accessible
                accessibilityRole="alert"
                style={[styles.waiting, { borderColor: colors.line, backgroundColor: colors.bgMuted }]}
              >
                <Text variant="small" tone="secondary">
                  {t('player.waiting')}
                </Text>
                <Text variant="caption" tone="secondary">
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
              <Text variant="caption" tone="secondary">
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
          <Text variant="caption" tone="danger">
            {t('player.customTooLong')}
          </Text>
        ) : null}
      </View>

      <LogDrawer
        visible={logVisible}
        beats={state.beats}
        cursor={state.cursor}
        npcNameById={npcNameById}
        onClose={() => setLogVisible(false)}
        testID="player-log"
      />

      <NPCInspector
        visible={inspectorVisible}
        characters={inspectorCharacters}
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
  stageWrap: {
    flex: 1,
  },
  hudTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    gap: space.xs,
    alignItems: 'flex-start',
  },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  hudButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
  /** Papan di belakang peringatan penyimpanan, agar terbaca di atas latar apa pun. */
  storagePlate: {
    maxWidth: 280,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.chip,
    alignSelf: 'flex-start',
  },
  bottom: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
  },
  decisionBlock: {
    gap: space.lg,
  },
  waiting: {
    padding: space.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  waitingAction: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
  },
});
