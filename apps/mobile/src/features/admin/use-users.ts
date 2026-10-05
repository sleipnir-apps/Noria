import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getUsers, type UsersListResponse } from "../../api/endpoints/admin.api";

export function useUsers(page = 1, isAdmin = false): UseQueryResult<UsersListResponse, Error> {
  return useQuery({
    queryKey: ["admin", "users", page],
    queryFn: () => getUsers(page),
    enabled: isAdmin,
    retry: false,
  });
}
