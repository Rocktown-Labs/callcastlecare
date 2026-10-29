import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        channel: "chrome",
        defaultBrowserType: "chromium",
      },
    },
  ],
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:3018", trace: "retain-on-failure" },
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 3018",
    env: { VITE_SERVER_URL: "/api" },
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:3018",
  },
});
