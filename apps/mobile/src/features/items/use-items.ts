import { useQuery } from "@tanstack/react-query";
import type { ItemFilters } from "@template/contracts";
import { getItems } from "../../api/endpoints/items.api";

export function useItems(filters: Partial<ItemFilters> = {}) {
  return useQuery({
    queryKey: ["items", filters],
    queryFn: () => getItems(filters),
  });
}
