import type { z } from "zod";
import type { ProgressiveSchema } from "./types.js";
import { getStorage } from "./storage/index.js";

/**
 * Create a progressive schema that tracks runtime data and optionally validates.
 *
 * - Never throws — always returns input unchanged
 * - Records samples for later schema inference
 * - If a schema is provided, tracks conformance vs violations
 * - All storage operations are fire-and-forget
 */
export function progressive(
  name: string,
  schema?: z.ZodTypeAny,
): ProgressiveSchema {
  return {
    parse(input: unknown): unknown {
      // Fire-and-forget tracking
      track(name, input, schema).catch(() => {});
      return input;
    },
  };
}

async function track(
  name: string,
  input: unknown,
  schema?: z.ZodTypeAny,
): Promise<void> {
  const storage = await getStorage();
  const serialized = JSON.stringify(input);

  await storage.addName(name);
  await storage.addSample(name, serialized);

  if (schema) {
    const result = schema.safeParse(input);
    if (result.success) {
      await storage.incrConform(name);
    } else {
      await storage.incrViolate(name);
      await storage.addViolation(name, serialized);
    }
  } else {
    // No schema yet — everything is a violation (that's the point)
    await storage.incrViolate(name);
    await storage.addViolation(name, serialized);
  }
}
