import type { SyncClient } from "../client.js";
import type { TaskStatus } from "@claude-sync/protocol";
import { MessageTypes, createMessage } from "@claude-sync/protocol";

export interface SendResultArgs {
  to: string;
  taskId: string;
  status: TaskStatus;
  summary: string;
  details?: string;
}

export function sendResult(client: SyncClient, peerName: string, args: SendResultArgs): void {
  const msg = createMessage(MessageTypes.TASK_RESULT, peerName, args.to, {
    taskId: args.taskId,
    status: args.status,
    summary: args.summary,
    details: args.details,
  });
  client.send(msg);
}
