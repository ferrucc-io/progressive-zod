import * as fs from "node:fs";
import * as path from "node:path";
import type { StorageBackend, ProgressiveConfig } from "../types.js";

interface TypeData {
  samples: string[];
  violations: string[];
  conform: number;
  violate: number;
}

/**
 * In-memory storage backend with optional file persistence.
 * Perfect for localhost development — no Redis required.
 */
export class MemoryStorage implements StorageBackend {
  private names = new Set<string>();
  private data = new Map<string, TypeData>();
  private maxSamples: number;
  private maxViolations: number;
  private dataDir: string | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: ProgressiveConfig = {}) {
    this.maxSamples = config.maxSamples ?? 1000;
    this.maxViolations = config.maxViolations ?? 1000;
    this.dataDir = config.dataDir;
    if (this.dataDir) {
      this.loadFromDisk();
    }
  }

  private getOrCreate(name: string): TypeData {
    let entry = this.data.get(name);
    if (!entry) {
      entry = { samples: [], violations: [], conform: 0, violate: 0 };
      this.data.set(name, entry);
    }
    return entry;
  }

  addName(name: string): void {
    this.names.add(name);
    this.schedulePersist();
  }

  addSample(name: string, sample: string): void {
    const entry = this.getOrCreate(name);
    entry.samples.unshift(sample);
    if (entry.samples.length > this.maxSamples) {
      entry.samples.length = this.maxSamples;
    }
    this.schedulePersist();
  }

  addViolation(name: string, violation: string): void {
    const entry = this.getOrCreate(name);
    entry.violations.unshift(violation);
    if (entry.violations.length > this.maxViolations) {
      entry.violations.length = this.maxViolations;
    }
    this.schedulePersist();
  }

  incrConform(name: string): void {
    this.getOrCreate(name).conform++;
    this.schedulePersist();
  }

  incrViolate(name: string): void {
    this.getOrCreate(name).violate++;
    this.schedulePersist();
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
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.dataDir) {
      this.persistToDisk();
    }
  }

  private schedulePersist(): void {
    if (!this.dataDir || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.persistToDisk();
    }, 500);
  }

  private persistToDisk(): void {
    if (!this.dataDir) return;
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const snapshot = {
        names: [...this.names],
        types: Object.fromEntries(this.data),
      };
      fs.writeFileSync(
        path.join(this.dataDir, "data.json"),
        JSON.stringify(snapshot, null, 2),
      );
    } catch {
      // fire-and-forget — never crash the app
    }
  }

  private loadFromDisk(): void {
    if (!this.dataDir) return;
    try {
      const raw = fs.readFileSync(
        path.join(this.dataDir, "data.json"),
        "utf-8",
      );
      const snapshot = JSON.parse(raw);
      if (Array.isArray(snapshot.names)) {
        for (const n of snapshot.names) this.names.add(n);
      }
      if (snapshot.types && typeof snapshot.types === "object") {
        for (const [key, val] of Object.entries(snapshot.types)) {
          this.data.set(key, val as TypeData);
        }
      }
    } catch {
      // no data yet — that's fine
    }
  }
}
