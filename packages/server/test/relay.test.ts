import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { Relay } from "../src/relay.js";
import { createMessage, MessageTypes, type Message, parseMessage } from "@claude-sync/protocol";

const TEST_TOKEN = "test-token-123";

function waitForMessage(ws: WebSocket): Promise<Message> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout waiting for message")), 3000);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(parseMessage(data.toString()));
    });
  });
}

function connectPeer(port: number, name: string, token = TEST_TOKEN): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("open", () => {
      const msg = createMessage(MessageTypes.PEER_REGISTER, name, "server", { name, token });
      ws.send(JSON.stringify(msg));
      // Give the server a moment to process registration
      setTimeout(() => resolve(ws), 100);
    });
    ws.on("error", reject);
  });
}

describe("Relay integration", () => {
  let wss: WebSocketServer;
  let relay: Relay;
  let port: number;

  beforeAll(async () => {
    relay = new Relay(TEST_TOKEN);
    wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    wss.on("connection", (ws) => relay.handleConnection(ws));
    await new Promise<void>((resolve) => wss.on("listening", resolve));
    const addr = wss.address();
    port = typeof addr === "object" && addr ? addr.port : 0;
  });

  afterAll(() => {
    wss.close();
  });

  it("rejects invalid token", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    const msg = createMessage(MessageTypes.PEER_REGISTER, "intruder", "server", {
      name: "intruder",
      token: "wrong-token",
    });
    ws.send(JSON.stringify(msg));
    const code = await new Promise<number>((resolve) => ws.on("close", resolve));
    expect(code).toBe(4005);
  });

  it("registers peers and routes messages", async () => {
    const alice = await connectPeer(port, "alice");
    const bob = await connectPeer(port, "bob");

    // Alice sends task to Bob
    const taskMsg = createMessage(MessageTypes.TASK_REQUEST, "alice", "bob", {
      taskId: "t1",
      description: "test",
      instructions: "do stuff",
    });
    const bobReceived = waitForMessage(bob);
    alice.send(JSON.stringify(taskMsg));
    const received = await bobReceived;

    expect(received.type).toBe(MessageTypes.TASK_REQUEST);
    expect(received.from).toBe("alice");
    if (received.type === MessageTypes.TASK_REQUEST) {
      expect(received.payload.taskId).toBe("t1");
    }

    alice.close();
    bob.close();
  });

  it("returns peer list", async () => {
    const carol = await connectPeer(port, "carol");

    const listMsg = createMessage(MessageTypes.PEER_LIST, "carol", "server", {});
    const responseP = waitForMessage(carol);
    carol.send(JSON.stringify(listMsg));
    const response = await responseP;

    expect(response.type).toBe(MessageTypes.PEER_LIST_RESPONSE);
    if (response.type === MessageTypes.PEER_LIST_RESPONSE) {
      const names = response.payload.peers.map((p) => p.name);
      expect(names).toContain("carol");
    }

    carol.close();
  });

  it("sends error for unknown target peer", async () => {
    const dave = await connectPeer(port, "dave");

    const msg = createMessage(MessageTypes.TASK_REQUEST, "dave", "nobody", {
      taskId: "t2",
      description: "test",
      instructions: "nope",
    });
    const errorP = waitForMessage(dave);
    dave.send(JSON.stringify(msg));
    const error = await errorP;

    expect(error.type).toBe(MessageTypes.ERROR);
    if (error.type === MessageTypes.ERROR) {
      expect(error.payload.code).toBe("PEER_NOT_FOUND");
    }

    dave.close();
  });
});
