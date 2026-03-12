import type { ProgressiveConfig, StorageBackend } from "../types.js";
import { MemoryStorage } from "./memory.js";

let currentConfig: ProgressiveConfig = {};
let currentStorage: StorageBackend | null = null;

export function configure(config: ProgressiveConfig): void {
  currentConfig = { ...currentConfig, ...config };
  // Force re-creation on next access
  if (currentStorage) {
    currentStorage.disconnect();
    currentStorage = null;
  }
}

export function getConfig(): ProgressiveConfig {
  return {
    storage: currentConfig.storage ?? (process.env.PROGRESSIVE_ZOD_STORAGE as any) ?? "memory",
    redisUrl: currentConfig.redisUrl ?? process.env.PROGRESSIVE_ZOD_REDIS_URL,
    keyPrefix: currentConfig.keyPrefix ?? process.env.PROGRESSIVE_ZOD_KEY_PREFIX ?? "pzod:",
    maxViolations: currentConfig.maxViolations ?? parseInt(process.env.PROGRESSIVE_ZOD_MAX_VIOLATIONS ?? "1000", 10),
    maxSamples: currentConfig.maxSamples ?? parseInt(process.env.PROGRESSIVE_ZOD_MAX_SAMPLES ?? "1000", 10),
    dataDir: currentConfig.dataDir ?? process.env.PROGRESSIVE_ZOD_DATA_DIR ?? ".progressive-zod",
  };
}

export async function getStorage(): Promise<StorageBackend> {
  if (currentStorage) return currentStorage;

  const config = getConfig();

  if (config.storage === "amplitude") {
    if (!currentConfig.amplitudeClient) {
      throw new Error(
        "progressive-zod: storage is set to 'amplitude' but no amplitudeClient was provided. " +
        "Pass an Amplitude client instance via configure({ amplitudeClient }).",
      );
    }
    const { AmplitudeStorage } = await import("./amplitude.js");
    currentStorage = new AmplitudeStorage(currentConfig.amplitudeClient, config);
  } else if (config.storage === "redis") {
    // Dynamic import so ioredis isn't loaded unless needed
    const { RedisStorage } = await import("./redis.js");
    currentStorage = new RedisStorage(config);
  } else {
    currentStorage = new MemoryStorage(config);
  }

  return currentStorage;
}

export async function disconnectStorage(): Promise<void> {
  if (currentStorage) {
    await currentStorage.disconnect();
    currentStorage = null;
  }
}
