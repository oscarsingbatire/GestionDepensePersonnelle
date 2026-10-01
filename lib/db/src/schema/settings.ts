import { pgTable, varchar } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("user_settings", {
  userId: varchar("user_id", { length: 255 }).primaryKey(),
  currency: varchar("currency", { length: 3 }).notNull().default("XAF"),
  theme: varchar("theme", { length: 8 }).notNull().default("system"),
});

export type Settings = typeof settingsTable.$inferSelect;