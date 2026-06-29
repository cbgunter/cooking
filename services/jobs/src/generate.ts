import type { Handler } from "aws-lambda";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { generateMenuCandidates } from "@cooking/ai";
import { DEFAULT_PREFERENCES } from "@cooking/core";
import type { MealCounts } from "@cooking/core";
import * as db from "./db.js";

const smClient = new SecretsManagerClient({});

async function getAnthropicKey(): Promise<string> {
  const arn = process.env["ANTHROPIC_SECRET_ARN"];
  if (arn) {
    const res = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
    if (res.SecretString) return res.SecretString;
  }
  const key = process.env["ANTHROPIC_API_KEY"];
  if (key) return key;
  throw new Error("No Anthropic API key — set ANTHROPIC_SECRET_ARN or ANTHROPIC_API_KEY");
}

interface GenerateEvent {
  weekStart?: string;
  mealCounts?: MealCounts;
  /** When true, append new candidates to an existing week instead of replacing */
  appendMode?: boolean;
}

export const handler: Handler<GenerateEvent> = async (event) => {
  const weekStart = event.weekStart ?? upcomingMondayISO();
  const appendMode = event.appendMode ?? false;
  try {
    await run(weekStart, event.mealCounts, appendMode);
  } catch (err) {
    console.error(JSON.stringify({ weekStart, appendMode, error: String(err) }));
    const failed = await db.getWeek(weekStart);
    if (failed) {
      if (appendMode) {
        // Don't mark the whole week as error — confirmed meals are still valid.
        // Just clear the in-progress indicator so the UI stops spinning.
        const { topUpMealCounts: _removed, ...rest } = failed;
        await db.saveWeek({ ...rest, updatedAt: new Date().toISOString() });
      } else {
        const errorMessage = isAnthropicError(err)
          ? "Claude API is unavailable — tap to try again"
          : "Generation failed unexpectedly — tap to try again";
        await db.saveWeek({ ...failed, status: "error", errorMessage, updatedAt: new Date().toISOString() });
      }
    }
    throw err;
  }
};

function isAnthropicError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Anthropic SDK errors include the status code or known phrases
  return (
    err.constructor.name === "APIError" ||
    msg.includes("overloaded") ||
    msg.includes("rate limit") ||
    msg.includes("529") ||
    msg.includes("503") ||
    msg.includes("anthropic")
  );
}

// Corey and Luisa — used for the "both users disliked" permanent ban rule.
const HOUSEHOLD_USERS = ["cbgunter@gmail.com", "lmalava87@gmail.com"];

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;

