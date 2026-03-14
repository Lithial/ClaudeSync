#!/usr/bin/env node
import { WebSocketServer } from "ws";
import { DEFAULT_PORT, DEFAULT_HOST } from "@claude-sync/protocol";
import { Relay } from "./relay.js";

const token = process.env.CLAUDE_SYNC_TOKEN;
if (!token) {
  console.error("Error: CLAUDE_SYNC_TOKEN environment variable is required");
  process.exit(1);
}

const port = parseInt(process.env.CLAUDE_SYNC_PORT ?? String(DEFAULT_PORT), 10);
const host = process.env.CLAUDE_SYNC_HOST ?? DEFAULT_HOST;

const relay = new Relay(token);

const wss = new WebSocketServer({ host, port });

wss.on("connection", (ws) => {
  relay.handleConnection(ws);
});

wss.on("listening", () => {
  console.log(`claude-sync relay server listening on ${host}:${port}`);
});

wss.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});

function shutdown() {
  console.log("\nShutting down...");
  wss.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { wss, relay };
