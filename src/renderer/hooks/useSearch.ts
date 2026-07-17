import { useQuery } from '@tanstack/react-query';
import { getAPI } from '../lib/ipc';
import type { SearchParams } from '../../shared/types';

export function useSearch(params: SearchParams) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () => getAPI().search.query(params),
    enabled: params.query.trim().length > 0 || (params.tagIds?.length ?? 0) > 0,
  });
}

export function useSuggestions(prefix: string) {
  return useQuery({
    queryKey: ['search', 'suggest', prefix],
    queryFn: () => getAPI().search.suggest(prefix),
    enabled: prefix.length >= 1,
  });
}
// NOTE: useSearch and useSuggestions are not used by any component.
// LibraryPage implements its own client-side filtering.
// Keep for potential future server-side search integration.
/*
