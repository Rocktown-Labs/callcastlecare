import { createDb, eq } from "@callcastlecare/db";
import { account } from "@callcastlecare/db/schema/index";
import { verifyPassword } from "better-auth/crypto";

const LEGACY_PROVIDER_PASSWORD = "TempPassword123!";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const db = createDb(databaseUrl);
const credentials = await db.query.account.findMany({
  where: eq(account.providerId, "credential"),
});

const results = await Promise.all(
  credentials.map(async (credential) => {
    if (!credential.password) {
      return false;
    }

    const isLegacyPassword = await verifyPassword({
      hash: credential.password,
      password: LEGACY_PROVIDER_PASSWORD,
    }).catch(() => false);

    if (!isLegacyPassword) {
      return false;
    }

    await db
      .update(account)
      .set({ password: null, updatedAt: new Date() })
      .where(eq(account.id, credential.id));
    console.log(`Reset legacy provider password for account ${credential.id}`);
    return true;
  })
);

console.log(
  `Reset ${results.filter(Boolean).length} legacy provider password(s).`
);
process.exit(0);
