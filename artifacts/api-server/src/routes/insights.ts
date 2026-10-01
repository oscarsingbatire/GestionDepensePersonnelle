import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, gte, isNull, lt } from "drizzle-orm";
import {
  GetAnalyticsQueryParams,
  GetAnalyticsResponse,
  GetDashboardResponse,
} from "@workspace/api-zod";
import {
  budgetsTable,
  categoriesTable,
  db,
  expensesTable,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const weekdayNames = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

function userIdOf(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

function utcStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayPeriod(date: Date) {
  const start = utcStart(date);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function periodBounds(
  period: "day" | "week" | "month" | "year" | "custom",
  now: Date,
  from?: string | Date,
  to?: string | Date,
) {
  if (period === "custom") {
    if (!from || !to) return undefined;
    const start = utcStart(
      from instanceof Date ? from : new Date(`${from}T00:00:00.000Z`),
    );
    const end = utcStart(to instanceof Date ? to : new Date(`${to}T00:00:00.000Z`));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return undefined;
    }
    end.setUTCDate(end.getUTCDate() + 1);
    const duration = end.getTime() - start.getTime();
    return {
      start,
      end,
      previousStart: new Date(start.getTime() - duration),
      previousEnd: start,
    };
  }

  const today = utcStart(now);
  let start: Date;
  let end: Date;
  if (period === "day") {
    start = today;
    end = new Date(start.getTime() + DAY_MS);
  } else if (period === "week") {
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    start = new Date(today.getTime() - daysSinceMonday * DAY_MS);
    end = new Date(start.getTime() + 7 * DAY_MS);
  } else if (period === "month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  } else {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    end = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));
  }
  const duration = end.getTime() - start.getTime();
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - duration),
    previousEnd: start,
  };
}

async function expenseRows(userId: string, start: Date, end: Date) {
  return db
    .select({
      id: expensesTable.id,
      amount: expensesTable.amount,
      occurredAt: expensesTable.occurredAt,
      categoryId: expensesTable.categoryId,
      categoryName: categoriesTable.name,
      description: expensesTable.description,
      paymentMethod: expensesTable.paymentMethod,
    })
    .from(expensesTable)
    .innerJoin(
      categoriesTable,
      and(
        eq(categoriesTable.id, expensesTable.categoryId),
        eq(categoriesTable.userId, userId),
      ),
    )
    .where(
      and(
        eq(expensesTable.userId, userId),
        gte(expensesTable.occurredAt, start),
        lt(expensesTable.occurredAt, end),
      ),
    )
    .orderBy(asc(expensesTable.occurredAt));
}

function sumAmounts(rows: { amount: number }[]) {
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = userIdOf(req);
  const now = new Date();
  const todayPeriod = dayPeriod(now);
  const weekStart = new Date(todayPeriod.start);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [yearRows, recentRows, monthBudgetRows] = await Promise.all([
    expenseRows(userId, yearStart, new Date(now.getTime() + 1)),
    db
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
      .where(eq(expensesTable.userId, userId))
      .orderBy(desc(expensesTable.occurredAt))
      .limit(6),
    db
      .select({ amount: budgetsTable.amount })
      .from(budgetsTable)
      .where(
        and(
          eq(budgetsTable.userId, userId),
          eq(budgetsTable.period, "monthly"),
          isNull(budgetsTable.categoryId),
        ),
      )
      .limit(1),
  ]);

  const todayRows = yearRows.filter((row) => row.occurredAt >= todayPeriod.start);
  const weekRows = yearRows.filter((row) => row.occurredAt >= weekStart);
  const monthRows = yearRows.filter((row) => row.occurredAt >= monthStart);
  const totalYear = sumAmounts(yearRows);
  const totalToday = sumAmounts(todayRows);
  const totalWeek = sumAmounts(weekRows);
  const totalMonth = sumAmounts(monthRows);
  const categoryTotals = new Map<number, { name: string; amount: number }>();
  for (const row of monthRows) {
    const previous = categoryTotals.get(row.categoryId);
    categoryTotals.set(row.categoryId, {
      name: row.categoryName,
      amount: (previous?.amount ?? 0) + Number(row.amount),
    });
  }
  const sortedCategories = Array.from(categoryTotals, ([categoryId, category]) => ({
    categoryId,
    ...category,
  })).sort((a, b) => b.amount - a.amount);
  const budgetTotal = monthBudgetRows[0]?.amount ?? null;
  res.json(GetDashboardResponse.parse({
    today: totalToday,
    week: totalWeek,
    month: totalMonth,
    year: totalYear,
    expenseCount: monthRows.length,
    averageAmount: monthRows.length > 0 ? totalMonth / monthRows.length : 0,
    budgetRemaining: budgetTotal === null ? null : budgetTotal - totalMonth,
    budgetTotal,
    budgetSpent: totalMonth,
    topCategory: sortedCategories[0]
      ? {
          ...sortedCategories[0],
          share: totalMonth
            ? (sortedCategories[0].amount / totalMonth) * 100
            : 0,
        }
      : null,
    recentExpenses: recentRows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  }));
});

