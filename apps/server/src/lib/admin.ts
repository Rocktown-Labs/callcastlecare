import { env } from "@callcastlecare/env/server";
import type { Context } from "hono";

import type { AppEnv } from "../types";

export interface AdminCandidate {
  email: string;
  role?: string | null;
}

export const isAdminUser = (user: AdminCandidate | null | undefined): boolean =>
  Boolean(
    user &&
    (user.role === "admin" ||
      user.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase())
  );

export const requireAdmin = (c: Context<AppEnv>) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  if (!isAdminUser(user)) {
    return c.json({ error: "forbidden" }, 403);
  }

  return null;
};
