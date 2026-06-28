import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { Recipe, HouseholdPreferences, Rating, MealCounts } from "@cooking/core";
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
  dislikedRecipes?: Array<{ title: string; notes?: string }>;
  ratings?: Rating[];
  /** Per-type user day counts; candidates generated = 2× each. */
  mealCounts: MealCounts;
  weekStart: string;
  apiKey: string;
  model?: string;
}

export interface GenerateMenuResult {
  recipes: Recipe[];
  totalGenerated: number;
  totalRejected: number;
}

const MAX_TOPUP_ROUNDS = 2;

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
  } = opts;

  const client = new Anthropic({ apiKey });
  const targets = buildTargetCounts(mealCounts);

  const accepted: Recipe[] = [];
  let totalGenerated = 0;
  let totalRejected = 0;

  // --- Initial round ---
  const firstRound = await runRound(client, model, prefs, {
    prefs,
    recentRecipes,
    highlyRatedRecipes,
    dislikedRecipes,
    ratings,
    targetCounts: targets,
    weekStart,
  });

  totalGenerated += firstRound.generated;
  totalRejected += firstRound.rejected;
  accepted.push(...firstRound.recipes);

  // --- Top-up rounds ---
  for (let round = 0; round < MAX_TOPUP_ROUNDS; round++) {
    const shortfall = computeShortfall(accepted, targets);
    const shortfallTotal = shortfall.breakfast + shortfall.lunch + shortfall.dinner;
    if (shortfallTotal === 0) break;

    const topup = await runRound(client, model, prefs, {
      prefs,
      recentRecipes,
      highlyRatedRecipes,
      dislikedRecipes,
      ratings,
      targetCounts: shortfall,
      weekStart,
      existingTitles: accepted.map((r) => r.title),
    });

    totalGenerated += topup.generated;
    totalRejected += topup.rejected;
    accepted.push(...topup.recipes);
  }

  return { recipes: accepted, totalGenerated, totalRejected };
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

function computeShortfall(accepted: Recipe[], targets: MealCounts): MealCounts {
  const counts = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const r of accepted) counts[r.mealType]++;
  return {
    breakfast: Math.max(0, targets.breakfast - counts.breakfast),
    lunch: Math.max(0, targets.lunch - counts.lunch),
    dinner: Math.max(0, targets.dinner - counts.dinner),
  };
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
