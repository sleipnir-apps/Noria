import type {
  Item,
  CreateItemDto,
  UpdateItemDto,
  ItemFilters,
  PaginationMeta,
} from "@template/contracts";
import { apiClient } from "../client";

export interface ItemsListResponse {
  data: Item[];
  meta: PaginationMeta;
}

export function getItems(filters: Partial<ItemFilters> = {}): Promise<ItemsListResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  return apiClient<ItemsListResponse>(`/items?${params.toString()}`);
}

export function getItem(id: string): Promise<Item> {
  return apiClient<Item>(`/items/${id}`);
}

export function createItem(dto: CreateItemDto): Promise<Item> {
  return apiClient<Item>("/items", { method: "POST", body: JSON.stringify(dto) });
}

export function updateItem(id: string, dto: UpdateItemDto): Promise<Item> {
  return apiClient<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
}

export function deleteItem(id: string): Promise<void> {
  return apiClient<void>(`/items/${id}`, { method: "DELETE" });
}
