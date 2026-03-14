import { describe, it, expect } from "vitest";
import { TaskStore } from "../src/task-store.js";

describe("TaskStore", () => {
  it("resolves a pending task", async () => {
    const store = new TaskStore();
    const promise = store.waitForResult("t1", 5000);
    store.resolveTask("t1", {
      taskId: "t1",
      status: "success",
      summary: "Done",
    });
    const result = await promise;
    expect(result.status).toBe("success");
    expect(result.summary).toBe("Done");
  });

  it("times out if no result arrives", async () => {
    const store = new TaskStore();
    await expect(store.waitForResult("t2", 100)).rejects.toThrow("timed out");
  });

  it("manages inbox items", () => {
    const store = new TaskStore();
    store.addToInbox("alice", {
      taskId: "t3",
      description: "test",
      instructions: "do something",
    });
    expect(store.inboxCount).toBe(1);
    const items = store.checkInbox();
    expect(items).toHaveLength(1);
    expect(items[0].from).toBe("alice");
    expect(store.inboxCount).toBe(0);
  });

  it("returns false when resolving unknown task", () => {
    const store = new TaskStore();
    expect(store.resolveTask("unknown", { taskId: "unknown", status: "success", summary: "x" })).toBe(false);
  });
});
