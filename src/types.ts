import type { z } from "zod";
import type { AmplitudeClient } from "./storage/amplitude.js";

export interface ProgressiveConfig {
  /** "memory" (default) for localhost, "redis" for production, "amplitude" for analytics */
  storage?: "memory" | "redis" | "amplitude";
  /** Redis connection URL (only used when storage is "redis") */
  redisUrl?: string;
  /** Prefix for all storage keys */
  keyPrefix?: string;
  /** Max violation samples to retain per type */
  maxViolations?: number;
  /** Max data samples to retain per type */
  maxSamples?: number;
  /** Path for file-based persistence in memory mode */
  dataDir?: string;
  /**
   * Amplitude client instance (only used when storage is "amplitude").
   * Initialize with a separate API key for your observability project,
   * not your main product analytics project.
   *
   * @example
   * ```ts
   * import * as amplitude from "@amplitude/analytics-node";
   *
   * const pzodAmplitude = amplitude.createInstance();
   * pzodAmplitude.init("YOUR_OBSERVABILITY_PROJECT_API_KEY");
   *
   * configure({
   *   storage: "amplitude",
   *   amplitudeClient: pzodAmplitude,
   * });
   * ```
   */
  amplitudeClient?: AmplitudeClient;
  /** Custom event name for the Amplitude adapter (default: "progressive-zod: results") */
  amplitudeEventName?: string;
}

export type ProgressiveOpts = Record<string, string>;

export interface ProgressiveSchema {
  parse(input: unknown): unknown;
}

export interface StorageBackend {
  addName(name: string): void | Promise<void>;
  addSample(name: string, sample: string): void | Promise<void>;
  addViolation(name: string, violation: string): void | Promise<void>;
  incrConform(name: string, sample?: string, opts?: ProgressiveOpts): void | Promise<void>;
  incrViolate(name: string, sample?: string, errors?: string, opts?: ProgressiveOpts): void | Promise<void>;
  getNames(): string[] | Promise<string[]>;
  getSamples(name: string): string[] | Promise<string[]>;
  getViolations(name: string, limit: number): string[] | Promise<string[]>;
  getStats(name: string): Promise<{ conform: number; violate: number }>;
  disconnect(): void | Promise<void>;
}
