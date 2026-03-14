import type { SyncClient } from "../client.js";
import type { TaskContext } from "@claude-sync/protocol";
import { MessageTypes, createMessage } from "@claude-sync/protocol";

export interface SendTaskArgs {
  to: string;
  description: string;
  instructions: string;
  context?: TaskContext;
  timeout?: number;
}

export function sendTask(client: SyncClient, peerName: string, args: SendTaskArgs): string {
  const taskId = crypto.randomUUID();
  const msg = createMessage(MessageTypes.TASK_REQUEST, peerName, args.to, {
    taskId,
    description: args.description,
    instructions: args.instructions,
    context: args.context,
    timeout: args.timeout,
  });
  client.send(msg);
  return taskId;
}
