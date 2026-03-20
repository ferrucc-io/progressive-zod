import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { execSync } from "child_process";
import Redis from "ioredis";
import { progressive, configureBatch, forceFlush, shutdown } from "../progressive.js";
import { configure, getStorage, disconnectStorage } from "../storage/index.js";

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
    const cliEnv = {
      ...process.env,
      PROGRESSIVE_ZOD_STORAGE: "redis",
      PROGRESSIVE_ZOD_REDIS_URL: REDIS_URL,
      PROGRESSIVE_ZOD_KEY_PREFIX: TEST_PREFIX,
    };

    function runCli(args: string): string {
      return execSync(`npx tsx src/cli/index.ts ${args}`, {
        cwd: "/Users/ferruccio/conductor/workspaces/progressive-zod/buffalo",
        env: cliEnv,
        encoding: "utf-8",
        timeout: 15_000,
      }).trim();
    }

    it("list — shows all monitored types", () => {
      const output = runCli("list");
      expect(output).toContain("Monitored types:");
      expect(output).toContain("ApiResponse");
      expect(output).toContain("UnknownBoundary");
      expect(output).toContain("UserPayload");
    });

    it("stats — shows conform/violate for a type", () => {
      const output = runCli("stats UserPayload");
      expect(output).toContain('Stats for "UserPayload"');
      expect(output).toContain("Conform:    2");
      expect(output).toContain("Violate:    2");
      expect(output).toContain("Total:      4");
      expect(output).toContain("Conformance: 50.0%");
    });

    it("stats — works for types with 0% conformance", () => {
      const output = runCli("stats UnknownBoundary");
      expect(output).toContain('Stats for "UnknownBoundary"');
      expect(output).toContain("Conform:    0");
      expect(output).toContain("Violate:    2");
      expect(output).toContain("Conformance: 0.0%");
    });

    it("violations — shows recent violations", () => {
      const output = runCli("violations UserPayload");
      expect(output).toContain('Recent violations for "UserPayload"');
      // Should contain JSON violation data
      expect(output).toContain("---");
    });

    it("violations --limit — respects the limit flag", () => {
      const output = runCli("violations UserPayload --limit 1");
      expect(output).toContain('Recent violations for "UserPayload" (1)');
    });

    it("violations — shows no violations message when empty", () => {
      const output = runCli("violations PassThrough");
      expect(output).toContain('No violations found for "PassThrough"');
    });

    it("infer — generates a Zod schema from samples", () => {
      const output = runCli("infer UserPayload");
      expect(output).toContain('Inferred schema for "UserPayload"');
      expect(output).toContain('import { z } from "zod"');
      expect(output).toContain("z.object");
    });

    it("infer — shows message when no samples exist", () => {
      const output = runCli("infer NonExistentType");
      expect(output).toContain('No samples found for "NonExistentType"');
    });
  });
});
