import type { SyncPullResponse, SyncPushDto, SyncPushResponse } from "@template/contracts";
import { apiClient } from "../client";

/** Incremental pull: server changes + deletions + new watermark. */
export function pullChanges(since: string): Promise<SyncPullResponse> {
  return apiClient<SyncPullResponse>(`/sync?since=${encodeURIComponent(since)}`);
}

/** Batch push of queued mutations (LWW on updatedAt). */
export function pushOperations(dto: SyncPushDto): Promise<SyncPushResponse> {
  return apiClient<SyncPushResponse>("/sync/push", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
