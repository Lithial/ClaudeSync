import type { TaskStore } from "../task-store.js";
import type { TaskRequestPayload } from "@claude-sync/protocol";

export function checkInbox(
  taskStore: TaskStore,
): Array<{ from: string; payload: TaskRequestPayload }> {
  return taskStore.checkInbox();
}
