import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { buildShoppingList, DEFAULT_PREFERENCES } from "@cooking/core";
import type { Week, WeekSelection, MealCounts, HouseholdPreferences } from "@cooking/core";
import * as db from "./db.js";

function validatePreferences(body: unknown): { ok: true; value: HouseholdPreferences } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be an object" };
  }
  const b = body as Record<string, unknown>;

  const posNum = (v: unknown, name: string, max?: number): string | null => {
    if (typeof v !== "number" || !isFinite(v) || v < 0) return `${name} must be a non-negative number`;
    if (max !== undefined && v > max) return `${name} must be ≤ ${max}`;
    return null;
  };
  const posNumGt0 = (v: unknown, name: string): string | null => {
    const e = posNum(v, name);
    if (e) return e;
    if ((v as number) < 1) return `${name} must be ≥ 1`;
    return null;
  };
  const strArr = (v: unknown, name: string): string | null => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return `${name} must be an array of strings`;
    return null;
  };

  const errors: string[] = [];
  const push = (e: string | null) => { if (e) errors.push(e); };

  push(posNumGt0(b["peopleCount"], "peopleCount"));
  push(posNum(b["defaultDaysPerWeek"], "defaultDaysPerWeek", 7));
  push(strArr(b["dislikes"], "dislikes"));
  push(strArr(b["cuisinePreferences"], "cuisinePreferences"));

  const cc = b["costCaps"];
  if (typeof cc !== "object" || cc === null || Array.isArray(cc)) {
    errors.push("costCaps must be an object");
  } else {
    const c = cc as Record<string, unknown>;
    push(posNum(c["breakfast"], "costCaps.breakfast"));
    push(posNum(c["lunch"], "costCaps.lunch"));
    push(posNum(c["dinner"], "costCaps.dinner"));
  }

  const nu = b["nutrition"];
  if (typeof nu !== "object" || nu === null || Array.isArray(nu)) {
    errors.push("nutrition must be an object");
  } else {
    const n = nu as Record<string, unknown>;
    push(posNum(n["maxCaloriesPerMeal"], "nutrition.maxCaloriesPerMeal"));
    push(posNum(n["maxSodiumMgPerMeal"], "nutrition.maxSodiumMgPerMeal"));
  }

  const pt = b["prepTimeRange"];
  if (typeof pt !== "object" || pt === null || Array.isArray(pt)) {
    errors.push("prepTimeRange must be an object");
  } else {
    const p = pt as Record<string, unknown>;
    push(posNum(p["minMinutes"], "prepTimeRange.minMinutes"));
    push(posNum(p["maxMinutes"], "prepTimeRange.maxMinutes"));
    if (errors.length === 0 && typeof p["minMinutes"] === "number" && typeof p["maxMinutes"] === "number" && p["minMinutes"] > p["maxMinutes"]) {
      errors.push("prepTimeRange.minMinutes must be ≤ maxMinutes");
    }
  }

  const validAdventure = ["adventurous", "balanced", "comfort"];
  if (!validAdventure.includes(b["adventureLevel"] as string)) {
    errors.push(`adventureLevel must be one of: ${validAdventure.join(", ")}`);
  }

  push(posNum(b["reminderDayOfWeek"], "reminderDayOfWeek", 6));
  if (typeof b["notificationEmail"] !== "string") errors.push("notificationEmail must be a string");
  if (b["tasteProfile"] !== undefined && typeof b["tasteProfile"] !== "string") errors.push("tasteProfile must be a string");

  if (errors.length > 0) return { ok: false, error: errors.join("; ") };

  const cc2 = b["costCaps"] as Record<string, unknown>;
  const nu2 = b["nutrition"] as Record<string, unknown>;
  const pt2 = b["prepTimeRange"] as Record<string, unknown>;

  const value: HouseholdPreferences = {
    peopleCount: b["peopleCount"] as number,
    defaultDaysPerWeek: b["defaultDaysPerWeek"] as number,
    dislikes: b["dislikes"] as string[],
    cuisinePreferences: b["cuisinePreferences"] as string[],
    costCaps: { breakfast: cc2["breakfast"] as number, lunch: cc2["lunch"] as number, dinner: cc2["dinner"] as number },
    nutrition: { maxCaloriesPerMeal: nu2["maxCaloriesPerMeal"] as number, maxSodiumMgPerMeal: nu2["maxSodiumMgPerMeal"] as number },
    prepTimeRange: { minMinutes: pt2["minMinutes"] as number, maxMinutes: pt2["maxMinutes"] as number },
    adventureLevel: b["adventureLevel"] as HouseholdPreferences["adventureLevel"],
    reminderDayOfWeek: b["reminderDayOfWeek"] as number,
    notificationEmail: b["notificationEmail"] as string,
    ...(b["tasteProfile"] !== undefined && { tasteProfile: b["tasteProfile"] as string }),
  };

  return { ok: true, value };
}

