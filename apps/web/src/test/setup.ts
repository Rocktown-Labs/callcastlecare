import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.stubEnv("VITE_SERVER_URL", "/api");
import.meta.env.VITE_SERVER_URL = "/api";

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: createMemoryStorage(),
});
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: createMemoryStorage(),
});

Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "quote-request-test-id",
  },
});

afterEach(() => {
  cleanup();
  window.localStorage?.clear?.();
  vi.restoreAllMocks();
});
