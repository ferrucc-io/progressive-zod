import type { ProgressiveConfig, StorageBackend } from "../types.js";
import { MemoryStorage } from "./memory.js";

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
  currentStorage = await storageFactory(config, currentConfig);
  return currentStorage;
}

export async function disconnectStorage(): Promise<void> {
  if (currentStorage) {
    await currentStorage.disconnect();
    currentStorage = null;
  }
}
