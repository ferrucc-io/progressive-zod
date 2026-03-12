import * as fs from "node:fs";
import * as path from "node:path";
import type { ProgressiveConfig } from "../types.js";
import { MemoryStorage } from "./memory.js";

/**
 * In-memory storage with optional file persistence.
 * Uses Node.js fs/path — server-only, not safe for browser bundles.
 */
export class PersistentMemoryStorage extends MemoryStorage {
  private dataDir: string | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: ProgressiveConfig = {}) {
    super(config);
    this.dataDir = config.dataDir;
    if (this.dataDir) {
      this.loadFromDisk();
    }
  }

  override addName(name: string): void {
    super.addName(name);
    this.schedulePersist();
  }

  override addSample(name: string, sample: string): void {
    super.addSample(name, sample);
    this.schedulePersist();
  }

  override addViolation(name: string, violation: string): void {
    super.addViolation(name, violation);
    this.schedulePersist();
  }

  override incrConform(name: string): void {
    super.incrConform(name);
    this.schedulePersist();
  }

  override incrViolate(name: string): void {
    super.incrViolate(name);
    this.schedulePersist();
  }

  override disconnect(): void {
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
          this.data.set(key, val as { samples: string[]; violations: string[]; conform: number; violate: number });
        }
      }
    } catch {
      // no data yet — that's fine
    }
  }
}
