import type { UserDto, PaginationMeta } from "@template/contracts";
import { apiClient } from "../client";

export interface UsersListResponse {
  data: UserDto[];
  meta: PaginationMeta;
}

export function getUsers(page = 1, limit = 20): Promise<UsersListResponse> {
  return apiClient<UsersListResponse>(`/admin/users?page=${page}&limit=${limit}`);
}