async function run(weekStart: string, eventMealCounts?: MealCounts, appendMode = false) {
  const apiKey = await getAnthropicKey();

  const [prefs, recentRecipes, highlyRatedRecipes, dislikedRecipes, ratings, downvotes, week] =
    await Promise.all([
      db.getPreferences(),
      db.getRecentRecipes(4),
      db.getHighlyRatedRecipes(4),
      db.getDislikedRecipes(),
      db.getAllRatings(),
      db.getAllRecipeDownvotes(),
      db.getWeek(weekStart),
    ]);

  // For top-up regenerations, fetch the current candidates so we can exclude
  // their titles from the new batch (ensuring fresh, different options).
  const currentCandidates = appendMode && week?.candidateRecipeIds.length
    ? await db.getRecipesByIds(week.candidateRecipeIds)
    : [];

  const resolvedPrefs = prefs ?? DEFAULT_PREFERENCES;

  // Apply thumbs-down exclusion rules:
  //   both users thumbed down        → permanent ban
  //   same user thumbed down 2+ times → avoid 180 days
  //   any single thumbs-down         → avoid 90 days
  const nowMs = Date.now();
  const downvoteDisliked: Array<{ title: string; notes?: string; permanent?: boolean }> = [];
  for (const dv of downvotes) {
    if (dv.downvotes.length === 0) continue;
    const voterEmails = new Set(dv.downvotes.map((d) => d.userEmail));
    const bothDisliked = HOUSEHOLD_USERS.every((u) => voterEmails.has(u));
    if (bothDisliked) {
      downvoteDisliked.push({ title: dv.displayTitle, permanent: true });
      continue;
    }
    const maxUserCount = Math.max(
      ...HOUSEHOLD_USERS.map((u) => dv.downvotes.filter((d) => d.userEmail === u).length)
    );
    const avoidDays = maxUserCount >= 2 ? 180 : 90;
    const latestTs = dv.downvotes.reduce(
      (latest, d) => (d.timestamp > latest ? d.timestamp : latest),
      dv.downvotes[0]!.timestamp
    );
    const daysSince = (nowMs - new Date(latestTs).getTime()) / 86_400_000;
    if (daysSince < avoidDays) {
      const notes = maxUserCount >= 2 ? "thumbed down multiple times" : "thumbs down";
      downvoteDisliked.push({ title: dv.displayTitle, notes });
    }
  }

  const allDisliked = [...dislikedRecipes, ...downvoteDisliked];

  // Determine per-type meal counts: event → stored week → default spread
  const mealCounts: MealCounts =
    eventMealCounts ??
    week?.mealCounts ??
    defaultMealCounts(resolvedPrefs.defaultDaysPerWeek);

  // Titles of current candidates for the types being regenerated — Claude will
  // avoid repeating them, ensuring a fresh batch different from what's on screen.
  const regenTypes = appendMode
    ? MEAL_TYPES.filter((t) => (mealCounts[t] ?? 0) > 0)
    : [];
  const excludeTitles = currentCandidates
    .filter((r) => regenTypes.includes(r.mealType as typeof MEAL_TYPES[number]))
    .map((r) => r.title);

  const { recipes, totalGenerated, totalRejected } = await generateMenuCandidates({
    prefs: resolvedPrefs,
    recentRecipes,
    highlyRatedRecipes,
    dislikedRecipes: allDisliked,
    ratings,
    mealCounts,
    weekStart,
    apiKey,
    excludeTitles,
  });

  console.log(
    JSON.stringify({ weekStart, mealCounts, totalGenerated, totalRejected, saved: recipes.length })
  );

  const now = new Date().toISOString();

  if (recipes.length === 0) {
    console.warn(JSON.stringify({ weekStart, appendMode, warning: "No valid recipe candidates generated" }));
    const noResults = await db.getWeek(weekStart);
    if (noResults) {
      if (appendMode) {
        // Just clear the spinner — confirmed meals are unaffected.
        const { topUpMealCounts: _removed, ...rest } = noResults;
        await db.saveWeek({ ...rest, updatedAt: now });
      } else {
        await db.saveWeek({
          ...noResults,
          status: "error",
          errorMessage: "No recipes matched your constraints — tap to try again or adjust preferences",
          updatedAt: now,
        });
      }
    }
    return;
  }

  await db.saveRecipes(recipes);

  if (appendMode && week) {
    // Replace unselected candidates of the regenerated types with the new batch.
    // Confirmed picks (in week.selections) are always retained so shop/cook/eat
    // views can still resolve them.
    const selectedIds = new Set(week.selections.map((s) => s.recipeId));
    const candidateById = new Map(currentCandidates.map((r) => [r.id, r]));
    const keptIds = week.candidateRecipeIds.filter((id) => {
      const r = candidateById.get(id);
      if (!r) return true;                                                      // unknown — keep safely
      if (selectedIds.has(id)) return true;                                     // never drop a confirmed pick
      return !regenTypes.includes(r.mealType as typeof MEAL_TYPES[number]);    // drop unselected of regenerated types
    });
    const { topUpMealCounts: _removed, ...weekRest } = week;
    await db.saveWeek({
      ...weekRest,
      candidateRecipeIds: [...keptIds, ...recipes.map((r) => r.id)],
      updatedAt: now,
    });
    return;
  }

  await db.saveWeek({
    id: weekStart,
    weekStart,
    status: "selecting",
    daysPerWeek: mealCounts.breakfast + mealCounts.lunch + mealCounts.dinner,
    mealCounts,
    candidateRecipeIds: recipes.map((r) => r.id),
    selections: week?.selections ?? [],
    cookedRecipeIds: week?.cookedRecipeIds ?? [],
    createdAt: week?.createdAt ?? now,
    updatedAt: now,
  });
}

function defaultMealCounts(daysPerWeek: number): MealCounts {
  const d = Math.max(1, daysPerWeek);
  return { breakfast: d, lunch: d, dinner: d };
}

function upcomingMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = day === 1 ? 7 : (8 - day) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntil);
  return monday.toISOString().split("T")[0] as string;
}
