import type { StorageBackend, ProgressiveConfig } from "../types.js";

interface TypeData {
  samples: string[];
  violations: string[];
  conform: number;
  violate: number;
}

/**
 * In-memory storage backend.
 * No Node.js built-in dependencies — safe for browser bundles.
 */
export class MemoryStorage implements StorageBackend {
  protected names = new Set<string>();
  protected data = new Map<string, TypeData>();
  protected maxSamples: number;
  protected maxViolations: number;

  constructor(config: ProgressiveConfig = {}) {
    this.maxSamples = config.maxSamples ?? 1000;
    this.maxViolations = config.maxViolations ?? 1000;
  }

  protected getOrCreate(name: string): TypeData {
    let entry = this.data.get(name);
    if (!entry) {
      entry = { samples: [], violations: [], conform: 0, violate: 0 };
      this.data.set(name, entry);
    }
    return entry;
  }

  addName(name: string): void {
    this.names.add(name);
  }

  addSample(name: string, sample: string): void {
    const entry = this.getOrCreate(name);
    entry.samples.unshift(sample);
    if (entry.samples.length > this.maxSamples) {
      entry.samples.length = this.maxSamples;
    }
  }

  addViolation(name: string, violation: string): void {
    const entry = this.getOrCreate(name);
    entry.violations.unshift(violation);
    if (entry.violations.length > this.maxViolations) {
      entry.violations.length = this.maxViolations;
    }
  }

  incrConform(name: string): void {
    this.getOrCreate(name).conform++;
  }

  incrViolate(name: string): void {
    this.getOrCreate(name).violate++;
  }

  getNames(): string[] {
    return [...this.names].sort();
  }

  getSamples(name: string): string[] {
    return this.getOrCreate(name).samples;
  }

  getViolations(name: string, limit: number): string[] {
    return this.getOrCreate(name).violations.slice(0, limit);
  }

  async getStats(name: string): Promise<{ conform: number; violate: number }> {
    const entry = this.getOrCreate(name);
    return { conform: entry.conform, violate: entry.violate };
  }

  disconnect(): void {
    // No-op for pure in-memory storage
  }
}
