#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MessageTypes, type Message, DEFAULT_TASK_TIMEOUT_MS } from "@claude-sync/protocol";
import { SyncClient } from "./client.js";
import { TaskStore } from "./task-store.js";
import { listPeers } from "./tools/list-peers.js";
import { sendTask } from "./tools/send-task.js";
import { waitForResponse } from "./tools/wait-for-response.js";
import { sendResult } from "./tools/send-result.js";
import { checkInbox } from "./tools/check-inbox.js";
import { gitSync } from "./tools/git-sync.js";

const url = process.env.CLAUDE_SYNC_URL;
const token = process.env.CLAUDE_SYNC_TOKEN;
const peerName = process.env.CLAUDE_SYNC_PEER_NAME ?? `peer-${crypto.randomUUID().slice(0, 8)}`;

if (!url || !token) {
  console.error("CLAUDE_SYNC_URL and CLAUDE_SYNC_TOKEN are required");
  process.exit(1);
}

const client = new SyncClient(url, token, peerName);
const taskStore = new TaskStore();

// Wire up incoming messages to task store
client.onMessage((msg: Message) => {
  if (msg.type === MessageTypes.TASK_REQUEST) {
    taskStore.addToInbox(msg.from, msg.payload);
  } else if (msg.type === MessageTypes.TASK_RESULT) {
    taskStore.resolveTask(msg.payload.taskId, msg.payload);
  }
});

const server = new McpServer({
  name: "claude-sync",
  version: "0.1.0",
});

server.tool(
  "list_peers",
  "List all connected Claude Code instances",
  {},
  async () => {
    const peers = await listPeers(client, peerName);
    return { content: [{ type: "text", text: JSON.stringify(peers, null, 2) }] };
  },
);

server.tool(
  "send_task",
  "Send a task to a remote Claude Code instance. Returns a taskId to use with wait_for_response.",
  {
    to: z.string().describe("Target peer name"),
    description: z.string().describe("Short description of the task"),
    instructions: z.string().describe("Detailed instructions for the remote Claude"),
    branch: z.string().optional().describe("Git branch context"),
    repo: z.string().optional().describe("Repository context"),
    files: z.array(z.string()).optional().describe("Relevant file paths"),
    timeout: z.number().optional().describe("Task timeout in milliseconds"),
  },
  async ({ to, description, instructions, branch, repo, files, timeout }) => {
    const context = branch || repo || files ? { branch, repo, files } : undefined;
    const taskId = sendTask(client, peerName, { to, description, instructions, context, timeout });
    // Also register it in the task store for waiting
    return { content: [{ type: "text", text: JSON.stringify({ taskId }) }] };
  },
);

server.tool(
  "wait_for_response",
  "Wait for a task result from a remote peer. Blocks until the result arrives or timeout.",
  {
    taskId: z.string().describe("The task ID returned by send_task"),
    timeout: z.number().optional().describe(`Timeout in ms (default: ${DEFAULT_TASK_TIMEOUT_MS})`),
  },
  async ({ taskId, timeout }) => {
    try {
      const result = await waitForResponse(taskStore, taskId, timeout);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  },
);

server.tool(
  "send_result",
  "Respond to a task received from another peer",
  {
    to: z.string().describe("The peer who sent the task"),
    taskId: z.string().describe("The task ID being responded to"),
    status: z.enum(["success", "failure", "error"]).describe("Task outcome"),
    summary: z.string().describe("Brief summary of the result"),
    details: z.string().optional().describe("Detailed output or logs"),
  },
  async ({ to, taskId, status, summary, details }) => {
    sendResult(client, peerName, { to, taskId, status, summary, details });
    return { content: [{ type: "text", text: "Result sent." }] };
  },
);

server.tool(
  "check_inbox",
  "Check for pending incoming tasks from other peers",
  {},
  async () => {
    const items = checkInbox(taskStore);
    if (items.length === 0) {
      return { content: [{ type: "text", text: "No pending tasks." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
  },
);

server.tool(
  "git_sync",
  "Stage, commit, and push changes, optionally notifying peers",
  {
    message: z.string().describe("Commit message"),
    branch: z.string().optional().describe("Branch to push to (defaults to current)"),
    notify: z.boolean().optional().describe("Notify connected peers after push"),
    notifyPeers: z.array(z.string()).optional().describe("Specific peers to notify"),
  },
  async ({ message, branch, notify, notifyPeers }) => {
    const result = gitSync(client, peerName, { message, branch, notify, notifyPeers });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.success,
    };
  },
);

async function main() {
  await client.connect();
  console.error(`Connected as "${peerName}" to ${url}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
