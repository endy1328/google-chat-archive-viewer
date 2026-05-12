import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.js/,
  use: {
    baseURL: "http://127.0.0.1:4193",
    headless: true,
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 4193",
    url: "http://127.0.0.1:4193",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
