import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let pool: pg.Pool | null = null;

export function getDb() {
  if (db) return db;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  try {
    pool = new pg.Pool({ connectionString: url });
    db = drizzle(pool, { schema });
    return db;
  } catch {
    console.log("[DB] Failed to connect to database, audit will use in-memory only");
    return null;
  }
}

export async function pushAuditToDb(entry: {
  timestamp: number;
  deviceId: string;
  action: string;
  result: "success" | "error";
  details?: string;
}) {
  const database = getDb();
  if (!database) return;

  try {
    await database.insert(schema.auditLog).values({
      timestamp: entry.timestamp,
      deviceId: entry.deviceId,
      action: entry.action,
      result: entry.result,
      details: entry.details || null,
    });
  } catch (err) {
    console.log("[DB] Failed to persist audit entry:", err);
  }
}
