import type { ProgressiveConfig, StorageBackend } from "../types.js";

/**
 * Minimal interface for an Amplitude client.
 * Compatible with @amplitude/analytics-node's `track()` signature.
 * Pass an instance initialized with your observability project's API key
 * (separate from your main product analytics project).
 */
export interface AmplitudeClient {
  track(
    eventName: string,
    eventProperties?: Record<string, unknown>,
    options?: { user_id?: string; device_id?: string },
  ): void;
}

/**
 * Amplitude storage backend for progressive-zod.
 *
 * Sends type observability data as Amplitude events, designed for
 * segmentation and funnel analysis in the Amplitude dashboard.
 *
 * Event schema:
 *
 *   "pzod:observation"
 *     - type_name: string       — the boundary name passed to progressive()
 *     - status: "conform" | "violate" | "untyped"
 *     - sample_type: string     — JS typeof the observed value
 *     - field_count: number     — number of top-level keys (objects only)
 *     - sample_preview: string  — first 256 chars of JSON (for debugging)
 *
 *   "pzod:type_registered"
 *     - type_name: string
 *
 * Read methods (getNames, getSamples, etc.) are no-ops — use the
 * Amplitude dashboard to query your data.
 */
export class AmplitudeStorage implements StorageBackend {
  private readonly client: AmplitudeClient;
  private readonly deviceId: string;

  constructor(
    client: AmplitudeClient,
    config: ProgressiveConfig,
  ) {
    this.client = client;
    // Use a stable device_id so Amplitude groups events from this service
    this.deviceId = `pzod:${config.keyPrefix ?? "default"}`;
  }

  addName(name: string): void {
    this.client.track(
      "pzod:type_registered",
      { type_name: name },
      { device_id: this.deviceId },
    );
  }

  addSample(name: string, sample: string): void {
    const parsed = safeParse(sample);
    this.client.track(
      "pzod:observation",
      {
        type_name: name,
        status: "untyped",
        sample_type: typeOf(parsed),
        field_count: fieldCount(parsed),
        sample_preview: sample.slice(0, 256),
      },
      { device_id: this.deviceId },
    );
  }

  addViolation(name: string, violation: string): void {
    const parsed = safeParse(violation);
    this.client.track(
      "pzod:violation",
      {
        type_name: name,
        sample_type: typeOf(parsed),
        field_count: fieldCount(parsed),
        sample_preview: violation.slice(0, 256),
      },
      { device_id: this.deviceId },
    );
  }

  incrConform(name: string): void {
    this.client.track(
      "pzod:schema_check",
      { type_name: name, result: "conform" },
      { device_id: this.deviceId },
    );
  }

  incrViolate(name: string): void {
    this.client.track(
      "pzod:schema_check",
      { type_name: name, result: "violate" },
      { device_id: this.deviceId },
    );
  }

  // --- Read methods: no-ops (use Amplitude dashboard) ---

  async getNames(): Promise<string[]> {
    return [];
  }

  async getSamples(_name: string): Promise<string[]> {
    return [];
  }

  async getViolations(_name: string, _limit: number): Promise<string[]> {
    return [];
  }

  async getStats(_name: string): Promise<{ conform: number; violate: number }> {
    return { conform: 0, violate: 0 };
  }

  disconnect(): void {
    // Amplitude SDK manages its own lifecycle — nothing to clean up
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function fieldCount(value: unknown): number {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).length;
  }
  return 0;
}
