import { _setStorageFactory } from "./resolve.js";
import { PersistentMemoryStorage } from "./memory-server.js";

// Register server storage factory — supports all backends including Redis
_setStorageFactory(async (config, userConfig) => {
  if (config.storage === "amplitude") {
    if (!userConfig.amplitudeClient) {
      throw new Error(
        "progressive-zod: storage is set to 'amplitude' but no amplitudeClient was provided. " +
        "Pass an Amplitude client instance via configure({ amplitudeClient }).",
      );
    }
    const { AmplitudeStorage } = await import("./amplitude.js");
    return new AmplitudeStorage(userConfig.amplitudeClient, config);
  } else if (config.storage === "redis") {
    // Dynamic import so ioredis isn't loaded unless needed
    const { RedisStorage } = await import("./redis.js");
    return new RedisStorage(config);
  }

  // Default to file persistence in server environment
  const serverConfig = { ...config, dataDir: config.dataDir ?? ".progressive-zod" };
  return new PersistentMemoryStorage(serverConfig);
});

export { configure, getConfig, getStorage, disconnectStorage } from "./resolve.js";
