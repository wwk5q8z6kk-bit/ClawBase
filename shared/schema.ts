import { sql } from "drizzle-orm";
import { pgTable, text, varchar, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const auditLog = pgTable("audit_log", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  deviceId: text("device_id").notNull(),
  action: text("action").notNull(),
  result: text("result").notNull(),
  details: text("details"),
});

export const insertAuditLogSchema = createInsertSchema(auditLog).pick({
  timestamp: true,
  deviceId: true,
  action: true,
  result: true,
  details: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLogEntry = typeof auditLog.$inferSelect;
