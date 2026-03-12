import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BatchProcessor } from "../batch-processor.js";
import { configure } from "../storage/index.js";

describe("BatchProcessor", () => {
  beforeEach(() => {
    configure({ storage: "memory", dataDir: undefined });
  });

  it("enqueue is synchronous and returns immediately", () => {
    const processor = new BatchProcessor({
      flushIntervalMs: 60_000,
      maxExportBatchSize: 2000, // prevent auto-flush during test
    });
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      processor.enqueue("perf-test", { index: i });
    }
    const elapsed = performance.now() - start;

    expect(processor.pendingCount).toBe(1000);
    // 1000 enqueues should complete in well under 50ms (no I/O)
    expect(elapsed).toBeLessThan(50);
    processor.shutdown();
  });

  it("flushes pending observations on forceFlush", async () => {
    const processor = new BatchProcessor({ flushIntervalMs: 60_000 });
    processor.enqueue("test", { a: 1 });
    processor.enqueue("test", { a: 2 });

    expect(processor.pendingCount).toBe(2);
    await processor.forceFlush();
    expect(processor.pendingCount).toBe(0);
  });

  it("drops oldest observations when queue is full", () => {
    const processor = new BatchProcessor({
      maxQueueSize: 3,
      flushIntervalMs: 60_000,
      maxExportBatchSize: 100, // prevent auto-flush
    });

    processor.enqueue("test", { i: 1 });
    processor.enqueue("test", { i: 2 });
    processor.enqueue("test", { i: 3 });
    processor.enqueue("test", { i: 4 }); // drops {i:1}

    expect(processor.pendingCount).toBe(3);
    expect(processor.dropped).toBe(1);
    processor.shutdown();
  });

  it("auto-flushes when maxExportBatchSize is reached", async () => {
    const processor = new BatchProcessor({
      maxExportBatchSize: 2,
      flushIntervalMs: 60_000,
    });

    processor.enqueue("test", { a: 1 });
    processor.enqueue("test", { a: 2 }); // triggers auto-flush

    // Give the async flush a tick to complete
    await new Promise((r) => setTimeout(r, 50));
    expect(processor.pendingCount).toBe(0);
    await processor.shutdown();
  });

  it("silently skips non-serializable inputs", () => {
    const processor = new BatchProcessor({ flushIntervalMs: 60_000 });
    const circular: any = {};
    circular.self = circular;

    processor.enqueue("test", circular);
    expect(processor.pendingCount).toBe(0); // dropped, not queued
    processor.shutdown();
  });

  it("shutdown stops the timer and flushes", async () => {
    const processor = new BatchProcessor({ flushIntervalMs: 100 });
    processor.enqueue("test", { a: 1 });

    await processor.shutdown();
    expect(processor.pendingCount).toBe(0);
  });
});
