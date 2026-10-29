import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SERVER_URL": JSON.stringify("/api"),
  },
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    env: {
      VITE_SERVER_URL: "/api",
    },
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    testTimeout: 15_000,
  },
});
