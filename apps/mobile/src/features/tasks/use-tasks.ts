/**
 * Offline-first task hooks.
 *
 * Reads come from the persisted local cache (AsyncStorage) and stay usable
 * offline. Writes are optimistic: applied locally instantly AND queued as a
 * sync operation. When online the queue is replayed right away (push+pull);
 * when offline it is replayed on reconnection by the sync engine.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskDto, SyncPushOperation, TaskDto, UpdateTaskDto } from "@template/contracts";
import { pullSync } from "@/api/endpoints/sync.api";
import { buildLocalTask, tasksStore } from "./tasks.store";
import { syncQueueStore } from "@/features/sync/sync-queue";
import { getSyncStatus, runSync } from "@/features/sync/use-sync";

/** Reactive query over the local (persisted) cache — works offline. */
export function useLocalTasks() {
  return useQuery({
    queryKey: ["tasks", "local"],
    queryFn: () => tasksStore.getAll(),
    staleTime: 1000 * 60 * 60 * 24, // local cache IS the source of truth
    gcTime: 1000 * 60 * 60 * 24 * 7,
  });
}

/** Initial load: full pull from the server merged into the local cache. */
export function useInitialSync(options: { enabled: boolean }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const pull = await pullSync();
      if (pull.deletions.length > 0) {
        await tasksStore.removeDeleted(pull.deletions.map((d) => d.id));
      }
      await tasksStore.upsertMany(pull.changes);
      await syncQueueStore.setCursor(pull.server_time);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    ...options,
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Shared mutation plumbing: apply optimistic local change, enqueue the sync
 * operation, then try to sync immediately when online.
 */
async function optimisticWrite(
  applyLocal: (current: TaskDto[]) => TaskDto[],
  op: SyncPushOperation
): Promise<void> {
  const current = await tasksStore.getAll();
  await tasksStore.replaceAll(applyLocal(current));
  await syncQueueStore.enqueue(op);
  if (getSyncStatus() === "online") {
    void runSync();
  }
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTaskDto): Promise<TaskDto> => {
      const id = crypto.randomUUID();
      const now = nowIso();
      const local = buildLocalTask({
        id,
        title: dto.title,
        priority: dto.priority,
        due_date: dto.due_date ?? null,
        has_time: dto.has_time,
        description: dto.description ?? null,
        tags: dto.tags,
        subtasks: dto.subtasks,
        recurrence_rule: dto.recurrence_rule ?? null,
        now,
      });
      await optimisticWrite((current) => [...current, local], {
        op: "upsert",
        id,
        updated_at: now,
        data: { ...local },
      });
      return local;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export interface UpdateTaskArgs {
  /** Target task id (or PARENT id for an occurrence mutation). */
  id: string;
  /** Occurrence instant (ISO) for recurring occurrence mutations. */
  occurrenceDate?: string;
  dto: UpdateTaskDto;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, occurrenceDate, dto }: UpdateTaskArgs): Promise<TaskDto> => {
      const now = nowIso();
      await optimisticWrite(
        (current) =>
          current.map((t) => {
            // Virtual occurrence row (expanded row of a recurring parent).
            if (occurrenceDate && t.is_occurrence && t.occurrence_date === occurrenceDate) {
              return { ...t, ...dto, updated_at: now, status: dto.status ?? t.status };
            }
            // Materialized instance rendered at that instant.
            if (occurrenceDate && t.parent_task_id === id && t.due_date === occurrenceDate) {
              return { ...t, ...dto, updated_at: now, status: dto.status ?? t.status };
            }
            // Plain task / instance direct edit (no occurrenceDate).
            if (!occurrenceDate && t.id === id) {
              return { ...t, ...dto, updated_at: now };
            }
            return t;
          }),
        {
          op: "upsert",
          id,
          updated_at: now,
          // Occurrence mutations carry the instant so the server materializes
          // an instance instead of touching the parent (`?occurrence_date=`).
          data: {
            ...(occurrenceDate ? { due_date: occurrenceDate, parent_task_id: id } : {}),
            ...dto,
          },
        }
      );
      return { id, ...dto, updated_at: now } as TaskDto;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const now = nowIso();
      await optimisticWrite((current) => current.filter((t) => t.id !== id), {
        op: "delete",
        id,
        updated_at: now,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
