import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssetImage } from '@/components/AssetImage';
import { assetUri } from '@/domain/assets';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { NPCRelationChip } from '@/components/NPCRelationChip';
import { Screen } from '@/components/Screen';
import { SimulatorBadge } from '@/components/SimulatorBadge';
import { StateView } from '@/components/StateView';
import { StickyActionBar } from '@/components/StickyActionBar';
import { Text } from '@/components/Text';

import { useGateway } from '@/data/GatewayProvider';
import { StoryGatewayError } from '@/data/gateway';
import { useWorldDetail } from '@/data/queries';
import { contentRatingLabelKey, worldStatusLabelKey } from '@/domain/labels';
import { MEDIA_ASPECT } from '@/domain/media';
import type { NPCPublicDTO, WorldDetailDTO } from '@/domain/types';
import { StartJourneySheet, type PersonaDraft } from '@/features/catalog/StartJourneySheet';
import { useProfile } from '@/features/profile/ProfileProvider';
import { useGenreLabel } from '@/hooks/useGenreLabel';
import { useI18n } from '@/i18n';
import { telemetry } from '@/telemetry/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

/** Tinggi perkiraan action bar agar baris terakhir tidak tertutup. */
const ACTION_BAR_SPACE = 96;

/** Membuat operation id unik untuk pembuatan perjalanan (idempotensi). */
function createJourneyOperationId(): string {
  return `journey-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export default function WorldDetailScreen() {
  const params = useLocalSearchParams<{ worldId?: string }>();
  const worldId = typeof params.worldId === 'string' ? params.worldId : undefined;

  const router = useRouter();
  const gateway = useGateway();
  const { colors } = useTheme();
  const { t } = useI18n();
  const genreLabelOf = useGenreLabel();
  const insets = useSafeAreaInsets();

  const world = useWorldDetail(worldId);
  const profile = useProfile();
  const { saveProfile } = profile;

  const [sheetVisible, setSheetVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /**
   * Membuat perjalanan dengan persona yang diberikan.
   * Dipakai baik oleh jalur profil lengkap maupun jalur lembar persona.
   */
  const createJourney = useCallback(
    async (persona: PersonaDraft) => {
      if (!worldId) {
        return;
      }
      setCreating(true);
      setCreateError(null);
      try {
        const created = await gateway.createJourney({
          clientOperationId: createJourneyOperationId(),
          worldId,
          persona: { name: persona.name, age: persona.age },
          responseLocale: persona.responseLocale,
        });
        telemetry.track('journey_start_result', { simulator: true });
        setSheetVisible(false);
        // Bentuk objek dipakai agar tidak bergantung pada dukungan template literal
        // di rute bertipe.
        router.push({
          pathname: '/player/[journeyId]',
          params: { journeyId: created.journeyId },
        });
      } catch (error) {
        const isConflict = error instanceof StoryGatewayError && error.code === 'CONFLICT';
        setCreateError(isConflict ? t('persona.oneActivePerWorld') : t('persona.startFailed'));
        // Bila jalur profil lengkap gagal, buka lembar persona agar pemain punya
        // jalan keluar alih-alih tombol yang tampak tidak bereaksi.
        setSheetVisible(true);
        telemetry.track('journey_start_result', { errorCode: 'failed', simulator: true });
      } finally {
        setCreating(false);
      }
    },
    [gateway, router, t, worldId],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  const onStartJourney = useCallback(() => {
    telemetry.track('journey_start_requested', { simulator: true });
    setCreateError(null);

    // Profil lengkap berarti pemain sudah mengisi nama dan usia di Pengaturan,
    // jadi lembar persona tidak perlu ditampilkan lagi.
    if (profile.isComplete && profile.profile.age !== null) {
      void createJourney({
        name: profile.profile.name.trim(),
        age: profile.profile.age,
        responseLocale: profile.profile.responseLocale,
      });
      return;
    }

    setSheetVisible(true);
  }, [createJourney, profile.isComplete, profile.profile]);

  const onConfirmPersona = useCallback(
    async (persona: PersonaDraft) => {
      // Simpan sebagai profil agar tidak ditanyakan lagi di perjalanan berikutnya.
      await saveProfile({
        name: persona.name,
        age: persona.age,
        responseLocale: persona.responseLocale,
      });
      await createJourney(persona);
    },
    [createJourney, saveProfile],
  );

  if (world.isLoading && !world.data) {
    return (
      <Screen testID="screen-world-loading">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="small" tone="secondary" style={styles.loadingText}>
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (world.isError || !world.data) {
    return (
      <Screen testID="screen-world-error">
        <StateView
          kind="error"
          title={t('state.errorTitle')}
          body={t('state.errorBody')}
          actionLabel={t('common.retry')}
          onAction={() => {
            void world.refetch();
          }}
        />
        <Pressable onPress={goBack} accessibilityRole="button" style={styles.backLink}>
          <Text variant="label" tone="accent">
            {t('common.back')}
          </Text>
        </Pressable>
      </Screen>
    );
  }

  const data = world.data;
  const isPlayable = data.status === 'published';

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
          <Icon name="chevronRight" size={20} color={colors.inkPrimary} />
        </Pressable>
        <SimulatorBadge />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + ACTION_BAR_SPACE },
        ]}
        showsVerticalScrollIndicator={false}
        testID="screen-world"
      >
        {/*
          * URI diambil dari MANIFEST, bukan disusun dari id aset.
          *
          * Bentuk lamanya `asset://${coverAssetId}` membuat AssetImage selalu
          * menampilkan placeholder dan TIDAK PERNAH meminta gambarnya — sisa dari
          * masa aset dibuat manual dan belum ada berkasnya. Sekarang server sudah
          * mengirim URL absolut di manifest, dan `assetUri()` meneruskannya apa
          * adanya. Kegagalannya senyap: sampulnya hanya tampak seperti placeholder
          * biasa, tanpa satu pun galat.
          */}
        <AssetImage
          uri={assetUri(data.assetManifest.cover?.uri ?? data.coverAssetId)}
          accessibilityLabel={data.title}
          placeholderLabel={data.title}
          aspectRatio={MEDIA_ASPECT.landscape}
        />

        <View style={styles.titleBlock}>
          <Text variant="screen">{data.title}</Text>
          <View style={styles.metaRow}>
            <Text variant="caption" tone="secondary">
              {t('detail.versionLabel', { version: data.worldVersion })}
            </Text>
            <Text variant="caption" tone="secondary">
              ·
            </Text>
            <Text variant="caption" tone="secondary">
              {t(contentRatingLabelKey(data.contentRating))}
            </Text>
            <Text variant="caption" tone="secondary">
              ·
            </Text>
            <Text
              variant="caption"
              weight="600"
              tone={data.status === 'published' ? 'secondary' : 'warning'}
            >
              {t(worldStatusLabelKey(data.status))}
            </Text>
          </View>
        </View>

        {!isPlayable ? (
          <View
            accessible
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: colors.bgMuted, borderColor: colors.line }]}
          >
            <Text variant="small" tone="secondary">
              {t('detail.retiredNotice')}
            </Text>
          </View>
        ) : null}

        <Section title={t('detail.genresTitle')}>
          <View style={styles.chipRow}>
            {data.genres.map((genre) => (
              <Chip key={genre} label={genreLabelOf(genre)} readOnly />
            ))}
          </View>
        </Section>

        <Section title={t('detail.synopsisTitle')}>
          <Text variant="body" tone="secondary">
            {data.synopsis}
          </Text>
        </Section>

        <Section title={t('detail.charactersTitle')}>
          <View style={styles.characterList}>
            {data.characters.map((character) => (
              <CharacterCard
                key={character.npcId}
                character={character}
                portraitUri={portraitUriOf(data, character.defaultPortraitAssetId)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('detail.contentNoticeTitle')}>
          <Text variant="small" tone="secondary">
            {t('detail.contentNoticeBody')}
          </Text>
        </Section>
      </ScrollView>

      <StickyActionBar
        testID="world-action-bar"
        primaryLabel={isPlayable ? t('detail.startJourney') : t('detail.unavailable')}
        onPrimary={onStartJourney}
        primaryDisabled={!isPlayable}
      />

      <StartJourneySheet
        visible={sheetVisible}
        worldTitle={data.title}
        supportedLocales={data.supportedResponseLocales}
        initialName={profile.profile.name}
        initialAge={profile.profile.age}
        initialResponseLocale={profile.profile.responseLocale}
        submitting={creating}
        errorMessage={createError}
        onConfirm={(persona) => {
          void onConfirmPersona(persona);
        }}
        onCancel={() => setSheetVisible(false)}
        testID="start-journey-sheet"
      />
    </View>
  );
}

/**
 * URI potret untuk sebuah asset id, dicari di manifest dunia.
 *
 * Manifest yang memegang URL sungguhannya; "defaultPortraitAssetId" hanya
 * penanda. Mengembalikan asset id apa adanya bila tidak ditemukan, sehingga
 * pemanggilnya tetap mendapat placeholder berlabel alih-alih URI kosong.
 */
function portraitUriOf(data: WorldDetailDTO, assetId: string): string {
  const potret = data.assetManifest.portraits.find((item) => item.assetId === assetId);
  return potret?.uri ?? assetId;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="title" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={[styles.sectionBody, { borderTopColor: colors.line }]}>{children}</View>
    </View>
  );
}

