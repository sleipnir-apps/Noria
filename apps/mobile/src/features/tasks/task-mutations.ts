import type { LocalTask, QueuedOperation } from "@/store/task.store";
import { taskStore } from "@/store/task.store";

/**
 * Offline-first mutation API. Every write is applied optimistically on the
 * local dataset and queued for the sync engine — online or not, one code path.
 *
 * Semantics (mirroring the API):
 * - a queued CREATE for an unsynced task is rewritten on later edits/deletes;
 * - an occurrence is completed by materializing an instance (offline CREATE
 *   with parentTaskId + originalDueDate; the server dedupes by originalDueDate).
 */

/** Collision-proof-enough local ids/opIds without a uuid dependency. */
export function newLocalId(prefix = "local"): string {
  const entropy = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, "0")
  ).join("");
  return `${prefix}:${Date.now().toString(36)}-${entropy}`;
}

/** Fields a mutation may change on an existing task (updatedAt recomputed). */
export interface TaskPatch {
  title?: string;
  description?: string | undefined;
  priority?: LocalTask["priority"];
  status?: LocalTask["status"];
  dueDate?: string | undefined;
  hasTime?: boolean;
  tags?: string[];
  subtasks?: LocalTask["subtasks"];
  recurrenceRule?: LocalTask["recurrenceRule"];
}

const nowIso = (): string => new Date().toISOString();

