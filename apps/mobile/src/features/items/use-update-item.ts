import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateItemDto } from "@template/contracts";
import { updateItem } from "../../api/endpoints/items.api";

export function useUpdateItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateItemDto) => updateItem(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["items", id] });
    },
  });
}
