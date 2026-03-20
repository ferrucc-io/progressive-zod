import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { z } from "zod";
import Redis from "ioredis";
import { progressive, configureBatch, forceFlush, shutdown } from "../progressive.js";
import { configure, getStorage, disconnectStorage } from "../storage/index.js";
import { listCommand } from "../cli/commands/list.js";
import { statsCommand } from "../cli/commands/stats.js";
import { violationsCommand } from "../cli/commands/violations.js";
import { inferCommand } from "../cli/commands/infer.js";

const TEST_PREFIX = `pzod:test:${Date.now()}:`;
const REDIS_URL = process.env.PROGRESSIVE_ZOD_REDIS_URL ?? "redis://localhost:6379";

let redis: Redis;

async function cleanupRedis() {
  const keys = await redis.keys(`${TEST_PREFIX}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// Skip the entire suite if Redis is not reachable
let redisAvailable = false;
try {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 2000 });
  await probe.connect();
  await probe.ping();
  redisAvailable = true;
  await probe.quit();
} catch {
  // Redis not available — tests will be skipped
}

describe.skipIf(!redisAvailable)("Redis storage e2e", () => {
  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
    await redis.ping(); // ensure Redis is reachable

    configure({ storage: "redis", keyPrefix: TEST_PREFIX });
    configureBatch({
      flushIntervalMs: 60_000,
      maxExportBatchSize: 512,
      maxQueueSize: 2048,
    });
  });

  afterAll(async () => {
    await shutdown();
    await disconnectStorage();
    await cleanupRedis();
    await redis.quit();
  });

  describe("progressive() with Redis storage", () => {
    it("stores samples and tracks conformance in Redis", async () => {
      const UserPayload = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().int().positive(),
      });

      const schema = progressive("UserPayload", UserPayload);

      // Conforming data
      schema.parse({ name: "Alice", email: "alice@example.com", age: 30 });
      schema.parse({ name: "Bob", email: "bob@test.org", age: 25 });

      // Violating data
      schema.parse({ name: 123, email: "not-email", age: -5 });
      schema.parse("completely wrong");

      // No-schema boundary
      const unknownSchema = progressive("UnknownBoundary");
      unknownSchema.parse({ anything: true });
      unknownSchema.parse([1, 2, 3]);

      // API response
      const ApiResponse = z.object({
        status: z.literal("ok"),
        data: z.array(z.unknown()),
      });
      const apiSchema = progressive("ApiResponse", ApiResponse);
      apiSchema.parse({ status: "ok", data: [1, 2, 3] });
      apiSchema.parse({ status: "error", data: null }); // violates

      await forceFlush();

      // Verify data landed in Redis
      const storage = await getStorage();

      const names = await storage.getNames();
      expect(names).toContain("UserPayload");
      expect(names).toContain("UnknownBoundary");
      expect(names).toContain("ApiResponse");
    });

    it("tracks correct conform/violate stats", async () => {
      const storage = await getStorage();

      const userStats = await storage.getStats("UserPayload");
      expect(userStats.conform).toBe(2);
      expect(userStats.violate).toBe(2);

      const apiStats = await storage.getStats("ApiResponse");
      expect(apiStats.conform).toBe(1);
      expect(apiStats.violate).toBe(1);

      const unknownStats = await storage.getStats("UnknownBoundary");
      expect(unknownStats.conform).toBe(0);
      expect(unknownStats.violate).toBe(2);
    });

    it("stores samples in Redis", async () => {
      const storage = await getStorage();
      const samples = await storage.getSamples("UserPayload");
      expect(samples.length).toBeGreaterThanOrEqual(4);

      // Samples should be valid JSON
      for (const s of samples) {
        expect(() => JSON.parse(s)).not.toThrow();
      }
    });

    it("stores violations in Redis", async () => {
      const storage = await getStorage();
      const violations = await storage.getViolations("UserPayload", 10);
      expect(violations.length).toBe(2);

      for (const v of violations) {
        expect(() => JSON.parse(v)).not.toThrow();
      }
    });

    it("parse() returns input unchanged", () => {
      const schema = progressive("PassThrough");
      const obj = { foo: "bar" };
      expect(schema.parse(obj)).toBe(obj);
      expect(schema.parse(42)).toBe(42);
      expect(schema.parse(null)).toBe(null);
      expect(schema.parse("hello")).toBe("hello");
    });
  });

  describe("CLI commands with Redis storage", () => {
    function captureConsole(fn: () => Promise<void>): Promise<string> {
      const lines: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args: any[]) => {
        lines.push(args.map(String).join(" "));
      });
      return fn().then(() => {
        spy.mockRestore();
        return lines.join("\n");
      });
    }

    it("list — shows all monitored types", async () => {
      const output = await captureConsole(() => listCommand());
      expect(output).toContain("Monitored types:");
      expect(output).toContain("ApiResponse");
      expect(output).toContain("UnknownBoundary");
      expect(output).toContain("UserPayload");
    });

    it("stats — shows conform/violate for a type", async () => {
      const output = await captureConsole(() => statsCommand("UserPayload"));
      expect(output).toContain('Stats for "UserPayload"');
      expect(output).toContain("Conform:    2");
      expect(output).toContain("Violate:    2");
      expect(output).toContain("Total:      4");
      expect(output).toContain("Conformance: 50.0%");
    });

    it("stats — works for types with 0% conformance", async () => {
      const output = await captureConsole(() => statsCommand("UnknownBoundary"));
      expect(output).toContain('Stats for "UnknownBoundary"');
      expect(output).toContain("Conform:    0");
      expect(output).toContain("Violate:    2");
      expect(output).toContain("Conformance: 0.0%");
    });

    it("violations — shows recent violations", async () => {
      const output = await captureConsole(() => violationsCommand("UserPayload", { limit: "10" }));
      expect(output).toContain('Recent violations for "UserPayload"');
      expect(output).toContain("---");
    });

    it("violations --limit — respects the limit flag", async () => {
      const output = await captureConsole(() => violationsCommand("UserPayload", { limit: "1" }));
      expect(output).toContain('Recent violations for "UserPayload" (1)');
    });

    it("violations — shows no violations message when empty", async () => {
      const output = await captureConsole(() => violationsCommand("PassThrough", { limit: "10" }));
      expect(output).toContain('No violations found for "PassThrough"');
    });

    it("infer — generates a Zod schema from samples", async () => {
      const output = await captureConsole(() => inferCommand("UserPayload"));
      expect(output).toContain('Inferred schema for "UserPayload"');
      expect(output).toContain('import { z } from "zod"');
      expect(output).toContain("z.object");
    });

    it("infer — shows message when no samples exist", async () => {
      const output = await captureConsole(() => inferCommand("NonExistentType"));
      expect(output).toContain('No samples found for "NonExistentType"');
    });
  });
});
