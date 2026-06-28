import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { buildShoppingList, DEFAULT_PREFERENCES } from "@cooking/core";
import type { Week, WeekSelection } from "@cooking/core";
import * as db from "./db.js";

const app = new Hono();
app.use("*", cors());
const lambda = new LambdaClient({});

// ── Helpers ────────────────────────────────────────────────────────────────

function upcomingMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = day === 1 ? 7 : (8 - day) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntil);
  return monday.toISOString().split("T")[0] as string;
}

async function generateWeek(weekStart: string, daysPerWeek?: number): Promise<Week> {
  const now = new Date().toISOString();
  const prefs = await db.getPreferences();
  const existing = await db.getWeek(weekStart);

  const week: Week = {
    id: weekStart,
    weekStart,
    status: "pending",
    daysPerWeek: daysPerWeek ?? existing?.daysPerWeek ?? prefs?.defaultDaysPerWeek ?? DEFAULT_PREFERENCES.defaultDaysPerWeek,
    candidateRecipeIds: existing?.candidateRecipeIds ?? [],
    selections: existing?.selections ?? [],
    cookedRecipeIds: existing?.cookedRecipeIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.saveWeek(week);
  await db.setCurrentWeekStart(weekStart);

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
  return week;
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

// ── All weeks ─────────────────────────────────────────────────────────────
// Must be registered before /weeks/current and /weeks/:weekStart

app.get("/weeks", async (c) => {
  const allWeeks = await db.getAllWeeks();
  const weeks = await Promise.all(
    allWeeks.map(async (week) => {
      const selectedIds = week.selections.map((s) => s.recipeId);
      const selectedRecipes = selectedIds.length > 0
        ? await db.getCandidateRecipes(selectedIds)
        : [];
      return { week, selectedRecipes };
    })
  );
  return c.json({ weeks });
});

// ── Current week (legacy / convenience) ──────────────────────────────────

app.get("/weeks/current", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ week: null, candidates: [] });
  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ week: null, candidates: [] });
  const candidates = await db.getCandidateRecipes(week.candidateRecipeIds);
  return c.json({ week, candidates });
});

app.post("/weeks/current/generate", async (c) => {
  const body = await c.req.json<{ daysPerWeek?: number }>().catch(() => ({}));
  const week = await generateWeek(upcomingMondayISO(), body.daysPerWeek);
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
  const updated = { ...week, status: "skipped" as const, updatedAt: new Date().toISOString() };
  await db.saveWeek(updated);
  return c.json({ week: updated });
});

app.get("/weeks/current/shopping-list", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ error: "no current week" }, 404);
  const week = await db.getWeek(weekStart);
  if (!week || week.selections.length === 0) return c.json({ error: "no selections yet" }, 404);
  const prefs = await db.getPreferences();
  const peopleCount = prefs?.peopleCount ?? DEFAULT_PREFERENCES.peopleCount;
  const recipes = await db.getCandidateRecipes(week.selections.map((s) => s.recipeId));
  return c.json(buildShoppingList(weekStart, recipes, peopleCount));
});

// ── Week by start date ────────────────────────────────────────────────────
// These parameterized routes must come after all /weeks/current/* routes.

app.get("/weeks/:weekStart", async (c) => {
  const weekStart = c.req.param("weekStart");
  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ week: null, candidates: [] });
  const candidates = await db.getCandidateRecipes(week.candidateRecipeIds);
  return c.json({ week, candidates });
});

app.post("/weeks/:weekStart/generate", async (c) => {
  const body = await c.req.json<{ daysPerWeek?: number }>().catch(() => ({}));
  const week = await generateWeek(c.req.param("weekStart"), body.daysPerWeek);
  return c.json({ week }, 202);
});

app.post("/weeks/:weekStart/select", async (c) => {
  const weekStart = c.req.param("weekStart");
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

app.post("/weeks/:weekStart/skip", async (c) => {
  const weekStart = c.req.param("weekStart");
  const now = new Date().toISOString();
  const existing = await db.getWeek(weekStart);
  const prefs = await db.getPreferences();
  const base = existing ?? {
    id: weekStart, weekStart, status: "pending" as const,
    daysPerWeek: prefs?.defaultDaysPerWeek ?? DEFAULT_PREFERENCES.defaultDaysPerWeek,
    candidateRecipeIds: [], selections: [], cookedRecipeIds: [],
    createdAt: now, updatedAt: now,
  };
  const updated = { ...base, status: "skipped" as const, updatedAt: now };
  await db.saveWeek(updated);
  return c.json({ week: updated });
});

app.get("/weeks/:weekStart/shopping-list", async (c) => {
  const weekStart = c.req.param("weekStart");
  const week = await db.getWeek(weekStart);
  if (!week || week.selections.length === 0) return c.json({ error: "no selections yet" }, 404);
  const prefs = await db.getPreferences();
  const peopleCount = prefs?.peopleCount ?? DEFAULT_PREFERENCES.peopleCount;
  const recipes = await db.getCandidateRecipes(week.selections.map((s) => s.recipeId));
  return c.json(buildShoppingList(weekStart, recipes, peopleCount));
});

// ── Recipes ────────────────────────────────────────────────────────────────

app.get("/recipes/:id", async (c) => {
  const recipe = await db.getRecipe(c.req.param("id"));
  if (!recipe) return c.json({ error: "not found" }, 404);
  return c.json(recipe);
});

app.post("/recipes/:id/cooked", async (c) => {
  const recipeId = c.req.param("id");
  const body = await c.req.json<{ weekStart?: string }>().catch(() => ({}) as { weekStart?: string });
  const weekStart = body.weekStart ?? (await db.getCurrentWeekStart());
  if (!weekStart) return c.json({ error: "no current week" }, 404);

  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);

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
  const recipeId = c.req.param("id");
  const body = await c.req.json<{
    stars: 1 | 2 | 3 | 4 | 5;
    notes?: string;
    makeAgain: boolean;
    weekStart?: string;
  }>();
  const weekStart = body.weekStart ?? (await db.getCurrentWeekStart());
  if (!weekStart) return c.json({ error: "no current week" }, 404);

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