const app = new Hono();
app.use("*", cors());
const lambda = new LambdaClient({});

// ── Helpers ────────────────────────────────────────────────────────────────

function getUserEmail(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const part = authHeader.split(" ")[1]?.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString();
    return (JSON.parse(json) as Record<string, unknown>)["email"] as string ?? null;
  } catch {
    return null;
  }
}

function upcomingMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = day === 1 ? 7 : (8 - day) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntil);
  return monday.toISOString().split("T")[0] as string;
}

async function generateWeek(weekStart: string, mealCounts?: MealCounts): Promise<Week> {
  const now = new Date().toISOString();
  const prefs = await db.getPreferences();
  const existing = await db.getWeek(weekStart);
  const defaultDays = prefs?.defaultDaysPerWeek ?? DEFAULT_PREFERENCES.defaultDaysPerWeek;
  const resolvedMealCounts = mealCounts ?? existing?.mealCounts ?? { breakfast: defaultDays, lunch: defaultDays, dinner: defaultDays };

  const week: Week = {
    id: weekStart,
    weekStart,
    status: "pending",
    daysPerWeek: resolvedMealCounts.breakfast + resolvedMealCounts.lunch + resolvedMealCounts.dinner,
    mealCounts: resolvedMealCounts,
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
        Payload: Buffer.from(JSON.stringify({ weekStart, mealCounts: resolvedMealCounts })),
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
  const body: unknown = await c.req.json();
  const result = validatePreferences(body);
  if (!result.ok) return c.json({ error: result.error }, 400);
  await db.savePreferences(result.value);
  return c.json(result.value);
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
  const body = await c.req.json<{ mealCounts?: MealCounts }>().catch(() => ({} as { mealCounts?: MealCounts }));
  const week = await generateWeek(upcomingMondayISO(), body.mealCounts);
  return c.json({ week }, 202);
});

app.post("/weeks/current/select", async (c) => {
  const weekStart = await db.getCurrentWeekStart();
  if (!weekStart) return c.json({ error: "no current week" }, 404);
  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);
  const userEmail = getUserEmail(c.req.header("Authorization"));
  const body = await c.req.json<{ selections: WeekSelection[]; daysPerWeek?: number }>();
  const confirmedBy = [...new Set([...(week.confirmedBy ?? []), ...(userEmail ? [userEmail] : [])])];
  const updated = {
    ...week,
    selections: body.selections,
    daysPerWeek: body.daysPerWeek ?? week.daysPerWeek,
    status: "shopping" as const,
    confirmedBy,
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
  return c.json(buildShoppingList(weekStart, recipes, peopleCount, week.selections));
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
  const body = await c.req.json<{ mealCounts?: MealCounts }>().catch(() => ({} as { mealCounts?: MealCounts }));
  const week = await generateWeek(c.req.param("weekStart"), body.mealCounts);
  return c.json({ week }, 202);
});

app.post("/weeks/:weekStart/select", async (c) => {
  const weekStart = c.req.param("weekStart");
  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);
  const userEmail = getUserEmail(c.req.header("Authorization"));
  const body = await c.req.json<{ selections: WeekSelection[]; daysPerWeek?: number }>();
  const activeSelections = body.selections.filter((s) => (s.quantity ?? 1) > 0);
  if (activeSelections.length === 0) {
    return c.json({ error: "at least one meal must be selected" }, 400);
  }
  const confirmedBy = [...new Set([...(week.confirmedBy ?? []), ...(userEmail ? [userEmail] : [])])];
  const updated = {
    ...week,
    selections: activeSelections,
    daysPerWeek: body.daysPerWeek ?? week.daysPerWeek,
    status: "shopping" as const,
    confirmedBy,
    updatedAt: new Date().toISOString(),
  };
  await db.saveWeek(updated);
  return c.json({ week: updated });
});

