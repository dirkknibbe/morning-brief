import { test, expect } from "bun:test";
import { contentHash } from "../content-hash";

test("contentHash: identical input → identical hash", () => {
  const a = contentHash("MCP Auth", "Build a bridge for OAuth to MCP servers");
  const b = contentHash("MCP Auth", "Build a bridge for OAuth to MCP servers");
  expect(a).toBe(b);
});

test("contentHash: case differences collapse", () => {
  const a = contentHash("MCP Auth", "Build a bridge");
  const b = contentHash("mcp auth", "BUILD A BRIDGE");
  expect(a).toBe(b);
});

test("contentHash: punctuation differences collapse", () => {
  const a = contentHash("MCP Auth!", "Build a bridge.");
  const b = contentHash("MCP Auth", "Build a bridge");
  expect(a).toBe(b);
});

test("contentHash: distinct ideas → distinct hashes", () => {
  const a = contentHash("MCP Auth", "Build a bridge");
  const b = contentHash("Browser agents", "Selenium replacement");
  expect(a).not.toBe(b);
});

test("contentHash: returns 64-char hex string", () => {
  const h = contentHash("any", "thing");
  expect(h).toMatch(/^[0-9a-f]{64}$/);
});
