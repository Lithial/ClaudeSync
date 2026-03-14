import type { TaskResultPayload, TaskRequestPayload } from "@claude-sync/protocol";
import { DEFAULT_TASK_TIMEOUT_MS } from "@claude-sync/protocol";

interface PendingTask {
  resolve: (result: TaskResultPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class TaskStore {
  private pending = new Map<string, PendingTask>();
  private inbox: Array<{ from: string; payload: TaskRequestPayload }> = [];

  waitForResult(taskId: string, timeout = DEFAULT_TASK_TIMEOUT_MS): Promise<TaskResultPayload> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(taskId);
        reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(taskId, { resolve, reject, timer });
    });
  }

  resolveTask(taskId: string, result: TaskResultPayload): boolean {
    const pending = this.pending.get(taskId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(taskId);
    pending.resolve(result);
    return true;
  }

  addToInbox(from: string, payload: TaskRequestPayload): void {
    this.inbox.push({ from, payload });
  }

  checkInbox(): Array<{ from: string; payload: TaskRequestPayload }> {
    const items = [...this.inbox];
    this.inbox = [];
    return items;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get inboxCount(): number {
    return this.inbox.length;
  }
}
