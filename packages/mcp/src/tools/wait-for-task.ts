import type { TaskStore } from "../task-store.js";
import type { TaskRequestPayload } from "@claude-sync/protocol";
import { DEFAULT_TASK_TIMEOUT_MS } from "@claude-sync/protocol";

export async function waitForTask(
  taskStore: TaskStore,
  timeout = DEFAULT_TASK_TIMEOUT_MS,
): Promise<{ from: string; payload: TaskRequestPayload }> {
  return taskStore.waitForTask(timeout);
}
