import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AmplitudeClient } from "../storage/amplitude.js";
import { AmplitudeStorage } from "../storage/amplitude.js";
import type { ProgressiveConfig } from "../types.js";

function createMockClient(): AmplitudeClient & {
  events: Array<{ name: string; properties?: Record<string, unknown>; options?: Record<string, unknown> }>;
} {
  const events: Array<{ name: string; properties?: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  return {
    events,
    track(name, properties, options) {
      events.push({ name, properties, options });
    },
  };
}

describe("AmplitudeStorage", () => {
  let client: ReturnType<typeof createMockClient>;
  let storage: AmplitudeStorage;

  beforeEach(() => {
    client = createMockClient();
    storage = new AmplitudeStorage(client, { keyPrefix: "test:" });
  });

  it("tracks type registration", () => {
    storage.addName("UserPayload");
    expect(client.events).toHaveLength(1);
    expect(client.events[0]).toMatchObject({
      name: "pzod:type_registered",
      properties: { type_name: "UserPayload" },
    });
  });

  it("tracks observations with sample metadata", () => {
    storage.addSample("UserPayload", JSON.stringify({ name: "Alice", age: 30 }));
    expect(client.events).toHaveLength(1);
    expect(client.events[0]).toMatchObject({
      name: "pzod:observation",
      properties: {
        type_name: "UserPayload",
        status: "untyped",
        sample_type: "object",
        field_count: 2,
      },
    });
  });

  it("tracks violations", () => {
    storage.addViolation("UserPayload", JSON.stringify({ bad: true }));
    expect(client.events).toHaveLength(1);
    expect(client.events[0]).toMatchObject({
      name: "pzod:violation",
      properties: {
        type_name: "UserPayload",
        sample_type: "object",
        field_count: 1,
      },
    });
  });

  it("tracks conform/violate schema checks", () => {
    storage.incrConform("UserPayload");
    storage.incrViolate("UserPayload");
    expect(client.events).toHaveLength(2);
    expect(client.events[0]).toMatchObject({
      name: "pzod:schema_check",
      properties: { type_name: "UserPayload", result: "conform" },
    });
    expect(client.events[1]).toMatchObject({
      name: "pzod:schema_check",
      properties: { type_name: "UserPayload", result: "violate" },
    });
  });

  it("uses device_id based on keyPrefix", () => {
    storage.addName("Test");
    expect(client.events[0].options).toEqual({ device_id: "pzod:test:" });
  });

  it("truncates sample_preview to 256 chars", () => {
    const longSample = JSON.stringify({ data: "x".repeat(500) });
    storage.addSample("Big", longSample);
    expect(client.events[0].properties!.sample_preview).toHaveLength(256);
  });

  it("handles arrays correctly", () => {
    storage.addSample("Items", JSON.stringify([1, 2, 3]));
    expect(client.events[0].properties).toMatchObject({
      sample_type: "array",
      field_count: 0,
    });
  });

  it("handles primitives correctly", () => {
    storage.addSample("Count", JSON.stringify(42));
    expect(client.events[0].properties).toMatchObject({
      sample_type: "number",
      field_count: 0,
    });
  });

  // Read methods return empty — data lives in Amplitude dashboard
  it("returns empty from read methods", async () => {
    expect(await storage.getNames()).toEqual([]);
    expect(await storage.getSamples("x")).toEqual([]);
    expect(await storage.getViolations("x", 10)).toEqual([]);
    expect(await storage.getStats("x")).toEqual({ conform: 0, violate: 0 });
  });

  it("disconnect is a no-op", () => {
    expect(() => storage.disconnect()).not.toThrow();
  });
});
