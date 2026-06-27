import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { buildShoppingList, DEFAULT_PREFERENCES } from "@cooking/core";
import type { Week, WeekSelection } from "@cooking/core";
import * as db from "./db.js";

const app = new Hono();
const lambda = new LambdaClient({});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns the ISO date string (YYYY-MM-DD) for the upcoming Monday. */
function upcomingMondayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const daysUntil = day === 1 ? 7 : (8 - day) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntil);
  return monday.toISOString().split("T")[0] as string;
}

// ── Preferences ────────────────────────────────────────────────────────────

app.get("/preferences", async (c) => {
  const prefs = await db.getPreferences();
  return c.json(prefs ?? DEFAULT_PREFERENCES);
});

app.put("/preferences", async (c) => {
  const body = await c.req.json();
  await db.savePreferences(body);
  return c.json(body);
});

// ── Current week ──────────────────────────────────────────────────────────

app.get("/weeks/current", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ week: null, candidates: [] });

  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ week: null, candidates: [] });

  const candidates = await db.getCandidateRecipes(week.candidateRecipeIds);
  return c.json({ week, candidates });
});

app.post("/weeks/current/generate", async (c) => {
  const weekStart = upcomingMondayISO();
  const now = new Date().toISOString();
  const prefs = await db.getPreferences();
  const existing = await db.getWeek(weekStart);

  const week = {
    id: weekStart,
    weekStart,
    status: "pending" as const,
    daysPerWeek: prefs?.defaultDaysPerWeek ?? DEFAULT_PREFERENCES.defaultDaysPerWeek,
    candidateRecipeIds: existing?.candidateRecipeIds ?? [],
    selections: existing?.selections ?? [],
    cookedRecipeIds: existing?.cookedRecipeIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.saveWeek(week);
  await db.setCurrentWeekStart(weekStart);

  // Invoke the generate job Lambda asynchronously (fire-and-forget)
  const generateArn = process.env["GENERATE_LAMBDA_ARN"];
  if (generateArn) {
    await lambda.send(
      new InvokeCommand({
        FunctionName: generateArn,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ weekStart })),
      })
    );
  }

  return c.json({ week }, 202);
});

app.post("/weeks/current/select", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ error: "no current week" }, 404);

  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);

  const body = await c.req.json<{ selections: WeekSelection[]; daysPerWeek?: number }>();
  const updated = {
    ...week,
    selections: body.selections,
    daysPerWeek: body.daysPerWeek ?? week.daysPerWeek,
    status: "shopping" as const,
    updatedAt: new Date().toISOString(),
  };

  await db.saveWeek(updated);
  return c.json({ week: updated });
});

app.post("/weeks/current/skip", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ error: "no current week" }, 404);

  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);

  const updated = {
    ...week,
    status: "skipped" as const,
    updatedAt: new Date().toISOString(),
  };
  await db.saveWeek(updated);
  return c.json({ week: updated });
});

app.get("/weeks/current/shopping-list", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ error: "no current week" }, 404);

  const week = await db.getWeek(weekStart);
  if (!week || week.selections.length === 0) {
    return c.json({ error: "no selections yet" }, 404);
  }

  const prefs = await db.getPreferences();
  const peopleCount = prefs?.peopleCount ?? DEFAULT_PREFERENCES.peopleCount;
  const selectedIds = week.selections.map((s) => s.recipeId);
  const recipes = await db.getCandidateRecipes(selectedIds);

  return c.json(buildShoppingList(weekStart, recipes, peopleCount));
});

// ── Recipes ────────────────────────────────────────────────────────────────

app.get("/recipes/:id", async (c) => {
  const recipe = await db.getRecipe(c.req.param("id"));
  if (!recipe) return c.json({ error: "not found" }, 404);
  return c.json(recipe);
});

app.post("/recipes/:id/cooked", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ error: "no current week" }, 404);

  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);

  const recipeId = c.req.param("id");
  if (week.cookedRecipeIds.includes(recipeId)) return c.json({ week });

  const cookedRecipeIds = [...week.cookedRecipeIds, recipeId];
  const selectedIds = new Set(week.selections.map((s) => s.recipeId));
  const allCooked = cookedRecipeIds.filter((id) => selectedIds.has(id)).length >= selectedIds.size;

  const updated = {
    ...week,
    cookedRecipeIds,
    status: (allCooked ? "done" : "cooking") as Week["status"],
    updatedAt: new Date().toISOString(),
  };
  await db.saveWeek(updated);
  return c.json({ week: updated });
});

app.post("/recipes/:id/rating", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ error: "no current week" }, 404);

  const recipeId = c.req.param("id");
  const body = await c.req.json<{ stars: 1 | 2 | 3 | 4 | 5; notes?: string; makeAgain: boolean }>();

  const rating = {
    id: `${recipeId}#${weekStart}`,
    recipeId,
    weekId: weekStart,
    stars: body.stars,
    makeAgain: body.makeAgain,
    createdAt: new Date().toISOString(),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };

  await db.saveRating(rating);
  return c.json({ rating }, 201);
});

export const handler = handle(app);
