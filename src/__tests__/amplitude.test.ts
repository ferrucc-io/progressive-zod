import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AmplitudeClient } from "../storage/amplitude.js";
import { AmplitudeStorage } from "../storage/amplitude.js";
import { configure } from "../storage/resolve.js";
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

  it("addName is a no-op", () => {
    storage.addName("UserPayload");
    expect(client.events).toHaveLength(0);
  });

  it("addSample is a no-op", () => {
    storage.addSample("UserPayload", JSON.stringify({ name: "Alice" }));
    expect(client.events).toHaveLength(0);
  });

  it("addViolation is a no-op", () => {
    storage.addViolation("UserPayload", JSON.stringify({ bad: true }));
    expect(client.events).toHaveLength(0);
  });

  it("tracks conform as progressive-zod: results", () => {
    storage.incrConform("UserPayload");
    expect(client.events).toHaveLength(1);
    expect(client.events[0]).toMatchObject({
      name: "progressive-zod: results",
      properties: { type_name: "UserPayload", result: "conforms" },
    });
  });

  it("tracks violate as progressive-zod: results", () => {
    storage.incrViolate("UserPayload");
    expect(client.events).toHaveLength(1);
    expect(client.events[0]).toMatchObject({
      name: "progressive-zod: results",
      properties: { type_name: "UserPayload", result: "violation" },
    });
  });

  it("flattens sample_preview to a non-JSON string", () => {
    const sample = JSON.stringify({ name: "Alice", age: 30, nested: { x: 1 } });
    storage.incrViolate("UserPayload", sample);
    const props = client.events[0].properties!;
    expect(props.sample_preview).toBe('name="Alice"; age=30; nested={"x":1}');
    expect(props.sample_type).toBe("object");
    expect(props.field_count).toBe(3);
  });

  it("handles array samples in sample_preview", () => {
    const sample = JSON.stringify([1, 2, 3]);
    storage.incrViolate("UserPayload", sample);
    const props = client.events[0].properties!;
    expect(props.sample_preview).toBe("1, 2, 3");
    expect(props.sample_type).toBe("object");
  });

  it("handles primitive samples in sample_preview", () => {
    const sample = JSON.stringify("hello");
    storage.incrViolate("UserPayload", sample);
    const props = client.events[0].properties!;
    expect(props.sample_preview).toBe("hello");
    expect(props.sample_type).toBe("string");
  });

  it("uses device_id based on keyPrefix", () => {
    storage.incrConform("Test");
    expect(client.events[0].options).toEqual({ device_id: "progressive-zod:test:" });
  });

  it("uses custom event name when configured", () => {
    const customStorage = new AmplitudeStorage(client, {
      keyPrefix: "test:",
      amplitudeEventName: "my-app: type results",
    });
    customStorage.incrConform("UserPayload");
    customStorage.incrViolate("UserPayload");
    expect(client.events[0].name).toBe("my-app: type results");
    expect(client.events[1].name).toBe("my-app: type results");
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

  describe("config validation", () => {
    it("throws when amplitudeEventName is used with non-amplitude storage", () => {
      expect(() =>
        configure({ storage: "memory", amplitudeEventName: "custom" }),
      ).toThrow(/amplitudeEventName can only be used/);
    });

    it("throws when amplitudeClient is used with non-amplitude storage", () => {
      expect(() =>
        configure({ storage: "redis", amplitudeClient: client }),
      ).toThrow(/amplitudeClient can only be used/);
    });

    it("allows amplitudeEventName with amplitude storage", () => {
      expect(() =>
        configure({
          storage: "amplitude",
          amplitudeClient: client,
          amplitudeEventName: "custom",
        }),
      ).not.toThrow();
    });
  });
});
