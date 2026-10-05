import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateItemDto } from "@template/contracts";
import { createItem } from "../../api/endpoints/items.api";

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateItemDto) => createItem(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
  });
}
