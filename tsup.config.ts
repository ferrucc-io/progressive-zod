import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/client.ts"],
    format: ["cjs", "esm"],
    dts: true,
    outDir: "dist",
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ["zod", "ioredis"],
  },
  {
    entry: ["src/cli/index.ts"],
    format: ["esm"],
    outDir: "dist/cli",
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
    external: ["zod", "ioredis", "commander"],
  },
]);
