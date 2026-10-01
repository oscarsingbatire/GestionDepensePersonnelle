import { doublePrecision, index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories";

export const expensesTable = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    amount: doublePrecision("amount").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    categoryId: integer("category_id").notNull().references(() => categoriesTable.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    paymentMethod: varchar("payment_method", { length: 24 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("expenses_user_occurred_idx").on(table.userId, table.occurredAt),
    index("expenses_user_category_idx").on(table.userId, table.categoryId),
  ],
);

export type Expense = typeof expensesTable.$inferSelect;