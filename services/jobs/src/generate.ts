import type { Handler } from "aws-lambda";
import { generateMenuCandidates } from "@cooking/ai";
import { DEFAULT_PREFERENCES } from "@cooking/core";
import * as db from "./db.js";

interface GenerateEvent {
  weekStart?: string;
}

/** Lambda handler: generates recipe candidates and stores them in DynamoDB. */
export const handler: Handler<GenerateEvent> = async (event) => {
  const weekStart = event.weekStart ?? upcomingMondayISO();
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var not set");

  const [prefs, recentRecipes, highlyRatedRecipes, ratings, week] = await Promise.all([
    db.getPreferences(),
    db.getRecentRecipes(4),
    db.getHighlyRatedRecipes(4),
    db.getAllRatings(),
    db.getWeek(weekStart),
  ]);

  const resolvedPrefs = prefs ?? DEFAULT_PREFERENCES;

  const { recipes, totalGenerated, totalRejected } = await generateMenuCandidates({
    prefs: resolvedPrefs,
    recentRecipes,
    highlyRatedRecipes,
    ratings,
    weekStart,
    apiKey,
  });

  console.log(
    JSON.stringify({ weekStart, totalGenerated, totalRejected, saved: recipes.length })
  );

  if (recipes.length === 0) {
    console.warn("No valid recipe candidates generated — week stays in pending status");
    return;
  }

  await db.saveRecipes(recipes);

  const now = new Date().toISOString();
  await db.saveWeek({
    id: weekStart,
    weekStart,
    status: "selecting",
    daysPerWeek: week?.daysPerWeek ?? resolvedPrefs.defaultDaysPerWeek,
    candidateRecipeIds: recipes.map((r) => r.id),
    selections: week?.selections ?? [],
    cookedRecipeIds: week?.cookedRecipeIds ?? [],
    createdAt: week?.createdAt ?? now,
    updatedAt: now,
  });
};

function upcomingMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = day === 1 ? 7 : (8 - day) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntil);
  return monday.toISOString().split("T")[0] as string;
}
