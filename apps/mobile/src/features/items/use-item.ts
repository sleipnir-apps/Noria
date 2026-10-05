import { useQuery } from "@tanstack/react-query";
import { getItem } from "../../api/endpoints/items.api";

export function useItem(id: string) {
  return useQuery({
    queryKey: ["items", id],
    queryFn: () => getItem(id),
    enabled: !!id,
  });
}
