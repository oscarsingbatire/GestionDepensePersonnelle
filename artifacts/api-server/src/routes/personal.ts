import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import {
  CreateBudgetResponse,
  CreateBudgetBody,
  CreateCategoryResponse,
  CreateCategoryBody,
  CreateExpenseResponse,
  CreateExpenseBody,
  DeleteBudgetParams,
  DeleteCategoryParams,
  DeleteExpenseParams,
  GetSettingsResponse,
  ListBudgetsResponse,
  ListCategoriesResponse,
  ListExpensesResponse,
  ListExpensesQueryParams,
  UpdateBudgetResponse,
  UpdateBudgetBody,
  UpdateBudgetParams,
  UpdateCategoryResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateExpenseResponse,
  UpdateExpenseBody,
  UpdateExpenseParams,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import {
  budgetsTable,
  categoriesTable,
  db,
  expensesTable,
  settingsTable,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const defaultCategories = [
  ["Alimentation", "#D99A36"],
  ["Transport", "#5486D8"],
  ["Logement", "#9272CF"],
  ["Téléphone/Internet", "#42A6A0"],
  ["Eau/Électricité", "#46A9CC"],
  ["Études", "#6583C1"],
  ["Shopping", "#D16D87"],
  ["Divertissement", "#A46BC7"],
  ["Santé", "#4C9D75"],
  ["Vêtements", "#C37B51"],
  ["Travail", "#63717F"],
  ["Famille", "#D27865"],
  ["Autres", "#808994"],
] as const;

function userIdOf(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

function calendarDate(value: string | Date): Date {
  const source =
    value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  return new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()),
  );
}

function categoryResult(row: typeof categoriesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isDefault: row.isDefault,
  };
}

async function findExpense(userId: string, id: number) {
  const [row] = await db
    .select({
      id: expensesTable.id,
      amount: expensesTable.amount,
      occurredAt: expensesTable.occurredAt,
      categoryId: expensesTable.categoryId,
      categoryName: categoriesTable.name,
      description: expensesTable.description,
      paymentMethod: expensesTable.paymentMethod,
      note: expensesTable.note,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .innerJoin(
      categoriesTable,
      and(
        eq(categoriesTable.id, expensesTable.categoryId),
        eq(categoriesTable.userId, userId),
      ),
    )
    .where(and(eq(expensesTable.id, id), eq(expensesTable.userId, userId)))
    .limit(1);
  if (!row) return undefined;
  return {
    ...row,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function categoryBelongsToUser(userId: string, categoryId: number) {
  const [category] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.id, categoryId),
        eq(categoriesTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(category);
}

router.get("/expenses", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const parsed = ListExpensesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data;
  const conditions = [eq(expensesTable.userId, userId)];
  if (query.from) {
    conditions.push(gte(expensesTable.occurredAt, calendarDate(query.from)));
  }
  if (query.to) {
    const inclusiveEnd = calendarDate(query.to);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
    conditions.push(
      lte(expensesTable.occurredAt, new Date(inclusiveEnd.getTime() - 1)),
    );
  }
  if (query.categoryId !== undefined) {
    conditions.push(eq(expensesTable.categoryId, query.categoryId));
  }
  if (query.minAmount !== undefined) {
    conditions.push(gte(expensesTable.amount, query.minAmount));
  }
  if (query.maxAmount !== undefined) {
    conditions.push(lte(expensesTable.amount, query.maxAmount));
  }

  let base = db
    .select({
      id: expensesTable.id,
      amount: expensesTable.amount,
      occurredAt: expensesTable.occurredAt,
      categoryId: expensesTable.categoryId,
      categoryName: categoriesTable.name,
      description: expensesTable.description,
      paymentMethod: expensesTable.paymentMethod,
      note: expensesTable.note,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .innerJoin(
      categoriesTable,
      and(
        eq(categoriesTable.id, expensesTable.categoryId),
        eq(categoriesTable.userId, userId),
      ),
    );

  const rows = query.search
    ? await base
        .where(
          and(
            ...conditions,
            or(
              ilike(expensesTable.description, `%${query.search}%`),
              ilike(expensesTable.note, `%${query.search}%`),
              ilike(categoriesTable.name, `%${query.search}%`),
            ),
          ),
        )
        .orderBy(desc(expensesTable.occurredAt))
    : await base.where(and(...conditions)).orderBy(desc(expensesTable.occurredAt));
  res.json(
    ListExpensesResponse.parse(rows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }))),
  );
});

router.post("/expenses", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await categoryBelongsToUser(userId, parsed.data.categoryId))) {
    res.status(400).json({ error: "Select a category from your account" });
    return;
  }
  const [created] = await db
    .insert(expensesTable)
    .values({
      userId,
      ...parsed.data,
      occurredAt: new Date(parsed.data.occurredAt),
    })
    .returning({ id: expensesTable.id });
  const expense = await findExpense(userId, created.id);
  res.status(201).json(CreateExpenseResponse.parse(expense));
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const params = UpdateExpenseParams.safeParse(req.params);
  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await categoryBelongsToUser(userId, parsed.data.categoryId))) {
    res.status(400).json({ error: "Select a category from your account" });
    return;
  }
  const [updated] = await db
    .update(expensesTable)
    .set({ ...parsed.data, occurredAt: new Date(parsed.data.occurredAt) })
    .where(
      and(
        eq(expensesTable.id, params.data.id),
        eq(expensesTable.userId, userId),
      ),
    )
    .returning({ id: expensesTable.id });
  if (!updated) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.json(UpdateExpenseResponse.parse(await findExpense(userId, updated.id)));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(expensesTable)
    .where(
      and(
        eq(expensesTable.id, params.data.id),
        eq(expensesTable.userId, userId),
      ),
    )
    .returning({ id: expensesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/categories", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  await db
    .insert(categoriesTable)
    .values(
      defaultCategories.map(([name, color]) => ({
        userId,
        name,
        color,
        isDefault: true,
      })),
    )
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId))
    .orderBy(categoriesTable.id);
  res.json(ListCategoriesResponse.parse(rows.map(categoryResult)));
});

