import { describe, it, expect } from "vitest";
import { PeerRegistry } from "../src/peers.js";

describe("PeerRegistry", () => {
  it("adds and lists peers", () => {
    const registry = new PeerRegistry();
    const fakeWs = {} as any;
    const result = registry.add("alice", fakeWs);
    expect(result.added).toBe(true);
    expect(result.displaced).toBeNull();
    expect(registry.size).toBe(1);
    expect(registry.list()[0].name).toBe("alice");
  });

  it("displaces existing peer with same name", () => {
    const registry = new PeerRegistry();
    const oldWs = { id: "old" } as any;
    const newWs = { id: "new" } as any;
    registry.add("alice", oldWs);
    const result = registry.add("alice", newWs);
    expect(result.added).toBe(true);
    if (result.added) {
      expect(result.displaced).toBe(oldWs);
    }
    expect(registry.size).toBe(1);
    expect(registry.get("alice")?.ws).toBe(newWs);
  });

  it("removes peers", () => {
    const registry = new PeerRegistry();
    registry.add("alice", {} as any);
    expect(registry.remove("alice")).toBe(true);
    expect(registry.size).toBe(0);
  });

  it("finds peer by socket", () => {
    const registry = new PeerRegistry();
    const ws = { id: 1 } as any;
    registry.add("alice", ws);
    expect(registry.getBySocket(ws)?.name).toBe("alice");
    expect(registry.getBySocket({} as any)).toBeUndefined();
  });
});
