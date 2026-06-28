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
}

export const handler: Handler<GenerateEvent> = async (event) => {
  const weekStart = event.weekStart ?? upcomingMondayISO();
  try {
    await run(weekStart, event.mealCounts);
  } catch (err) {
    console.error(JSON.stringify({ weekStart, error: String(err) }));
    const failed = await db.getWeek(weekStart);
    if (failed) {
      const errorMessage = isAnthropicError(err)
        ? "Claude API is unavailable — tap to try again"
        : "Generation failed unexpectedly — tap to try again";
      await db.saveWeek({ ...failed, status: "error", errorMessage, updatedAt: new Date().toISOString() });
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

async function run(weekStart: string, eventMealCounts?: MealCounts) {
  const apiKey = await getAnthropicKey();

  const [prefs, recentRecipes, highlyRatedRecipes, dislikedRecipes, ratings, week] =
    await Promise.all([
      db.getPreferences(),
      db.getRecentRecipes(4),
      db.getHighlyRatedRecipes(4),
      db.getDislikedRecipes(),
      db.getAllRatings(),
      db.getWeek(weekStart),
    ]);

  const resolvedPrefs = prefs ?? DEFAULT_PREFERENCES;

  // Determine per-type meal counts: event → stored week → default spread
  const mealCounts: MealCounts =
    eventMealCounts ??
    week?.mealCounts ??
    defaultMealCounts(resolvedPrefs.defaultDaysPerWeek);

  const { recipes, totalGenerated, totalRejected } = await generateMenuCandidates({
    prefs: resolvedPrefs,
    recentRecipes,
    highlyRatedRecipes,
    dislikedRecipes,
    ratings,
    mealCounts,
    weekStart,
    apiKey,
  });

  console.log(
    JSON.stringify({ weekStart, mealCounts, totalGenerated, totalRejected, saved: recipes.length })
  );

  if (recipes.length === 0) {
    console.warn(JSON.stringify({ weekStart, warning: "No valid recipe candidates generated" }));
    const noResults = await db.getWeek(weekStart);
    if (noResults) {
      await db.saveWeek({
        ...noResults,
        status: "error",
        errorMessage: "No recipes matched your constraints — tap to try again or adjust preferences",
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  await db.saveRecipes(recipes);

  const now = new Date().toISOString();
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
