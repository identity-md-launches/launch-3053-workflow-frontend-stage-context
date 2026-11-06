import { defineConfig } from "@playwright/test";

const PORT = 4319;

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/ipfs/squeekboard/`,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "node tests/serve.mjs",
    url: `http://127.0.0.1:${PORT}/ipfs/squeekboard/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
