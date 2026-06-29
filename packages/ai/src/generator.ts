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

const MAX_TOPUP_ROUNDS = 2;
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

  // Generate each meal type in its own request, in parallel. A single combined
  // request asks for ~14 full recipes and truncates on max_tokens before it
  // emits the later meal types — so we isolate each type for reliability.
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

/** Generate candidates for a single meal type, retrying to fill any shortfall. */
async function generateForMealType(
  client: Anthropic,
  model: string,
  prefs: HouseholdPreferences,
  mealType: MealType,
  target: number,
  baseCtx: Omit<GenerationContext, "targetCounts">,
  excludeTitles: string[] = []
): Promise<{ recipes: Recipe[]; generated: number; rejected: number }> {
  if (target === 0) return { recipes: [], generated: 0, rejected: 0 };

  const accepted: Recipe[] = [];
  let generated = 0;
  let rejected = 0;

  for (let round = 0; round <= MAX_TOPUP_ROUNDS; round++) {
    const shortfall = target - accepted.length;
    if (shortfall <= 0) break;

    const targetCounts: MealCounts = {
      breakfast: mealType === "breakfast" ? shortfall : 0,
      lunch: mealType === "lunch" ? shortfall : 0,
      dinner: mealType === "dinner" ? shortfall : 0,
    };

    let result: { recipes: Recipe[]; generated: number; rejected: number };
    try {
      result = await runRound(client, model, prefs, {
        ...baseCtx,
        targetCounts,
        existingTitles: [...excludeTitles, ...accepted.map((r) => r.title)],
      });
    } catch (err) {
      // Isolate failures: one meal type erroring shouldn't lose the others.
      console.error(JSON.stringify({ mealType, round, error: String(err) }));
      break;
    }

    const matching = result.recipes.filter((r) => r.mealType === mealType);
    generated += result.generated;
    rejected += result.rejected + (result.recipes.length - matching.length);
    accepted.push(...matching);

    // A round that produced nothing on-type won't improve on retry — stop early.
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
    steps: input["steps"] as string[],
    nutrition: input["nutrition"] as Recipe["nutrition"],
    costPerServing: input["costPerServing"] as number,
    ...(reuseNotes !== undefined ? { reuseNotes } : {}),
    aiGenerated: true,
    createdAt: new Date().toISOString(),
  };
}