router.post("/categories", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.userId, userId),
        eq(categoriesTable.name, parsed.data.name),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A category with this name already exists" });
    return;
  }
  const [row] = await db
    .insert(categoriesTable)
    .values({ userId, ...parsed.data })
    .returning();
  res.status(201).json(CreateCategoryResponse.parse(categoryResult(row)));
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const params = UpdateCategoryParams.safeParse(req.params);
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [duplicate] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.userId, userId),
        eq(categoriesTable.name, parsed.data.name),
        sql`${categoriesTable.id} <> ${params.data.id}`,
      ),
    )
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "A category with this name already exists" });
    return;
  }
  const [row] = await db
    .update(categoriesTable)
    .set(parsed.data)
    .where(
      and(
        eq(categoriesTable.id, params.data.id),
        eq(categoriesTable.userId, userId),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(UpdateCategoryResponse.parse(categoryResult(row)));
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [used] = await db
    .select({ id: expensesTable.id })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.categoryId, params.data.id),
        eq(expensesTable.userId, userId),
      ),
    )
    .limit(1);
  if (used) {
    res.status(409).json({
      error: "Move or delete this category's expenses before removing it",
    });
    return;
  }
  const [usedByBudget] = await db
    .select({ id: budgetsTable.id })
    .from(budgetsTable)
    .where(
      and(
        eq(budgetsTable.categoryId, params.data.id),
        eq(budgetsTable.userId, userId),
      ),
    )
    .limit(1);
  if (usedByBudget) {
    res.status(409).json({
      error: "Remove this category from its budget before deleting it",
    });
    return;
  }
  const [row] = await db
    .delete(categoriesTable)
    .where(
      and(
        eq(categoriesTable.id, params.data.id),
        eq(categoriesTable.userId, userId),
      ),
    )
    .returning({ id: categoriesTable.id });
  if (!row) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.sendStatus(204);
});

function budgetResult(
  row: typeof budgetsTable.$inferSelect,
  categoryName: string | null,
) {
  return {
    id: row.id,
    period: row.period,
    amount: row.amount,
    categoryId: row.categoryId,
    categoryName,
  };
}

