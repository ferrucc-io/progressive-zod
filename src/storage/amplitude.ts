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
 * Sends a single event per type check:
 *
 *   "pzod:type_checked"
 *     - type_name: string            — the boundary name passed to progressive()
 *     - result: "conform" | "violate"
 *     - sample_type: string          — JS typeof the observed value (violate only)
 *     - field_count: number          — number of top-level keys (violate only, objects)
 *     - sample_preview: string       — first 256 chars of JSON (violate only)
 *     - validation_errors: string    — human-readable Zod validation errors (violate only)
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

  addName(_name: string): void {
    // No-op: we only track type checks
  }

  addSample(_name: string, _sample: string): void {
    // No-op: we only track type checks
  }

  addViolation(_name: string, _violation: string): void {
    // No-op: violation data is included in the type_checked event via incrViolate
  }

  incrConform(name: string, _sample?: string): void {
    this.client.track(
      "pzod:type_checked",
      { type_name: name, result: "conform" },
      { device_id: this.deviceId },
    );
  }

  incrViolate(name: string, sample?: string, errors?: string): void {
    const properties: Record<string, unknown> = {
      type_name: name,
      result: "violate",
    };

    if (sample) {
      try {
        const parsed = JSON.parse(sample);
        properties.sample_type = typeof parsed;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          properties.field_count = Object.keys(parsed).length;
        }
        properties.sample_preview = sample.slice(0, 256);
      } catch {
        properties.sample_type = "unknown";
        properties.sample_preview = sample.slice(0, 256);
      }
    }

    if (errors) {
      properties.validation_errors = errors.slice(0, 1024);
    }

    this.client.track(
      "pzod:type_checked",
      properties,
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
