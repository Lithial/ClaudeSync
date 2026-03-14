import { describe, it, expect } from "vitest";
import {
  createMessage,
  createEnvelope,
  parseMessage,
  MessageTypes,
} from "../src/index.js";

describe("createEnvelope", () => {
  it("creates an envelope with required fields", () => {
    const env = createEnvelope(MessageTypes.PEER_LIST, "alice");
    expect(env.id).toBeDefined();
    expect(env.type).toBe("peer:list");
    expect(env.from).toBe("alice");
    expect(env.to).toBeNull();
    expect(env.timestamp).toBeTypeOf("number");
  });
});

describe("createMessage", () => {
  it("creates a task request message", () => {
    const msg = createMessage(MessageTypes.TASK_REQUEST, "alice", "bob", {
      taskId: "t1",
      description: "Run tests",
      instructions: "npm test",
    });
    expect(msg.type).toBe("task:request");
    expect(msg.from).toBe("alice");
    expect(msg.to).toBe("bob");
    expect(msg.payload.taskId).toBe("t1");
  });
});

describe("parseMessage", () => {
  it("parses a valid message", () => {
    const original = createMessage(MessageTypes.PEER_REGISTER, "alice", "server", {
      name: "alice",
      token: "secret",
    });
    const parsed = parseMessage(JSON.stringify(original));
    expect(parsed.type).toBe(MessageTypes.PEER_REGISTER);
    expect(parsed.from).toBe("alice");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseMessage("not json")).toThrow();
  });

  it("rejects message with missing fields", () => {
    expect(() => parseMessage(JSON.stringify({ id: "1" }))).toThrow("missing required fields");
  });

  it("rejects unknown message type", () => {
    const msg = {
      id: "1",
      type: "unknown:type",
      from: "alice",
      to: null,
      timestamp: Date.now(),
      payload: {},
    };
    expect(() => parseMessage(JSON.stringify(msg))).toThrow("Unknown message type");
  });
});