function withPatch(task: LocalTask, patch: TaskPatch, atIso = nowIso()): LocalTask {
  return {
    ...task,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...("description" in patch ? { description: patch.description } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...("dueDate" in patch ? { dueDate: patch.dueDate } : {}),
    ...(patch.hasTime !== undefined ? { hasTime: patch.hasTime } : {}),
    ...(patch.tags !== undefined ? { tags: [...patch.tags] } : {}),
    ...(patch.subtasks !== undefined ? { subtasks: patch.subtasks } : {}),
    ...("recurrenceRule" in patch ? { recurrenceRule: patch.recurrenceRule } : {}),
    updatedAt: atIso,
  };
}

/** Unsynced CREATE queued for this id (never hit the server yet)? */
function hasPendingCreate(id: string): boolean {
  return (
    id.startsWith("local:") &&
    taskStore.getSnapshot().queue.some((op) => op.taskId === id && op.kind === "CREATE")
  );
}

/**
 * Queue an UPDATE on a task created locally and not yet pushed: rewrite its
 * queued CREATE instead — the CREATE snapshot already carries the change.
 */
async function foldIntoPendingCreate(task: LocalTask): Promise<void> {
  const queue = taskStore.getSnapshot().queue;
  const nextQueue = queue.map((op) =>
    op.taskId === task.id && op.kind === "CREATE" ? { ...op, doc: task } : op
  );
  await taskStore.upsertLocal(task);
  await taskStore.setQueue(nextQueue);
}

function queueEntry(
  kind: QueuedOperation["kind"],
  task: LocalTask,
  deletedAt?: string
): QueuedOperation {
  return {
    opId: newLocalId("op"),
    queuedAt: Date.now(),
    kind,
    taskId: task.id,
    ...(kind === "DELETE" ? { deletedAt } : { doc: task }),
  };
}

async function enqueue(
  kind: QueuedOperation["kind"],
  task: LocalTask,
  deletedAt?: string
): Promise<void> {
  await taskStore.upsertLocal(task);
  await taskStore.setQueue([...taskStore.getSnapshot().queue, queueEntry(kind, task, deletedAt)]);
}

// ── Public mutations ─────────────────────────────────────────────────────────

/** Create a fresh local task (dateless backlog item unless dueDate given). */
export async function createTask(
  base: Omit<LocalTask, "id" | "createdAt" | "updatedAt" | "deletedAt">
): Promise<LocalTask> {
  const now = new Date().toISOString();
  const task: LocalTask = {
    id: newLocalId(),
    createdAt: now,
    updatedAt: now,
    ...base,
  };
  await taskStore.upsertLocal(task);
  await enqueueUpdateOrCreate("CREATE", task);
  return task;
}

/** Create or edit a materialized occurrence (post-pone / complete / edit). */
export async function saveOccurrence(
  parentTaskId: string,
  originalDueDate: string,
  patch: TaskPatch
): Promise<void> {
  const tasks = taskStore.getSnapshot().tasks;
  const parent = Object.values(tasks).find((task) => task.id === parentTaskId);
  if (!parent || !parent.recurrenceRule) return;

  const existing = Object.values(tasks).find(
    (task) =>
      task.parentTaskId === parentTaskId &&
      task.originalDueDate === originalDueDate &&
      task.deletedAt === undefined
  );
  if (existing) {
    // Edit / postpone of an existing instance: plain UPDATE on the instance.
    const next = withPatch(existing, patch);
    await enqueueUpdateOrCreate("UPDATE", next);
    return;
  }

  // Materialize a new instance (works offline): the server dedupes by
  // originalDueDate, so replays of the same op never create duplicates.
  const instance = withPatch(
    {
      ...parent,
      id: newLocalId(),
      status: "TODO",
      dueDate: originalDueDate,
      hasTime: parent.hasTime,
      recurrenceRule: undefined,
      parentTaskId,
      originalDueDate,
      subtasks: parent.subtasks.map((subtask) => ({ ...subtask })),
      tags: [...parent.tags],
      createdAt: parent.createdAt,
      updatedAt: nowIso(),
    },
    patch
  );
  await enqueueUpdateOrCreate("CREATE", instance);
}

async function enqueueUpdateOrCreate(kind: "CREATE" | "UPDATE", task: LocalTask): Promise<void> {
  if (hasPendingCreate(task.id)) {
    // The sync engine replays the queued CREATE with its newest snapshot.
    await foldIntoPendingCreate(task);
    return;
  }
  await enqueue(kind, task);
}

/** Queue a plain UPDATE with a full local snapshot (editor saves). */
export async function updateTask(next: LocalTask): Promise<void> {
  await enqueueUpdateOrCreate("UPDATE", next);
}

/** Toggle completion of a stored task (TODO ↔ DONE). */
export async function toggleTaskDone(task: LocalTask): Promise<void> {
  const next = withPatch(task, { status: task.status === "DONE" ? "TODO" : "DONE" });
  await enqueueUpdateOrCreate("UPDATE", next);
}

/** Cycle TODO → IN_PROGRESS → TODO on long-tap or explicit pick. */
export async function setTaskStatus(task: LocalTask, status: LocalTask["status"]): Promise<void> {
  const next = withPatch(task, { status });
  await enqueueUpdateOrCreate("UPDATE", next);
}

/** Toggle one subtask checkbox. */
export async function toggleSubtask(task: LocalTask, subtaskId: string): Promise<void> {
  const subtasks = task.subtasks.map((subtask) =>
    subtask.id === subtaskId ? { ...subtask, isCompleted: !subtask.isCompleted } : subtask
  );
  const next = withPatch(task, { subtasks });
  await enqueueUpdateOrCreate("UPDATE", next);
}

/**
 * Soft delete. An unsynced creation disappears outright (no server op);
 * otherwise queue a DELETE tombstone. Deleting an occurrence instance
 * re-surfaces the underlying occurrence (V1 semantic, see README).
 */
export async function deleteTask(task: LocalTask): Promise<void> {
  if (hasPendingCreate(task.id)) {
    await taskStore.setQueue(
      taskStore.getSnapshot().queue.filter((op) => !(op.taskId === task.id && op.kind === "CREATE"))
    );
    await taskStore.removeLocal(task.id);
    return;
  }
  const at = new Date().toISOString();
  const deleted: LocalTask = { ...task, deletedAt: at, updatedAt: at };
  await enqueue("DELETE", deleted, at);
}

/** Complete (or un-complete) a computed occurrence — materializes an instance. */
export async function completeOccurrence(
  parentTaskId: string,
  originalDueDate: string,
  done: boolean
): Promise<void> {
  await saveOccurrence(parentTaskId, originalDueDate, {
    status: done ? "DONE" : "TODO",
    dueDate: originalDueDate,
  });
}
