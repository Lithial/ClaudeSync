import type { TaskStore } from "../task-store.js";
import type { TaskResultPayload } from "@claude-sync/protocol";
import { DEFAULT_TASK_TIMEOUT_MS } from "@claude-sync/protocol";

export async function waitForResponse(
  taskStore: TaskStore,
  taskId: string,
  timeout = DEFAULT_TASK_TIMEOUT_MS,
): Promise<TaskResultPayload> {
  return taskStore.waitForResult(taskId, timeout);
}
