import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

interface SessionPayload {
  session?: {
    expiresAt?: Date | string;
    id?: string;
    userId?: string;
  } | null;
  user?: unknown;
}

/**
 * Return the signed-in user without the session token. The token belongs in
 * the HttpOnly cookie and must not be serialized to the browser.
 */
export const getUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => {
    const payload = context.session as SessionPayload | null;

    return {
      session: payload?.session
        ? {
            expiresAt: payload.session.expiresAt ?? null,
            id: payload.session.id ?? null,
            userId: payload.session.userId ?? null,
          }
        : null,
      user: payload?.user ?? null,
    };
  });
