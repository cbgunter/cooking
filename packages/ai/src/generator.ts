import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { Recipe, HouseholdPreferences, Rating } from "@cooking/core";
import { passesConstraints } from "@cooking/core";
import { RECIPE_TOOL_SCHEMA } from "./schema.js";
import {
  buildMenuGenerationPrompt,
  buildMealDistribution,
  type GenerationContext,
} from "./prompt.js";

export interface GenerateMenuOptions {
  prefs: HouseholdPreferences;
  recentRecipes?: Recipe[];
  highlyRatedRecipes?: Recipe[];
  ratings?: Rating[];
  /** How many recipe candidates to generate. Defaults to ~1.8× daysPerWeek. */
  candidateCount?: number;
  /** ISO date string for the Monday of the target week (e.g. "2025-09-01"). */
  weekStart: string;
  apiKey: string;
  /** Claude model to use. Defaults to claude-sonnet-4-6 for cost efficiency. */
  model?: string;
}

export interface GenerateMenuResult {
  recipes: Recipe[];
  /** Total tool_use blocks Claude emitted (before constraint filtering). */
  totalGenerated: number;
  /** Count rejected by constraint validation. */
  totalRejected: number;
}

/**
 * Calls Claude with tool use to generate recipe candidates for the week.
 * Returns only candidates that pass all household constraints.
 */
export async function generateMenuCandidates(
  opts: GenerateMenuOptions
): Promise<GenerateMenuResult> {
  const {
    prefs,
    recentRecipes = [],
    highlyRatedRecipes = [],
    ratings = [],
    weekStart,
    apiKey,
    model = "claude-sonnet-4-6",
  } = opts;

  const candidateCount =
    opts.candidateCount ?? Math.ceil(prefs.defaultDaysPerWeek * 1.8);
  const mealDistribution = buildMealDistribution(candidateCount, prefs.defaultDaysPerWeek);

  const ctx: GenerationContext = {
    prefs,
    recentRecipes,
    highlyRatedRecipes,
    ratings,
    candidateCount,
    weekStart,
    mealDistribution,
  };

  const prompt = buildMenuGenerationPrompt(ctx);
  const client = new Anthropic({ apiKey });

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
  let totalGenerated = 0;
  let totalRejected = 0;

  for (const block of response.content) {
    if (block.type !== "tool_use" || block.name !== "add_recipe") continue;
    totalGenerated++;

    try {
      const recipe = parseRecipeBlock(block.input as Record<string, unknown>);
      if (passesConstraints(recipe, prefs)) {
        recipes.push(recipe);
      } else {
        totalRejected++;
      }
    } catch {
      totalRejected++;
    }
  }

  return { recipes, totalGenerated, totalRejected };
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
