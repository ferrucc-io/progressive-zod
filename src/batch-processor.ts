import type { z } from "zod";
import type { StorageBackend } from "./types.js";
import { getStorage } from "./storage/resolve.js";

export interface BatchConfig {
  /** Max observations to buffer before forcing a flush. Default: 512 */
  maxQueueSize?: number;
  /** Flush interval in milliseconds. Default: 5000 */
  flushIntervalMs?: number;
  /** Max observations to export per flush. Default: 512 */
  maxExportBatchSize?: number;
}

interface Observation {
  name: string;
  serialized: string;
  schema?: z.ZodTypeAny;
}

const DEFAULT_MAX_QUEUE_SIZE = 2048;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_EXPORT_BATCH_SIZE = 512;

export class BatchProcessor {
  private queue: Observation[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private droppedCount = 0;

  private readonly maxQueueSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxExportBatchSize: number;

  constructor(config: BatchConfig = {}) {
    this.maxQueueSize = config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxExportBatchSize = config.maxExportBatchSize ?? DEFAULT_MAX_EXPORT_BATCH_SIZE;
  }

  /**
   * Enqueue an observation. This is synchronous and fast — no I/O happens here.
   * If the queue is full, the oldest observation is dropped (bounded memory).
   */
  enqueue(name: string, input: unknown, schema?: z.ZodTypeAny): void {
    this.ensureTimer();

    let serialized: string;
    try {
      serialized = JSON.stringify(input);
    } catch {
      // Non-serializable input — skip silently
      return;
    }

    if (this.queue.length >= this.maxQueueSize) {
      // Drop oldest to stay within bounds
      this.queue.shift();
      this.droppedCount++;
    }

    this.queue.push({ name, serialized, schema });

    // Flush immediately if we've hit the export batch size
    if (this.queue.length >= this.maxExportBatchSize) {
      this.flushAsync();
    }
  }

  /**
   * Force flush all pending observations. Call during graceful shutdown.
   */
  async forceFlush(): Promise<void> {
    this.clearTimer();
    await this.flush();
  }

  /**
   * Shut down the processor: flush remaining data and stop the timer.
   */
  async shutdown(): Promise<void> {
    await this.forceFlush();
  }

  /** Number of observations currently in the queue */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Number of observations dropped due to queue overflow */
  get dropped(): number {
    return this.droppedCount;
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flushAsync();
    }, this.flushIntervalMs);
    // Don't keep the process alive just for telemetry
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Non-blocking flush — errors are swallowed */
  private flushAsync(): void {
    this.flush().catch(() => {});
  }

  /** Drain the queue and send observations to storage in batch */
  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    // Drain up to maxExportBatchSize
    const batch = this.queue.splice(0, this.maxExportBatchSize);

    try {
      const storage = await getStorage();
      await this.exportBatch(storage, batch);
    } catch {
      // Swallow errors — observability must never crash the app
    } finally {
      this.flushing = false;
      // If items accumulated during flush, schedule another
      if (this.queue.length >= this.maxExportBatchSize) {
        this.flushAsync();
      }
    }
  }

  private async exportBatch(
    storage: StorageBackend,
    batch: Observation[],
  ): Promise<void> {
    // Collect unique names first
    const names = new Set<string>();
    for (const obs of batch) {
      names.add(obs.name);
    }

    // Register all names
    await Promise.all([...names].map((n) => storage.addName(n)));

    // Process each observation
    // We batch the promises to avoid creating thousands of concurrent promises
    const promises: Promise<void>[] = [];

    for (const obs of batch) {
      promises.push(this.exportOne(storage, obs));
    }

    await Promise.all(promises);
  }

  private async exportOne(
    storage: StorageBackend,
    obs: Observation,
  ): Promise<void> {
    await storage.addSample(obs.name, obs.serialized);

    if (obs.schema) {
      const result = obs.schema.safeParse(JSON.parse(obs.serialized));
      if (result.success) {
        await storage.incrConform(obs.name);
      } else {
        await storage.incrViolate(obs.name);
        await storage.addViolation(obs.name, obs.serialized);
      }
    } else {
      await storage.incrViolate(obs.name);
      await storage.addViolation(obs.name, obs.serialized);
    }
  }
}
