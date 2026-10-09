import { useSyncExternalStore } from "react";
import { taskStore, type TaskStoreState } from "@/store/task.store";
import {
  UPCOMING_DAYS,
  computeBacklog,
  computeTodaySections,
  computeUpcomingGroups,
  type TodaySections,
  type UpcomingDayGroup,
} from "@/features/tasks/task-views";

/** Subscribe a component to the offline-first task store. */
export function useTasksState(): TaskStoreState {
  return useSyncExternalStore(taskStore.subscribe, taskStore.getSnapshot, taskStore.getSnapshot);
}

/** The three "Aujourd'hui" sections, recomputed on each store update. */
export function useTodaySections(): TodaySections {
  const { tasks } = useTasksState();
  return computeTodaySections(tasks, new Date());
}

/** Dateless, sorted backlog (priority asc, then creation date). */
export function useBacklogTasks() {
  const { tasks } = useTasksState();
  return computeBacklog(tasks);
}

/** Day groups of the "À venir" tab, recomputed on each store update. */
export function useUpcomingGroups(days: number = UPCOMING_DAYS): UpcomingDayGroup[] {
  const { tasks } = useTasksState();
  return computeUpcomingGroups(tasks, new Date(), days);
}