router.get("/budgets", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const rows = await db
    .select({
      budget: budgetsTable,
      categoryName: categoriesTable.name,
    })
    .from(budgetsTable)
    .leftJoin(
      categoriesTable,
      and(
        eq(categoriesTable.id, budgetsTable.categoryId),
        eq(categoriesTable.userId, userId),
      ),
    )
    .where(eq(budgetsTable.userId, userId))
    .orderBy(budgetsTable.period, budgetsTable.id);
  res.json(
    ListBudgetsResponse.parse(
      rows.map((row) => budgetResult(row.budget, row.categoryName)),
    ),
  );
});

async function saveBudget(
  userId: string,
  input: { period: "daily" | "weekly" | "monthly" | "yearly"; amount: number; categoryId?: number | null },
  id?: number,
) {
  const categoryId = input.categoryId ?? null;
  if (categoryId !== null && !(await categoryBelongsToUser(userId, categoryId))) {
    return { error: "Select a category from your account" } as const;
  }
  if (id !== undefined) {
    const [row] = await db
      .update(budgetsTable)
      .set({ ...input, categoryId })
      .where(and(eq(budgetsTable.id, id), eq(budgetsTable.userId, userId)))
      .returning();
    if (!row) return { missing: true } as const;
    let categoryName: string | null = null;
    if (row.categoryId !== null) {
      const [category] = await db
        .select({ name: categoriesTable.name })
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.id, row.categoryId),
            eq(categoriesTable.userId, userId),
          ),
        )
        .limit(1);
      categoryName = category?.name ?? null;
    }
    return { row: budgetResult(row, categoryName) } as const;
  }
  const [duplicate] = await db
    .select({ id: budgetsTable.id })
    .from(budgetsTable)
    .where(
      and(
        eq(budgetsTable.userId, userId),
        eq(budgetsTable.period, input.period),
        categoryId === null
          ? sql`${budgetsTable.categoryId} is null`
          : eq(budgetsTable.categoryId, categoryId),
      ),
    )
    .limit(1);
  if (duplicate) return { conflict: true } as const;
  const [row] = await db
    .insert(budgetsTable)
    .values({ userId, ...input, categoryId })
    .returning();
  let categoryName: string | null = null;
  if (row.categoryId !== null) {
    const [category] = await db
      .select({ name: categoriesTable.name })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, row.categoryId),
          eq(categoriesTable.userId, userId),
        ),
      )
      .limit(1);
    categoryName = category?.name ?? null;
  }
  return { row: budgetResult(row, categoryName) } as const;
}

router.post("/budgets", async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await saveBudget(userIdOf(req), parsed.data);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  if ("conflict" in result) {
    res.status(409).json({ error: "This budget already exists" });
    return;
  }
  res.status(201).json(CreateBudgetResponse.parse(result.row));
});

router.patch("/budgets/:id", async (req, res): Promise<void> => {
  const params = UpdateBudgetParams.safeParse(req.params);
  const parsed = UpdateBudgetBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await saveBudget(userIdOf(req), parsed.data, params.data.id);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  if ("missing" in result) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(UpdateBudgetResponse.parse(result.row));
});

router.delete("/budgets/:id", async (req, res): Promise<void> => {
  const params = DeleteBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(budgetsTable)
    .where(
      and(
        eq(budgetsTable.id, params.data.id),
        eq(budgetsTable.userId, userIdOf(req)),
      ),
    )
    .returning({ id: budgetsTable.id });
  if (!row) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/settings", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, userIdOf(req)))
    .limit(1);
  res.json(GetSettingsResponse.parse(row ?? { currency: "XAF", theme: "system" }));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = userIdOf(req);
  const [existing] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId))
    .limit(1);
  const values = {
    currency: (parsed.data.currency ?? existing?.currency ?? "XAF").toUpperCase(),
    theme: parsed.data.theme ?? existing?.theme ?? "system",
  };
  const [row] = await db
    .insert(settingsTable)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: settingsTable.userId,
      set: values,
    })
    .returning({ currency: settingsTable.currency, theme: settingsTable.theme });
  res.json(UpdateSettingsResponse.parse(row));
});

export default router;