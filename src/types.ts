import type { z } from "zod";

export interface ProgressiveConfig {
  /** "memory" (default) for localhost, "redis" for production */
  storage?: "memory" | "redis";
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
}

export interface ProgressiveSchema {
  parse(input: unknown): unknown;
}

export interface StorageBackend {
  addName(name: string): void | Promise<void>;
  addSample(name: string, sample: string): void | Promise<void>;
  addViolation(name: string, violation: string): void | Promise<void>;
  incrConform(name: string): void | Promise<void>;
  incrViolate(name: string): void | Promise<void>;
  getNames(): string[] | Promise<string[]>;
  getSamples(name: string): string[] | Promise<string[]>;
  getViolations(name: string, limit: number): string[] | Promise<string[]>;
  getStats(name: string): Promise<{ conform: number; violate: number }>;
  disconnect(): void | Promise<void>;
}