router.get("/analytics", async (req, res): Promise<void> => {
  const params = GetAnalyticsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { period, from, to } = params.data;
  const bounds = periodBounds(period, new Date(), from, to);
  if (!bounds) {
    res.status(400).json({
      error: "Choose a valid custom date range with both a start and an end",
    });
    return;
  }
  const userId = userIdOf(req);
  const [rows, previousRows] = await Promise.all([
    expenseRows(userId, bounds.start, bounds.end),
    expenseRows(userId, bounds.previousStart, bounds.previousEnd),
  ]);
  const total = sumAmounts(rows);
  const previousTotal = sumAmounts(previousRows);
  const groupedCategories = new Map<
    number,
    { name: string; amount: number }
  >();
  const groupedDays = new Map<string, number>();
  const groupedWeekdays = new Map<number, number>();
  const previousCategories = new Map<number, number>();
  const repeatedExpenses = new Map<
    string,
    { description: string; categoryName: string; count: number; total: number }
  >();
  for (const row of rows) {
    const amount = Number(row.amount);
    const category = groupedCategories.get(row.categoryId);
    groupedCategories.set(row.categoryId, {
      name: row.categoryName,
      amount: (category?.amount ?? 0) + amount,
    });
    const key = dateKey(row.occurredAt);
    groupedDays.set(key, (groupedDays.get(key) ?? 0) + amount);
    const weekday = row.occurredAt.getUTCDay();
    groupedWeekdays.set(weekday, (groupedWeekdays.get(weekday) ?? 0) + amount);
    const normalizedDescription = row.description.trim().toLocaleLowerCase("fr");
    if (normalizedDescription) {
      const repeatedKey = `${row.categoryId}:${normalizedDescription}`;
      const repeated = repeatedExpenses.get(repeatedKey);
      repeatedExpenses.set(repeatedKey, {
        description: row.description,
        categoryName: row.categoryName,
        count: (repeated?.count ?? 0) + 1,
        total: (repeated?.total ?? 0) + amount,
      });
    }
  }
  for (const row of previousRows) {
    previousCategories.set(
      row.categoryId,
      (previousCategories.get(row.categoryId) ?? 0) + Number(row.amount),
    );
  }

  const categories = Array.from(groupedCategories, ([categoryId, category]) => ({
    categoryId,
    name: category.name,
    amount: category.amount,
    share: total ? (category.amount / total) * 100 : 0,
  })).sort((a, b) => b.amount - a.amount);
  const timeline: { date: string; label: string; amount: number }[] = [];
  const daysInPeriod = Math.max(
    1,
    Math.ceil((bounds.end.getTime() - bounds.start.getTime()) / DAY_MS),
  );
  if (period === "year") {
    for (
      let month = new Date(Date.UTC(bounds.start.getUTCFullYear(), 0, 1));
      month < bounds.end;
      month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))
    ) {
      const monthEnd = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
      );
      const amount = rows
        .filter((row) => row.occurredAt >= month && row.occurredAt < monthEnd)
        .reduce((sum, row) => sum + Number(row.amount), 0);
      timeline.push({
        date: dateKey(month),
        label: new Intl.DateTimeFormat("fr-FR", {
          month: "short",
          timeZone: "UTC",
        }).format(month),
        amount,
      });
    }
  } else {
    const maxDays = Math.min(daysInPeriod, 1096);
    for (let index = 0; index < maxDays; index += 1) {
      const day = new Date(bounds.start.getTime() + index * DAY_MS);
      const key = dateKey(day);
      timeline.push({
        date: key,
        label: new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: daysInPeriod > 90 ? "short" : undefined,
          timeZone: "UTC",
        }).format(day),
        amount: groupedDays.get(key) ?? 0,
      });
    }
  }
  const weekdays = weekdayOrder.map((weekday) => ({
    day: weekdayNames[weekday],
    amount: groupedWeekdays.get(weekday) ?? 0,
  }));
  const mostExpensiveDay = Array.from(groupedDays, ([date, amount]) => ({
    date,
    label: new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00.000Z`)),
    amount,
  })).sort((a, b) => b.amount - a.amount)[0] ?? null;
  const largest = rows.reduce<(typeof rows)[number] | null>(
    (best, row) => (!best || row.amount > best.amount ? row : best),
    null,
  );
  const comparison =
    previousTotal > 0
      ? ((total - previousTotal) / previousTotal) * 100
      : null;
  const insights: string[] = [];
  if (total > 0) {
    if (categories[0] && categories[0].share >= 25) {
      insights.push(
        `${categories[0].name} représente ${Math.round(categories[0].share)} % de vos dépenses sur cette période.`,
      );
    }
    if (mostExpensiveDay) {
      insights.push(
        `Votre journée la plus coûteuse est ${mostExpensiveDay.label}.`,
      );
    }
    if (comparison !== null) {
      const direction = comparison > 0 ? "augmenté" : "diminué";
      insights.push(
        `Vos dépenses ont ${direction} de ${Math.abs(Math.round(comparison))} % par rapport à la période précédente.`,
      );
    }
    const fastestGrowing = categories
      .map((category) => {
        const oldAmount = previousCategories.get(category.categoryId) ?? 0;
        return {
          name: category.name,
          change: oldAmount > 0 ? ((category.amount - oldAmount) / oldAmount) * 100 : null,
          appeared: oldAmount === 0,
        };
      })
      .filter((category) => category.appeared || (category.change ?? 0) > 0)
      .sort((a, b) => (b.change ?? Infinity) - (a.change ?? Infinity))[0];
    if (fastestGrowing) {
      insights.push(
        fastestGrowing.appeared
          ? `${fastestGrowing.name} apparaît dans vos dépenses de cette période.`
          : `${fastestGrowing.name} est la catégorie qui a le plus augmenté (${Math.round(fastestGrowing.change ?? 0)} %).`,
      );
    }
    const average = total / Math.max(daysInPeriod, 1);
    const unusual = rows
      .filter((row) => row.amount >= average * 3 && row.amount > 0)
      .sort((a, b) => b.amount - a.amount)[0];
    if (unusual && rows.length >= 4) {
      insights.push(
        `La dépense « ${unusual.description} » est nettement supérieure à votre moyenne quotidienne.`,
      );
    }
    const repeated = Array.from(repeatedExpenses.values())
      .filter((entry) => entry.count >= 3)
      .sort((a, b) => b.total - a.total)[0];
    if (repeated) {
      insights.push(
        `« ${repeated.description} » revient ${repeated.count} fois dans ${repeated.categoryName} sur cette période.`,
      );
    }
  }
  res.json(GetAnalyticsResponse.parse({
    period,
    total,
    previousTotal,
    changePercent: comparison,
    dailyAverage: total / Math.max(daysInPeriod, 1),
    topCategory: categories[0] ?? null,
    largestExpense: largest
      ? {
          amount: largest.amount,
          description: largest.description,
          occurredAt: largest.occurredAt.toISOString(),
          categoryName: largest.categoryName,
        }
      : null,
    mostExpensiveDay,
    categories,
    timeline,
    weekdays,
    insights,
    expenseCount: rows.length,
  }));
});

export default router;