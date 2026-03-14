import { describe, it, expect } from "vitest";
import { validateToken } from "../src/auth.js";

describe("validateToken", () => {
  it("accepts matching tokens", () => {
    expect(validateToken("secret123", "secret123")).toBe(true);
  });

  it("rejects non-matching tokens", () => {
    expect(validateToken("wrong", "secret123")).toBe(false);
  });

  it("rejects different length tokens", () => {
    expect(validateToken("short", "longersecret")).toBe(false);
  });

  it("rejects empty tokens", () => {
    expect(validateToken("", "secret")).toBe(false);
    expect(validateToken("secret", "")).toBe(false);
  });
});
