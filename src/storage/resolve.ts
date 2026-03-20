import { z } from "zod";
import type { ProgressiveConfig, StorageBackend } from "../types.js";
import { MemoryStorage } from "./memory.js";

const progressiveConfigSchema = z
  .object({
    storage: z.enum(["memory", "redis", "amplitude"]).optional(),
    redisUrl: z.string().optional(),
    keyPrefix: z.string().optional(),
    maxViolations: z.number().optional(),
    maxSamples: z.number().optional(),
    dataDir: z.string().optional(),
    amplitudeClient: z.any().optional(),
    amplitudeEventName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amplitudeEventName && data.storage !== "amplitude") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'amplitudeEventName can only be used when storage is "amplitude"',
        path: ["amplitudeEventName"],
      });
    }
    if (data.amplitudeClient && data.storage !== "amplitude") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'amplitudeClient can only be used when storage is "amplitude"',
        path: ["amplitudeClient"],
      });
    }
  });

let currentConfig: ProgressiveConfig = {};
let currentStorage: StorageBackend | null = null;

export type StorageFactory = (
  resolvedConfig: ProgressiveConfig,
  userConfig: ProgressiveConfig,
) => Promise<StorageBackend>;

// Default factory: memory-only (safe for any environment)
let storageFactory: StorageFactory = async (config) => new MemoryStorage(config);

/**
 * Register a storage factory. Called by entry-point modules
 * (storage/index.ts for server, storage/client.ts for client)
 * to control which backends are available.
 */
export function _setStorageFactory(factory: StorageFactory): void {
  storageFactory = factory;
}

export function configure(config: ProgressiveConfig): void {
  const merged = { ...currentConfig, ...config };
  progressiveConfigSchema.parse(merged);
  currentConfig = merged;
  // Force re-creation on next access
  if (currentStorage) {
    currentStorage.disconnect();
    currentStorage = null;
  }
}

function env(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

export function getConfig(): ProgressiveConfig {
  return {
    storage: currentConfig.storage ?? (env("PROGRESSIVE_ZOD_STORAGE") as any) ?? "memory",
    redisUrl: currentConfig.redisUrl ?? env("PROGRESSIVE_ZOD_REDIS_URL"),
    keyPrefix: currentConfig.keyPrefix ?? env("PROGRESSIVE_ZOD_KEY_PREFIX") ?? "pzod:",
    maxViolations: currentConfig.maxViolations ?? parseInt(env("PROGRESSIVE_ZOD_MAX_VIOLATIONS") ?? "1000", 10),
    maxSamples: currentConfig.maxSamples ?? parseInt(env("PROGRESSIVE_ZOD_MAX_SAMPLES") ?? "1000", 10),
    dataDir: currentConfig.dataDir ?? env("PROGRESSIVE_ZOD_DATA_DIR"),
  };
}

export async function getStorage(): Promise<StorageBackend> {
  if (currentStorage) return currentStorage;

  const config = getConfig();
  currentStorage = await storageFactory(config, currentConfig);
  return currentStorage;
}

export async function disconnectStorage(): Promise<void> {
  if (currentStorage) {
    await currentStorage.disconnect();
    currentStorage = null;
  }
}
