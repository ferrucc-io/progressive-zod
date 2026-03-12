import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { progressive } from "../progressive.js";
import { configure } from "../storage/index.js";
import { MemoryStorage } from "../storage/memory.js";

describe("progressive", () => {
  beforeEach(() => {
    // Reset to memory storage with no persistence each test
    configure({ storage: "memory", dataDir: undefined });
  });

  it("returns input unchanged", () => {
    const schema = progressive("test");
    const input = { foo: "bar", num: 42 };
    const result = schema.parse(input);
    expect(result).toBe(input);
  });

  it("returns input even with a failing schema", () => {
    const schema = progressive(
      "test",
      z.object({ name: z.string() }),
    );
    const input = { name: 123 }; // wrong type
    const result = schema.parse(input);
    expect(result).toBe(input); // still returned unchanged
  });

  it("returns primitives unchanged", () => {
    const schema = progressive("test");
    expect(schema.parse("hello")).toBe("hello");
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse(null)).toBe(null);
  });
});

describe("MemoryStorage", () => {
  it("stores and retrieves names", () => {
    const storage = new MemoryStorage();
    storage.addName("Foo");
    storage.addName("Bar");
    expect(storage.getNames()).toEqual(["Bar", "Foo"]);
  });

  it("stores and retrieves samples", () => {
    const storage = new MemoryStorage();
    storage.addSample("test", '{"a":1}');
    storage.addSample("test", '{"a":2}');
    expect(storage.getSamples("test")).toEqual(['{"a":2}', '{"a":1}']);
  });

  it("enforces max samples limit", () => {
    const storage = new MemoryStorage({ maxSamples: 3 });
    for (let i = 0; i < 5; i++) {
      storage.addSample("test", `${i}`);
    }
    expect(storage.getSamples("test")).toHaveLength(3);
  });

  it("tracks conform and violate counts", async () => {
    const storage = new MemoryStorage();
    storage.incrConform("test");
    storage.incrConform("test");
    storage.incrViolate("test");
    const stats = await storage.getStats("test");
    expect(stats).toEqual({ conform: 2, violate: 1 });
  });
});
