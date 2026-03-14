#!/usr/bin/env node
import { Command } from "commander";
import { MessageTypes, type Message, DEFAULT_TASK_TIMEOUT_MS } from "@claude-sync/protocol";
import { SyncClient } from "./client.js";
import { TaskStore } from "./task-store.js";
import { listPeers } from "./tools/list-peers.js";
import { sendTask } from "./tools/send-task.js";
import { waitForResponse } from "./tools/wait-for-response.js";
import { sendResult as sendResultTool } from "./tools/send-result.js";
import { checkInbox as checkInboxTool } from "./tools/check-inbox.js";
import { gitSync as gitSyncTool } from "./tools/git-sync.js";
import { pingPeer } from "./tools/ping-peer.js";

function getConfig() {
  const url = process.env.CLAUDE_SYNC_URL;
  const token = process.env.CLAUDE_SYNC_TOKEN;
  const peerName = process.env.CLAUDE_SYNC_PEER_NAME ?? `cli-${crypto.randomUUID().slice(0, 8)}`;
  if (!url || !token) {
    console.error("CLAUDE_SYNC_URL and CLAUDE_SYNC_TOKEN environment variables are required");
    process.exit(1);
  }
  return { url, token, peerName };
}

async function withClient<T>(fn: (client: SyncClient, peerName: string, taskStore: TaskStore) => Promise<T>): Promise<T> {
  const { url, token, peerName } = getConfig();
  const client = new SyncClient(url, token, peerName);
  const taskStore = new TaskStore();

  client.onMessage((msg: Message) => {
    if (msg.type === MessageTypes.TASK_REQUEST) {
      taskStore.addToInbox(msg.from, msg.payload);
    } else if (msg.type === MessageTypes.TASK_RESULT) {
      taskStore.resolveTask(msg.payload.taskId, msg.payload);
    }
  });

  await client.connect();
  try {
    return await fn(client, peerName, taskStore);
  } finally {
    client.close();
  }
}

const program = new Command()
  .name("claude-sync")
  .description("Cross-machine Claude Code coordination CLI")
  .version("0.1.0");

program
  .command("list-peers")
  .description("Show connected Claude instances")
  .action(async () => {
    await withClient(async (client, peerName) => {
      const peers = await listPeers(client, peerName);
      console.log(JSON.stringify(peers, null, 2));
    });
  });

program
  .command("ping")
  .description("Ping a remote peer to test connectivity")
  .argument("<peer>", "Target peer name")
  .option("--timeout <ms>", "Timeout in milliseconds", "5000")
  .action(async (peer: string, opts: { timeout: string }) => {
    await withClient(async (client, peerName) => {
      const result = await pingPeer(client, peerName, peer, parseInt(opts.timeout, 10));
      console.log(`Pong from "${result.peer}" — ${result.roundTripMs}ms round trip`);
    });
  });

program
  .command("send-task")
  .description("Send instructions to a peer")
  .requiredOption("--to <peer>", "Target peer name")
  .requiredOption("--instructions <text>", "Task instructions")
  .option("--description <text>", "Short description", "CLI task")
  .option("--branch <branch>", "Git branch context")
  .option("--wait", "Wait for the result")
  .option("--timeout <ms>", "Timeout in milliseconds", String(DEFAULT_TASK_TIMEOUT_MS))
  .action(async (opts) => {
    await withClient(async (client, peerName, taskStore) => {
      const taskId = sendTask(client, peerName, {
        to: opts.to,
        description: opts.description,
        instructions: opts.instructions,
        context: opts.branch ? { branch: opts.branch } : undefined,
        timeout: parseInt(opts.timeout, 10),
      });
      console.log(JSON.stringify({ taskId }));

      if (opts.wait) {
        const result = await waitForResponse(taskStore, taskId, parseInt(opts.timeout, 10));
        console.log(JSON.stringify(result, null, 2));
      }
    });
  });

program
  .command("check-inbox")
  .description("Check for pending incoming tasks")
  .action(async () => {
    await withClient(async (_client, _peerName, taskStore) => {
      // Wait briefly for messages to arrive
      await new Promise((r) => setTimeout(r, 1000));
      const items = checkInboxTool(taskStore);
      console.log(JSON.stringify(items, null, 2));
    });
  });

program
  .command("send-result")
  .description("Respond to a received task")
  .requiredOption("--to <peer>", "The peer who sent the task")
  .requiredOption("--task-id <id>", "Task ID being responded to")
  .requiredOption("--status <status>", "success, failure, or error")
  .requiredOption("--summary <text>", "Brief summary")
  .option("--details <text>", "Detailed output")
  .action(async (opts) => {
    await withClient(async (client, peerName) => {
      sendResultTool(client, peerName, {
        to: opts.to,
        taskId: opts.taskId,
        status: opts.status,
        summary: opts.summary,
        details: opts.details,
      });
      console.log("Result sent.");
    });
  });

program
  .command("hello")
  .description("Print a hello-world greeting with peer name and timestamp")
  .action(() => {
    const peerName = process.env.CLAUDE_SYNC_PEER_NAME ?? "unknown";
    const timestamp = new Date().toISOString();
    console.log(`Hello from claude-sync! peer=${peerName} time=${timestamp}`);
  });

program
  .command("git-sync")
  .description("Stage, commit, push, and optionally notify peers")
  .requiredOption("--message <text>", "Commit message")
  .option("--branch <branch>", "Branch to push")
  .option("--notify", "Notify peers after push")
  .action(async (opts) => {
    const client = opts.notify ? await (async () => {
      const { url, token, peerName } = getConfig();
      const c = new SyncClient(url, token, peerName);
      await c.connect();
      return c;
    })() : null;

    const { peerName } = getConfig();
    const result = gitSyncTool(client, peerName, {
      message: opts.message,
      branch: opts.branch,
      notify: opts.notify,
    });
    console.log(JSON.stringify(result, null, 2));
    client?.close();
  });

program.parseAsync();
