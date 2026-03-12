import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  webServer: {
    command: "npm run dev",
    port: 3456,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3456",
  },
});
