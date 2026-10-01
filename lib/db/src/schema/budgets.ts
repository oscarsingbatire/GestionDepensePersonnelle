import { sql } from "drizzle-orm";
import { index, integer, numeric, pgTable, serial, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories";

export const budgetsTable = pgTable(
  "spending_budgets",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    period: varchar("period", { length: 12 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    categoryId: integer("category_id").references(() => categoriesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("spending_budgets_user_idx").on(table.userId),
    uniqueIndex("spending_budgets_user_period_category_unique").on(
      table.userId,
      table.period,
      sql`coalesce(${table.categoryId}, 0)`,
    ),
  ],
);

export type Budget = typeof budgetsTable.$inferSelect;