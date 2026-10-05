import type { SyncPushBody, SyncPushResult, SyncResponse } from "@template/contracts";
import { apiClient } from "../client";

/** Pull everything updated after `since` (omit for a full pull). */
export function pullSync(since?: string): Promise<SyncResponse> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return apiClient<SyncResponse>(`/sync${qs}`);
}

/** Push a batch of client operations (LWW on updated_at). */
export function pushSync(body: SyncPushBody): Promise<SyncPushResult> {
  return apiClient<SyncPushResult>("/sync/push", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
