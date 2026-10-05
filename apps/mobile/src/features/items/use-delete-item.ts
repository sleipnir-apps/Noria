import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteItem } from "../../api/endpoints/items.api";

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
  });
}
