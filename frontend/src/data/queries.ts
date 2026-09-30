import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useGateway } from './GatewayProvider';
import type { CatalogPage, CatalogQuery, ReadProgressInput } from './gateway';

import type { JourneyDetailDTO, JourneySummary, UsageDTO, WorldDetailDTO } from '@/domain/types';

export const queryKeys = {
  catalog: (query: CatalogQuery) => ['catalog', query] as const,
  world: (worldId: string) => ['world', worldId] as const,
  journeys: () => ['journeys'] as const,
  journey: (journeyId: string) => ['journey', journeyId] as const,
  usage: () => ['usage'] as const,
};

/**
 * Katalog dengan pencarian dan filter.
 * Data lama dipertahankan selama pemuatan ulang agar daftar tidak berkedip kosong.
 */
export function useCatalog(query: CatalogQuery): UseQueryResult<CatalogPage, Error> {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.catalog(query),
    queryFn: () => gateway.fetchCatalog(query),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

export function useWorldDetail(worldId: string | undefined): UseQueryResult<WorldDetailDTO, Error> {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.world(worldId ?? 'unknown'),
    queryFn: () => gateway.fetchWorld(worldId as string),
    enabled: Boolean(worldId),
    staleTime: 5 * 60_000,
  });
}

export function useJourneys(): UseQueryResult<JourneySummary[], Error> {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.journeys(),
    queryFn: () => gateway.fetchJourneys(),
    staleTime: 0,
  });
}

export function useJourneyDetail(
  journeyId: string | undefined,
): UseQueryResult<JourneyDetailDTO, Error> {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.journey(journeyId ?? 'unknown'),
    queryFn: () => gateway.fetchJourneyDetail(journeyId as string),
    enabled: Boolean(journeyId),
    staleTime: 0,
  });
}

export function useUsage(): UseQueryResult<UsageDTO, Error> {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.usage(),
    queryFn: () => gateway.fetchUsage(),
    staleTime: 0,
  });
}

/**
 * Menghapus perjalanan.
 *
 * Cache daftar dan detail dibersihkan setelah berhasil, sehingga daftar tidak
 * menampilkan perjalanan yang sudah tidak ada.
 */
export function useDeleteJourney() {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (journeyId: string) => gateway.deleteJourney(journeyId),
    onSuccess: (_result, journeyId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.journeys() });
      queryClient.removeQueries({ queryKey: queryKeys.journey(journeyId) });
    },
  });
}

/**
 * Melaporkan posisi baca tanpa memblokir UI.
 *
 * Kegagalan diabaikan dengan sengaja: ini hanya menyelaraskan daftar Perjalanan,
 * bukan bagian dari integritas cerita. Bila gagal, pemain tetap bisa melanjutkan.
 */
export function useSyncReadProgress() {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReadProgressInput) => gateway.syncReadProgress(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.journeys() });
    },
  });
}