app.post("/weeks/:weekStart/vote", async (c) => {
  const weekStart = c.req.param("weekStart");
  const userEmail = getUserEmail(c.req.header("Authorization"));
  if (!userEmail) return c.json({ error: "cannot identify user" }, 401);
  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);
  const body = await c.req.json<{ recipeId: string; vote: "up" | "down" | null }>();

  // Update in-week votes (existing behaviour)
  const votes = { ...(week.votes ?? {}) };
  const userVotes = { ...(votes[userEmail] ?? {}) };
  if (body.vote === null) {
    delete userVotes[body.recipeId];
  } else {
    userVotes[body.recipeId] = body.vote;
  }
  if (Object.keys(userVotes).length === 0) {
    delete votes[userEmail];
  } else {
    votes[userEmail] = userVotes;
  }
  const updated = { ...week, votes, updatedAt: new Date().toISOString() };
  await db.saveWeek(updated);

  // Persist thumbs-down so future generation avoids the recipe title.
  // Fire-and-forget after the week is saved — a failure here shouldn't
  // block the UI response.
  persistDownvote(body.recipeId, userEmail, weekStart, body.vote).catch((err) =>
    console.error(JSON.stringify({ action: "persistDownvote", error: String(err) }))
  );

  return c.json({ week: updated });
});

async function persistDownvote(
  recipeId: string,
  userEmail: string,
  weekStart: string,
  vote: "up" | "down" | null
): Promise<void> {
  const recipe = await db.getRecipe(recipeId);
  if (!recipe) return;

  const normalized = db.normalizeTitle(recipe.title);
  const existing = await db.getRecipeDownvote(normalized) ?? {
    title: normalized,
    displayTitle: recipe.title,
    downvotes: [],
    updatedAt: new Date().toISOString(),
  };

  const now = new Date().toISOString();
  let downvotes = existing.downvotes.filter(
    (d) => !(d.userEmail === userEmail && d.weekStart === weekStart)
  );
  if (vote === "down") {
    downvotes = [...downvotes, { userEmail, weekStart, timestamp: now }];
  }

  await db.saveRecipeDownvote({ ...existing, downvotes, updatedAt: now });
}

app.post("/weeks/:weekStart/revert", async (c) => {
  const weekStart = c.req.param("weekStart");
  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);
  if (week.status !== "shopping" && week.status !== "cooking") {
    return c.json({ error: "can only revert shopping or cooking weeks" }, 400);
  }
  const updated = {
    ...week,
    status: "selecting" as const,
    selections: [],
    cookedRecipeIds: [],
    confirmedBy: [],
    updatedAt: new Date().toISOString(),
  };
  await db.saveWeek(updated);
  return c.json({ week: updated });
});

app.post("/weeks/:weekStart/topup", async (c) => {
  const weekStart = c.req.param("weekStart");
  const body = await c.req.json<{ mealCounts: MealCounts }>();
  const week = await db.getWeek(weekStart);
  if (!week) return c.json({ error: "week not found" }, 404);

  const updated = {
    ...week,
    topUpMealCounts: body.mealCounts,
    updatedAt: new Date().toISOString(),
  };
  await db.saveWeek(updated);

  const generateArn = process.env["GENERATE_LAMBDA_ARN"];
  if (generateArn) {
    await lambda.send(
      new InvokeCommand({
        FunctionName: generateArn,
        InvocationType: "Event",
        Payload: Buffer.from(
          JSON.stringify({ weekStart, mealCounts: body.mealCounts, appendMode: true })
        ),
      })
    );
  }

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
  return c.json(buildShoppingList(weekStart, recipes, peopleCount, week.selections));
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

  const ratedBy = getUserEmail(c.req.header("Authorization")) ?? undefined;
  const rating = {
    id: ratedBy ? `${recipeId}#${weekStart}#${ratedBy}` : `${recipeId}#${weekStart}`,
    recipeId,
    weekId: weekStart,
    stars: body.stars,
    makeAgain: body.makeAgain,
    createdAt: new Date().toISOString(),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(ratedBy !== undefined ? { ratedBy } : {}),
  };

  await db.saveRating(rating);
  return c.json({ rating }, 201);
});

app.get("/eat", async (c) => {
  const allWeeks = await db.getAllWeeks();
  const cookedWeeks = allWeeks
    .filter((w) => w.cookedRecipeIds.length > 0)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

  const meals: Array<{ recipe: import("@cooking/core").Recipe; weekStart: string; ratings: import("@cooking/core").Rating[] }> = [];
  for (const week of cookedWeeks) {
    const [recipes, ratings] = await Promise.all([
      db.getCandidateRecipes(week.cookedRecipeIds),
      db.getRatingsForWeek(week.weekStart),
    ]);
    const sorted = recipes.sort(
      (a, b) => (MEAL_ORDER[a.mealType] ?? 99) - (MEAL_ORDER[b.mealType] ?? 99)
    );
    for (const recipe of sorted) {
      meals.push({
        recipe,
        weekStart: week.weekStart,
        ratings: ratings.filter((r) => r.recipeId === recipe.id),
      });
    }
  }

  return c.json({ meals });
});

export const handler = handle(app);
