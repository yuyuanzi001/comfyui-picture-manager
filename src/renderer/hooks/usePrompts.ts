import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAPI } from '../lib/ipc';
import type { ListOptions, CreatePromptDTO, UpdatePromptDTO } from '../../shared/types';

export function usePromptList(opts: ListOptions = {}) {
  return useQuery({
    queryKey: ['prompts', 'list', opts],
    queryFn: () => getAPI().prompts.list(opts),
  });
}

export function usePromptDetail(id: number) {
  return useQuery({
    queryKey: ['prompts', id],
    queryFn: () => getAPI().prompts.get(id),
    enabled: !!id,
  });
}

export function useCreatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePromptDTO) => getAPI().prompts.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useUpdatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdatePromptDTO }) =>
      getAPI().prompts.update(id, dto),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prompts', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['prompts', 'list'] });
    },
  });
}

export function useDeletePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => getAPI().prompts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
