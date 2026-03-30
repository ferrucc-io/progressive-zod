import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { progressive, configureBatch, forceFlush, shutdown } from "../progressive.js";
import { configure } from "../storage/index.js";
import { MemoryStorage } from "../storage/memory.js";

describe("progressive", () => {
  beforeEach(() => {
    configure({ storage: "memory", dataDir: undefined });
    // Use tight batch settings for tests
    configureBatch({ flushIntervalMs: 60_000, maxExportBatchSize: 512, maxQueueSize: 2048 });
  });

  afterEach(async () => {
    await shutdown();
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

  it("flushes observations to storage on forceFlush", async () => {
    const schema = progressive("flush-test");
    schema.parse({ a: 1 });
    schema.parse({ a: 2 });

    await forceFlush();

    const { getStorage } = await import("../storage/index.js");
    const storage = await getStorage();
    const names = await storage.getNames();
    expect(names).toContain("flush-test");
    const samples = await storage.getSamples("flush-test");
    expect(samples).toHaveLength(2);
  });

  it("tracks conform and violate through batching", async () => {
    const s = progressive("stats-test", z.object({ name: z.string() }));
    s.parse({ name: "valid" });
    s.parse({ name: 123 }); // violates

    await forceFlush();

    const { getStorage } = await import("../storage/index.js");
    const storage = await getStorage();
    const stats = await storage.getStats("stats-test");
    expect(stats).toEqual({ conform: 1, violate: 1 });
  });
  it("passes opts through to storage on flush", async () => {
    const { configure: configureAmplitude, getStorage } = await import("../storage/index.js");

    const events: Array<{ name: string; properties?: Record<string, unknown> }> = [];
    const mockClient = {
      track(name: string, properties?: Record<string, unknown>) {
        events.push({ name, properties });
      },
    };

    configureAmplitude({
      storage: "amplitude",
      amplitudeClient: mockClient,
    });

    const s = progressive("opts-test", z.object({ name: z.string() }), {
      team: "payments",
      endpoint: "/checkout",
    });
    s.parse({ name: "valid" });
    s.parse({ name: 123 }); // violates

    await forceFlush();

    const conformEvent = events.find((e) => e.properties?.result === "conforms");
    const violateEvent = events.find((e) => e.properties?.result === "violation");

    expect(conformEvent?.properties?.options).toBe("team=payments; endpoint=/checkout");
    expect(violateEvent?.properties?.options).toBe("team=payments; endpoint=/checkout");
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
