#!/usr/bin/env node
import { WebSocketServer } from "ws";
import { Bonjour } from "bonjour-service";
import os from "node:os";
import { DEFAULT_PORT, DEFAULT_HOST, MDNS_SERVICE_TYPE } from "@claude-sync/protocol";
import { Relay } from "./relay.js";

const port = parseInt(process.env.CLAUDE_SYNC_PORT ?? String(DEFAULT_PORT), 10);
const host = process.env.CLAUDE_SYNC_HOST ?? DEFAULT_HOST;
const relayName = process.env.CLAUDE_SYNC_RELAY_NAME ?? os.hostname();

const relay = new Relay();
const bonjour = new Bonjour();

const wss = new WebSocketServer({ host, port });

wss.on("connection", (ws) => {
  relay.handleConnection(ws);
});

wss.on("listening", () => {
  console.log(`claude-sync relay server listening on ${host}:${port}`);
  bonjour.publish({ name: relayName, type: MDNS_SERVICE_TYPE, port });
  console.log(`Advertising as "${relayName}" via mDNS`);
});

wss.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});

function shutdown() {
  console.log("\nShutting down...");
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    wss.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { wss, relay };
