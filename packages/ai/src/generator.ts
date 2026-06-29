import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { Recipe, HouseholdPreferences, Rating, MealCounts, MealType } from "@cooking/core";
import { passesConstraints } from "@cooking/core";
import { RECIPE_TOOL_SCHEMA } from "./schema.js";
import {
  buildMenuGenerationPrompt,
  buildTargetCounts,
  type GenerationContext,
} from "./prompt.js";

export interface GenerateMenuOptions {
  prefs: HouseholdPreferences;
  recentRecipes?: Recipe[];
  highlyRatedRecipes?: Recipe[];
  dislikedRecipes?: Array<{ title: string; notes?: string; permanent?: boolean }>;
  ratings?: Rating[];
  /** Per-type user day counts; see buildTargetCounts for candidate counts. */
  mealCounts: MealCounts;
  weekStart: string;
  apiKey: string;
  model?: string;
  /** Recipe titles already on screen that the new batch must not repeat. */
  excludeTitles?: string[];
}

export interface GenerateMenuResult {
  recipes: Recipe[];
  totalGenerated: number;
  totalRejected: number;
}

// Generate this many candidates per Claude call; smaller chunks force variety
// because the model can't settle on a theme across a large batch.
const CHUNK_SIZE = 2;

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

export async function generateMenuCandidates(
  opts: GenerateMenuOptions
): Promise<GenerateMenuResult> {
  const {
    prefs,
    recentRecipes = [],
    highlyRatedRecipes = [],
    dislikedRecipes = [],
    ratings = [],
    mealCounts,
    weekStart,
    apiKey,
    model = "claude-sonnet-4-6",
    excludeTitles = [],
  } = opts;

  const client = new Anthropic({ apiKey });
  const targets = buildTargetCounts(mealCounts);

  const baseCtx = {
    prefs,
    recentRecipes,
    highlyRatedRecipes,
    dislikedRecipes,
    ratings,
    weekStart,
  };

  // Generate each meal type in its own parallel chain of sequential chunk calls.
  // Parallel across types (for speed); sequential within a type (so each chunk
  // sees what's already been accepted and is pushed onto fresh variety cells).
  const perType = await Promise.all(
    MEAL_TYPES.map((mealType) =>
      generateForMealType(client, model, prefs, mealType, targets[mealType], baseCtx, excludeTitles)
    )
  );

  const accepted: Recipe[] = [];
  let totalGenerated = 0;
  let totalRejected = 0;
  for (const result of perType) {
    accepted.push(...result.recipes);
    totalGenerated += result.generated;
    totalRejected += result.rejected;
  }

  return { recipes: accepted, totalGenerated, totalRejected };
}

/** Generate candidates for a single meal type in sequential CHUNK_SIZE chunks. */
async function generateForMealType(
  client: Anthropic,
  model: string,
  prefs: HouseholdPreferences,
  mealType: MealType,
  target: number,
  baseCtx: Omit<GenerationContext, "targetCounts" | "existingCandidates">,
  excludeTitles: string[] = []
): Promise<{ recipes: Recipe[]; generated: number; rejected: number }> {
  if (target === 0) return { recipes: [], generated: 0, rejected: 0 };

  const accepted: Recipe[] = [];
  let generated = 0;
  let rejected = 0;

  // Seed the "already accepted" set with any externally excluded titles.
  // We don't have cuisine for these (they're just strings), so mark them as excluded.
  const externalExcludes: Array<{ title: string; cuisine: string }> = excludeTitles.map((t) => ({
    title: t,
    cuisine: "—",
  }));

  // Max chunks = ceil(target / CHUNK_SIZE) + 2 safety margin.
  const maxChunks = Math.ceil(target / CHUNK_SIZE) + 2;

  for (let chunk = 0; chunk < maxChunks; chunk++) {
    const shortfall = target - accepted.length;
    if (shortfall <= 0) break;

    const chunkSize = Math.min(CHUNK_SIZE, shortfall);
    const targetCounts: MealCounts = {
      breakfast: mealType === "breakfast" ? chunkSize : 0,
      lunch: mealType === "lunch" ? chunkSize : 0,
      dinner: mealType === "dinner" ? chunkSize : 0,
    };

    // Pass all already-accepted candidates (title + cuisine) so the next chunk
    // is pushed onto fresh protein/method/cuisine territory.
    const existingCandidates: Array<{ title: string; cuisine: string }> = [
      ...externalExcludes,
      ...accepted.map((r) => ({ title: r.title, cuisine: r.cuisine })),
    ];

    let result: { recipes: Recipe[]; generated: number; rejected: number };
    try {
      result = await runRound(client, model, prefs, {
        ...baseCtx,
        targetCounts,
        existingCandidates,
      });
    } catch (err) {
      console.error(JSON.stringify({ mealType, chunk, error: String(err) }));
      break;
    }

    const matching = result.recipes.filter((r) => r.mealType === mealType);
    generated += result.generated;
    rejected += result.rejected + (result.recipes.length - matching.length);
    accepted.push(...matching);

    // A chunk that produced nothing on-type won't improve on retry — stop early.
    if (matching.length === 0) break;
  }

  return { recipes: accepted, generated, rejected };
}

async function runRound(
  client: Anthropic,
  model: string,
  prefs: HouseholdPreferences,
  ctx: GenerationContext
): Promise<{ recipes: Recipe[]; generated: number; rejected: number }> {
  const total = ctx.targetCounts.breakfast + ctx.targetCounts.lunch + ctx.targetCounts.dinner;
  if (total === 0) return { recipes: [], generated: 0, rejected: 0 };

  const prompt = buildMenuGenerationPrompt(ctx);

  const stream = client.messages.stream({
    model,
    max_tokens: 24000,
    thinking: { type: "adaptive" },
    tools: [RECIPE_TOOL_SCHEMA as Anthropic.Tool],
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();

  const recipes: Recipe[] = [];
  let generated = 0;
  let rejected = 0;

  for (const block of response.content) {
    if (block.type !== "tool_use" || block.name !== "add_recipe") continue;
    generated++;
    try {
      const recipe = parseRecipeBlock(block.input as Record<string, unknown>);
      if (passesConstraints(recipe, prefs)) {
        recipes.push(recipe);
      } else {
        rejected++;
      }
    } catch {
      rejected++;
    }
  }

  return { recipes, generated, rejected };
}

function parseRecipeBlock(input: Record<string, unknown>): Recipe {
  const reuseNotes =
    typeof input["reuseNotes"] === "string" ? input["reuseNotes"] : undefined;
  return {
    id: randomUUID(),
    title: input["title"] as string,
    description: input["description"] as string,
    mealType: input["mealType"] as Recipe["mealType"],
    cuisine: input["cuisine"] as string,
    tags: input["tags"] as string[],
    equipment: input["equipment"] as Recipe["equipment"],
    cookStyle: input["cookStyle"] as Recipe["cookStyle"],
    servings: input["servings"] as number,
    prepMinutes: input["prepMinutes"] as number,
    cookMinutes: input["cookMinutes"] as number,
    ingredients: input["ingredients"] as Recipe["ingredients"],
    prepSteps: input["prepSteps"] as string[],
    cookSteps: input["cookSteps"] as string[],
    nutrition: input["nutrition"] as Recipe["nutrition"],
    costPerServing: input["costPerServing"] as number,
    ...(reuseNotes !== undefined ? { reuseNotes } : {}),
    aiGenerated: true,
    createdAt: new Date().toISOString(),
  };
}
