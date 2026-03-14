import { describe, it, expect } from "vitest";
import { PeerRegistry } from "../src/peers.js";

describe("PeerRegistry", () => {
  it("adds and lists peers", () => {
    const registry = new PeerRegistry();
    const fakeWs = {} as any;
    expect(registry.add("alice", fakeWs)).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.list()[0].name).toBe("alice");
  });

  it("rejects duplicate names", () => {
    const registry = new PeerRegistry();
    const fakeWs = {} as any;
    registry.add("alice", fakeWs);
    expect(registry.add("alice", fakeWs)).toBe(false);
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
