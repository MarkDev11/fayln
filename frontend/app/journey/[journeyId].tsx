import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssetImage } from '@/components/AssetImage';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon } from '@/components/Icon';
import { NPCRelationChip } from '@/components/NPCRelationChip';
import { Screen } from '@/components/Screen';
import { SimulatorBadge } from '@/components/SimulatorBadge';
import { StateView } from '@/components/StateView';
import { StickyActionBar } from '@/components/StickyActionBar';
import { Text } from '@/components/Text';

import { useDeleteJourney, useJourneyDetail, useWorldDetail } from '@/data/queries';
import { useGateway } from '@/data/GatewayProvider';
import { LogDrawer } from '@/features/player/components/LogDrawer';
import { MEDIA_ASPECT } from '@/domain/media';
import type { Beat } from '@/domain/types';
import { formatRelativeDay, useI18n } from '@/i18n';
import { telemetry } from '@/telemetry/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

/** Tinggi perkiraan action bar agar baris terakhir tidak tertutup. */
const ACTION_BAR_SPACE = 96;

export default function JourneyDetailScreen() {
  const params = useLocalSearchParams<{ journeyId?: string }>();
  const journeyId = typeof params.journeyId === 'string' ? params.journeyId : undefined;

  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const journey = useJourneyDetail(journeyId);
  const world = useWorldDetail(journey.data?.worldId);
  const deleteJourney = useDeleteJourney();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* Riwayat dimuat saat diminta, bukan setiap kali detail dibuka. */
  const gateway = useGateway();
  const [logVisible, setLogVisible] = useState(false);
  const [logBeats, setLogBeats] = useState<Beat[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const openLog = useCallback(async () => {
    if (!journeyId) {
      return;
    }
    setLogLoading(true);
    setLogError(null);
    try {
      const session = await gateway.openJourneySession(journeyId);
      setLogBeats(session.beats);
      setLogVisible(true);
    } catch {
      setLogError(t('journey.logFailed'));
    } finally {
      setLogLoading(false);
    }
  }, [gateway, journeyId, t]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/journey');
  }, [router]);

  const onContinue = useCallback(() => {
    if (!journeyId) {
      return;
    }
    telemetry.track('journey_continue_requested', { simulator: true });
    router.push({ pathname: '/player/[journeyId]', params: { journeyId } });
  }, [journeyId, router]);

  const onConfirmDelete = useCallback(async () => {
    if (!journeyId) {
      return;
    }
    telemetry.track('journey_delete_requested', { simulator: true });
    setDeleteError(null);
    try {
      await deleteJourney.mutateAsync(journeyId);
      telemetry.track('journey_delete_result', { simulator: true });
      setConfirmVisible(false);
      router.replace('/journey');
    } catch {
      // Tidak berpura-pura terhapus: dialog tetap terbuka dengan pesan yang jelas.
      setDeleteError(t('journey.deleteFailed'));
      telemetry.track('journey_delete_result', { errorCode: 'failed', simulator: true });
    }
  }, [deleteJourney, journeyId, router, t]);

  if (journey.isLoading && !journey.data) {
    return (
      <Screen testID="journey-detail-loading">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="small" tone="secondary">
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (journey.isError || !journey.data) {
    return (
      <Screen testID="journey-detail-error">
        <StateView
          kind="error"
          title={t('journey.notFound')}
          body={t('state.errorBody')}
          actionLabel={t('common.retry')}
          onAction={() => {
            void journey.refetch();
          }}
        />
        <View style={styles.backSlot}>
          <Pressable onPress={goBack} accessibilityRole="button" style={styles.backLink}>
            <Text variant="label" tone="accent">
              {t('common.back')}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const data = journey.data;
  const characterName = (npcId: string) =>
    world.data?.characters.find((character) => character.npcId === npcId)?.name ?? npcId;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgApp, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          style={[styles.backButton, { borderColor: colors.line, backgroundColor: colors.bgSurface }]}
        >
          <Icon name="chevronLeft" size={20} color={colors.inkPrimary} />
        </Pressable>
        <SimulatorBadge />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + ACTION_BAR_SPACE },
        ]}
        showsVerticalScrollIndicator={false}
        testID="journey-detail"
      >
        <AssetImage
          uri={`asset://${data.coverAssetId}`}
          accessibilityLabel={data.worldTitle}
          aspectRatio={MEDIA_ASPECT.landscape}
        />

        <View style={styles.titleBlock}>
          <Text variant="screen">{data.worldTitle}</Text>
          <Text variant="caption" tone="secondary">
            {t('journey.personaLabel', { name: data.personaName })}
          </Text>
          <Text variant="caption" tone="secondary">
            {t('journey.progress', {
              beat: data.lastReadSequence,
              decisions: data.decisionCount,
            })}
          </Text>
          <Text variant="caption" tone="secondary">
            {t('journey.lastPlayed', { when: formatRelativeDay(data.updatedAt, locale) })}
          </Text>
        </View>

        {data.hasUnreadBeats ? (
          <View
            accessible
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: colors.bgMuted, borderColor: colors.accent }]}
          >
            <Text variant="caption" tone="accent">
              {t('journey.unreadBadge')}
            </Text>
          </View>
        ) : null}

        <Section title={t('journey.relationsTitle')}>
          {data.relations.length === 0 ? (
            <Text variant="small" tone="secondary">
              {t('inspector.empty')}
            </Text>
          ) : (
            data.relations.map((relation) => (
              <NPCRelationChip
                key={relation.npcId}
                npcName={characterName(relation.npcId)}
                status={relation.status}
              />
            ))
          )}
          <Text variant="caption" tone="secondary" style={styles.relationNote}>
            {t('journey.notice')}
          </Text>
        </Section>

        <Section title={t('plan.memoryTitle')}>
          {data.memory.activeVersion === null ? (
            <Text variant="small" tone="secondary">
              {t('plan.memoryNone')}
            </Text>
          ) : (
            <Text variant="small">
              {t('plan.memoryVersion', {
                version: data.memory.activeVersion,
                source: data.memory.source,
              })}
            </Text>
          )}
        </Section>

        <Section title={t('log.title')}>
          <Text variant="caption" tone="secondary">
            {t('log.readOnly')}
          </Text>
          <Button
            label={t('journey.openLog')}
            onPress={() => {
              void openLog();
            }}
            variant="secondary"
            loading={logLoading}
            disabled={logLoading}
            testID="journey-open-log"
          />
          {logError ? (
            <Text variant="caption" tone="danger">
              {logError}
            </Text>
          ) : null}
        </Section>
      </ScrollView>

      <StickyActionBar
        testID="journey-action-bar"
        primaryLabel={t('journey.continue')}
        onPrimary={onContinue}
        secondaryIcon="trash"
        secondaryLabel={t('journey.delete')}
        onSecondary={() => {
          setDeleteError(null);
          setConfirmVisible(true);
        }}
        secondaryDanger
      />

      <ConfirmDialog
        visible={confirmVisible}
        title={t('journey.deleteTitle')}
        body={
          deleteError
            ? `${t('journey.deleteBody', { world: data.worldTitle })}\n\n${deleteError}`
            : t('journey.deleteBody', { world: data.worldTitle })
        }
        confirmLabel={
          deleteJourney.isPending ? t('journey.deleting') : t('journey.deleteConfirm')
        }
        cancelLabel={t('journey.deleteCancel')}
        destructive
        busy={deleteJourney.isPending}
        onConfirm={() => {
          void onConfirmDelete();
        }}
        onCancel={() => setConfirmVisible(false)}
        testID="journey-delete-dialog"
      />

      <LogDrawer
        visible={logVisible}
        beats={logBeats}
        // Hanya menampilkan sampai posisi baca pemain, bukan seluruh beat committed.
        cursor={data.lastReadSequence}
        npcNameById={Object.fromEntries(
          (world.data?.characters ?? []).map((character) => [character.npcId, character.name]),
        )}
        onClose={() => setLogVisible(false)}
        testID="journey-log"
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="title">{title}</Text>
      <View style={[styles.sectionBody, { borderTopColor: colors.line }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  backSlot: { alignItems: 'center' },
  backLink: { padding: space.md, minHeight: touchTarget },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  backButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.xl,
  },
  titleBlock: { gap: space.xs },
  notice: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  section: { gap: space.sm },
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    gap: space.sm,
  },
  relationNote: {
    marginTop: space.sm,
  },
});
