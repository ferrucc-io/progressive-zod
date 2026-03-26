import { z } from "zod";
import type { ProgressiveConfig, StorageBackend } from "../types.js";
import { MemoryStorage } from "./memory.js";

/**
 * Global singleton state for progressive-zod.
 *
 * Bundlers (Vite, webpack, etc.) can create duplicate module instances when
 * a package is symlinked, installed at multiple versions, or resolved through
 * different paths in a monorepo. When that happens, module-level `let` vars
 * diverge: `configure()` writes to one copy, `getStorage()` reads from another.
 *
 * Storing shared state on `globalThis` under a unique symbol key guarantees
 * all copies of the module share the same config, storage, and factory —
 * the same pattern used by OpenTelemetry's API package.
 */
const GLOBAL_KEY = Symbol.for("progressive-zod");

export type StorageFactory = (
  resolvedConfig: ProgressiveConfig,
  userConfig: ProgressiveConfig,
) => Promise<StorageBackend>;

interface GlobalState {
  config: ProgressiveConfig;
  storage: StorageBackend | null;
  factory: StorageFactory;
}

function getGlobal(): GlobalState {
  const g = globalThis as Record<symbol, GlobalState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      config: {},
      storage: null,
      factory: async (config) => new MemoryStorage(config),
    };
  }
  return g[GLOBAL_KEY];
}

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

/**
 * Register a storage factory. Called by entry-point modules
 * (storage/index.ts for server, storage/client.ts for client)
 * to control which backends are available.
 */
export function _setStorageFactory(factory: StorageFactory): void {
  getGlobal().factory = factory;
}

export function configure(config: ProgressiveConfig): void {
  const state = getGlobal();
  const merged = { ...state.config, ...config };
  progressiveConfigSchema.parse(merged);
  state.config = merged;
  // Force re-creation on next access
  if (state.storage) {
    state.storage.disconnect();
    state.storage = null;
  }
}

function env(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

export function getConfig(): ProgressiveConfig {
  const { config } = getGlobal();
  return {
    storage: config.storage ?? (env("PROGRESSIVE_ZOD_STORAGE") as any) ?? "memory",
    redisUrl: config.redisUrl ?? env("PROGRESSIVE_ZOD_REDIS_URL"),
    keyPrefix: config.keyPrefix ?? env("PROGRESSIVE_ZOD_KEY_PREFIX") ?? "pzod:",
    maxViolations: config.maxViolations ?? parseInt(env("PROGRESSIVE_ZOD_MAX_VIOLATIONS") ?? "1000", 10),
    maxSamples: config.maxSamples ?? parseInt(env("PROGRESSIVE_ZOD_MAX_SAMPLES") ?? "1000", 10),
    dataDir: config.dataDir ?? env("PROGRESSIVE_ZOD_DATA_DIR"),
  };
}

export async function getStorage(): Promise<StorageBackend> {
  const state = getGlobal();
  if (state.storage) return state.storage;

  const config = getConfig();
  state.storage = await state.factory(config, state.config);
  return state.storage;
}

export async function disconnectStorage(): Promise<void> {
  const state = getGlobal();
  if (state.storage) {
    await state.storage.disconnect();
    state.storage = null;
  }
}
