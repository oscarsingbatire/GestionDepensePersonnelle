import { boolean, index, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const categoriesTable = pgTable(
  "expense_categories",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    color: varchar("color", { length: 7 }).notNull().default("#32B67A"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("expense_categories_user_idx").on(table.userId),
    uniqueIndex("expense_categories_user_name_unique").on(table.userId, table.name),
  ],
);

export type Category = typeof categoriesTable.$inferSelect;