function CharacterCard({
  character,
  portraitUri,
}: {
  character: NPCPublicDTO;
  /**
   * URI potret yang SUDAH diselesaikan pemanggilnya.
   *
   * Kartu ini tidak mencari sendiri di manifest: ia hanya punya karakter, bukan
   * seluruh dunia — dan meneruskan seluruh dunia ke setiap kartu berarti setiap
   * kartu memegang data yang tidak dipakainya.
   */
  portraitUri: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View
      style={[styles.characterCard, { backgroundColor: colors.bgSurface, borderColor: colors.line }]}
    >
      <AssetImage
        uri={portraitUri}
        accessibilityLabel={character.name}
        aspectRatio={MEDIA_ASPECT.square}
        contentFit="cover"
        style={styles.characterPortrait}
      />
      <View style={styles.characterBody}>
        <Text variant="title">{character.name}</Text>
        <Text variant="caption" tone="secondary">
          {t('npc.roleLabel')}: {character.role}
        </Text>
        <Text variant="small" tone="secondary" numberOfLines={3} style={styles.characterBackstory}>
          {character.publicBackstory}
        </Text>
        <View style={styles.characterRelation}>
          <Text variant="caption" tone="secondary">
            {t('npc.relationTitle')}
          </Text>
          <NPCRelationChip npcName={character.name} status={character.initialRelation} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  loadingText: { marginTop: space.sm },
  backLink: { alignSelf: 'center', padding: space.md, minHeight: touchTarget },
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
    transform: [{ rotate: '180deg' }],
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.xl,
  },
  titleBlock: { gap: space.xs },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  notice: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  section: { gap: space.sm },
  sectionTitle: {},
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    gap: space.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  characterList: { gap: space.md },
  characterCard: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  characterPortrait: { width: 84 },
  characterBody: { flex: 1, gap: 2 },
  characterBackstory: { marginTop: space.xs },
  characterRelation: { marginTop: space.sm, gap: space.xs },
});
