import { _setStorageFactory } from "./resolve.js";
import { MemoryStorage } from "./memory.js";

// Register client storage factory — no Redis (avoids bundling ioredis)
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
    throw new Error(
      'progressive-zod: Redis storage is not available in the client bundle. ' +
      'Import from "progressive-zod" instead of "progressive-zod/client".',
    );
  }

  return new MemoryStorage(config);
});

export { configure, getConfig, getStorage, disconnectStorage } from "./resolve.js";
