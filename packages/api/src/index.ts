/* eslint-disable oxc/no-barrel-file -- Shared API contracts retain the established package entry point. */
import type { Hono } from "hono";
import { hc } from "hono/client";

export * from "./contracts";
export * from "./geofence";
export * from "./photo-checklist";
export * from "./pricing";
export * from "./scheduling";
export * from "./stripe-catalog";
export * from "./travel";
export * from "./window-washing";

export interface CreateApiClientOptions {
  headers?: Record<string, string>;
  customFetch?: typeof fetch;
}

// eslint-disable-next-line typescript/no-explicit-any -- Hono's hc type uses `Hono<any, any, any>` for custom env/schema clients.
export const createApiClient = <TApp extends Hono<any, any, any>>(
  baseURL: string,
  options?: CreateApiClientOptions
) =>
  hc<TApp>(baseURL, {
    fetch: options?.customFetch,
    headers: options?.headers,
    init: { credentials: "include" } as unknown as RequestInit,
  });
