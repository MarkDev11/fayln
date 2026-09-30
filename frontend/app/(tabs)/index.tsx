import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { GenreFilterSheet } from '@/components/GenreFilterSheet';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { SimulatorNotice } from '@/components/SimulatorBadge';
import { StateView } from '@/components/StateView';
import { StoryCard } from '@/components/StoryCard';
import { Text } from '@/components/Text';

import { useCatalog } from '@/data/queries';
import { genreLabelKey } from '@/domain/labels';
import type { GenreId, WorldCatalogItem } from '@/domain/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n } from '@/i18n';
import { telemetry } from '@/telemetry/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

const NUM_COLUMNS = 2;

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [searchInput, setSearchInput] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<GenreId[]>([]);
  const [filterVisible, setFilterVisible] = useState(false);

  const debouncedSearch = useDebouncedValue(searchInput, 250);

  const query = useMemo(
    () => ({ search: debouncedSearch, genres: selectedGenres, page: 1, pageSize: 20 }),
    [debouncedSearch, selectedGenres],
  );

  const catalog = useCatalog(query);

  const openWorld = useCallback(
    (worldId: string) => {
      telemetry.track('world_detail_view', { simulator: true });
      router.push(`/world/${worldId}`);
    },
    [router],
  );

  const toggleGenre = useCallback((genre: GenreId) => {
    setSelectedGenres((previous) =>
      previous.includes(genre) ? previous.filter((item) => item !== genre) : [...previous, genre],
    );
  }, []);

  const resetFilters = useCallback(() => {
    setSelectedGenres([]);
  }, []);

  const applyFilters = useCallback(() => {
    setFilterVisible(false);
    telemetry.track('catalog_filter_apply', { count: selectedGenres.length, simulator: true });
  }, [selectedGenres.length]);

  const renderItem = useCallback(
    ({ item }: { item: WorldCatalogItem }) => (
      <View style={styles.cell}>
        <StoryCard item={item} onPress={openWorld} testID={`story-card-${item.worldId}`} />
      </View>
    ),
    [openWorld],
  );

  const isInitialLoading = catalog.isLoading && !catalog.data;
  const items = catalog.data?.items ?? [];
  const hasFilters = selectedGenres.length > 0 || debouncedSearch.trim().length > 0;

  return (
    <Screen padded={false} testID="screen-home">
      <View style={styles.header}>
        <Text variant="screen">{t('home.title')}</Text>

        <View style={styles.searchRow}>
          <SearchField value={searchInput} onChange={setSearchInput} testID="home-search" />
          <Pressable
            onPress={() => setFilterVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('home.filterOpen')}
            accessibilityState={{ selected: selectedGenres.length > 0 }}
            style={[
              styles.filterButton,
              {
                backgroundColor: colors.bgSurface,
                borderColor: selectedGenres.length > 0 ? colors.accent : colors.line,
              },
            ]}
          >
            <Icon
              name="filter"
              size={20}
              color={selectedGenres.length > 0 ? colors.accent : colors.inkSecondary}
            />
            {selectedGenres.length > 0 ? (
              <Text variant="caption" weight="700" tone="accent">
                {selectedGenres.length}
              </Text>
            ) : null}
          </Pressable>
        </View>

        {selectedGenres.length > 0 ? (
          <Text variant="caption" tone="secondary">
            {t('home.filterActiveCount', { count: selectedGenres.length })}
            {' · '}
            {selectedGenres.map((genre) => t(genreLabelKey(genre))).join(', ')}
          </Text>
        ) : null}
      </View>

      {isInitialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="small" tone="secondary" style={styles.loadingText}>
            {t('common.loading')}
          </Text>
        </View>
      ) : catalog.isError ? (
        <StateView
          kind="error"
          title={t('state.errorTitle')}
          body={t('state.errorBody')}
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
        <FlatList
          data={items}
          keyExtractor={(item) => item.worldId}
          renderItem={renderItem}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<SimulatorNotice />}
          ListHeaderComponentStyle={styles.listHeader}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          testID="home-grid"
        />
      )}

      <GenreFilterSheet
        visible={filterVisible}
        selected={selectedGenres}
        onToggle={toggleGenre}
        onReset={resetFilters}
        onApply={applyFilters}
        onClose={() => setFilterVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  filterButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  loadingText: {
    marginTop: space.sm,
  },
  listContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
  },
  listHeader: {
    marginBottom: space.lg,
  },
  column: {
    gap: space.md,
  },
  cell: {
    flex: 1 / NUM_COLUMNS,
    marginBottom: space.lg,
  },
});
