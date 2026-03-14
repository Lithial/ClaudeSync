import { execFileSync } from "node:child_process";
import type { SyncClient } from "../client.js";
import { MessageTypes, createMessage } from "@claude-sync/protocol";

export interface GitSyncArgs {
  message: string;
  branch?: string;
  notify?: boolean;
  notifyPeers?: string[];
}

export function gitSync(
  client: SyncClient | null,
  peerName: string,
  args: GitSyncArgs,
): { success: boolean; output: string } {
  try {
    const outputs: string[] = [];

    // Stage all changes
    outputs.push(execFileSync("git", ["add", "-A"], { encoding: "utf-8" }));

    // Commit
    outputs.push(
      execFileSync("git", ["commit", "-m", args.message], { encoding: "utf-8" }),
    );

    // Push
    const branch =
      args.branch ??
      execFileSync("git", ["branch", "--show-current"], { encoding: "utf-8" }).trim();
    outputs.push(
      execFileSync("git", ["push", "origin", branch], { encoding: "utf-8" }),
    );

    const output = outputs.filter(Boolean).join("\n");

    // Notify peers if requested
    if (args.notify && client?.connected) {
      const taskId = crypto.randomUUID();

      if (args.notifyPeers?.length) {
        for (const peer of args.notifyPeers) {
          client.send(
            createMessage(MessageTypes.TASK_STATUS, peerName, peer, {
              taskId,
              status: "received",
              message: `Git sync: ${args.message} (branch: ${branch})`,
            }),
          );
        }
      } else {
        client.send(
          createMessage(MessageTypes.TASK_STATUS, peerName, null, {
            taskId,
            status: "received",
            message: `Git sync: ${args.message} (branch: ${branch})`,
          }),
        );
      }
    }

    return { success: true, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: message };
  }
}
