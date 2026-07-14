import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAPI } from '../lib/ipc';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => getAPI().tags.all(),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => getAPI().tags.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => getAPI().tags.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
}

export function useSetPromptTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ promptId, tagIds }: { promptId: number; tagIds: number[] }) =>
      getAPI().tags.setForPrompt(promptId, tagIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prompts', variables.promptId] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
