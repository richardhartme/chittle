import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reuse one connection pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

const client = globalForDb.pgClient ?? postgres(env.databaseUrl);
if (!env.isProduction) globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
