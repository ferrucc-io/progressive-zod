import type { z } from "zod";
import type { ProgressiveSchema } from "./types.js";
import { BatchProcessor } from "./batch-processor.js";
import type { BatchConfig } from "./batch-processor.js";

let processor: BatchProcessor | null = null;

function getProcessor(): BatchProcessor {
  if (!processor) {
    processor = new BatchProcessor();
  }
  return processor;
}

/**
 * Configure the batch processor. Call before first `progressive()` use.
 * Follows the OpenTelemetry provider pattern:
 * - Observations are buffered in memory (synchronous, zero I/O on hot path)
 * - Flushed to storage in batches on a timer or when buffer is full
 * - Queue is bounded to prevent memory leaks
 * - Timer is unref'd so it won't keep the process alive
 */
export function configureBatch(config: BatchConfig): void {
  if (processor) {
    // Flush existing before reconfiguring
    processor.forceFlush().catch(() => {});
  }
  processor = new BatchProcessor(config);
}

/**
 * Force flush all pending observations. Call during graceful shutdown.
 *
 * @example
 * ```ts
 * process.on("SIGTERM", async () => {
 *   await forceFlush();
 *   process.exit(0);
 * });
 * ```
 */
export async function forceFlush(): Promise<void> {
  if (processor) {
    await processor.forceFlush();
  }
}

/**
 * Shut down the batch processor and flush remaining data.
 */
export async function shutdown(): Promise<void> {
  if (processor) {
    await processor.shutdown();
    processor = null;
  }
}

/**
 * Create a progressive schema that tracks runtime data and optionally validates.
 *
 * - Never throws — always returns input unchanged
 * - Records samples for later schema inference
 * - If a schema is provided, tracks conformance vs violations
 * - Observations are batched and flushed asynchronously (OTel-style)
 * - Zero I/O on the hot path — enqueue is synchronous
 */
export function progressive(
  name: string,
  schema?: z.ZodTypeAny,
): ProgressiveSchema {
  return {
    parse(input: unknown): unknown {
      // Synchronous enqueue — no I/O, no promises, no overhead
      getProcessor().enqueue(name, input, schema);
      return input;
    },
  };
}
