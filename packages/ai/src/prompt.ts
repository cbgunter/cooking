import type { HouseholdPreferences, Recipe, Rating, MealCounts } from "@cooking/core";

export interface GenerationContext {
  prefs: HouseholdPreferences;
  recentRecipes: Recipe[];
  highlyRatedRecipes: Recipe[];
  dislikedRecipes: Array<{ title: string; notes?: string }>;
  ratings: Rating[];
  /** Per-type candidate targets (already 2× user days) */
  targetCounts: MealCounts;
  weekStart: string;
  /** Titles already accepted — used in top-up rounds to avoid repeats */
  existingTitles?: string[];
}

export function buildMenuGenerationPrompt(ctx: GenerationContext): string {
  const { prefs, recentRecipes, highlyRatedRecipes, dislikedRecipes, targetCounts } = ctx;

  const total = targetCounts.breakfast + targetCounts.lunch + targetCounts.dinner;

  const recentTitles =
    recentRecipes.length > 0
      ? recentRecipes.map((r) => `- ${r.title} (${r.cuisine})`).join("\n")
      : "None yet";

  const favoriteTitles =
    highlyRatedRecipes.length > 0
      ? highlyRatedRecipes
          .map((r) => `- ${r.title} (${r.cuisine}, ⭐${getRating(r.id, ctx.ratings)})`)
          .join("\n")
      : "None yet";

  const dislikedText =
    dislikedRecipes.length > 0
      ? dislikedRecipes
          .map((r) => `- ${r.title}${r.notes ? ` (feedback: "${r.notes}")` : ""}`)
          .join("\n")
      : "None";

  const ingredientDislikes =
    prefs.dislikes.length > 0 ? prefs.dislikes.join(", ") : "None";

  const cuisinePrefsText =
    prefs.cuisinePreferences.length > 0
      ? prefs.cuisinePreferences.join(", ")
      : "No strong preference";

  const adventureGuidance: Record<string, string> = {
    adventurous:
      "PRIORITIZE variety — new cuisines, techniques, and ingredients not seen recently. Only 1 favorite if any.",
    balanced: "Mix of new recipes (~60%) and familiar favorites (~40%).",
    comfort:
      "Lean toward known favorites and reliable classics. New recipes should be gentle variations.",
  };

  const equipment = prefs.equipment.join(", ");

  const existing = ctx.existingTitles?.length
    ? `\n## Already accepted (do not repeat)\n${ctx.existingTitles.map((t) => `- ${t}`).join("\n")}\n`
    : "";

  const distributionLines = (
    [
      targetCounts.breakfast > 0
        ? `- Breakfast: ${targetCounts.breakfast} recipes (prep-ahead, batch-friendly)`
        : null,
      targetCounts.lunch > 0
        ? `- Lunch: ${targetCounts.lunch} recipes (prep-ahead, batch-friendly)`
        : null,
      targetCounts.dinner > 0
        ? `- Dinner: ${targetCounts.dinner} recipes (cook-fresh, 20–45 min)`
        : null,
    ] as (string | null)[]
  )
    .filter(Boolean)
    .join("\n");

  return `You are a personal meal planner for a household of ${prefs.peopleCount} people.

Generate exactly ${total} recipe candidates for the week of ${ctx.weekStart}.

## Distribution (MUST match exactly)
${distributionLines}

## Hard constraints (NEVER violate these)
- Max calories per serving: ${prefs.nutrition.maxCaloriesPerMeal} kcal
- Max sodium per serving: ${prefs.nutrition.maxSodiumMgPerMeal} mg
- Total prep + cook time: ${prefs.prepTimeRange.minMinutes}–${prefs.prepTimeRange.maxMinutes} minutes
- Cost per serving: breakfast ≤$${prefs.costCaps.breakfast}, lunch ≤$${prefs.costCaps.lunch}, dinner ≤$${prefs.costCaps.dinner}
- Available equipment: ${equipment}
- Avoid (ingredients/cuisines): ${ingredientDislikes}

## Preferences
- Cuisine preferences: ${cuisinePrefsText}
- Adventure level: ${prefs.adventureLevel} → ${adventureGuidance[prefs.adventureLevel] ?? ""}

## Recent history (avoid repeating)
${recentTitles}

## Household favorites
${favoriteTitles}

## Previously disliked / "pass next time" (avoid these)
${dislikedText}
${existing}
## Ingredient reuse
Design the week so that ingredients overlap across meals where practical to minimize waste and grocery cost. Include a reuseNotes field indicating which ingredients are shared across multiple recipes.

## Output format
Use the add_recipe tool exactly ${total} times — once per recipe. Be precise with nutritional estimates; they must be realistic for the exact ingredients and quantities listed. All quantities must serve ${prefs.peopleCount} people (i.e., servings = ${prefs.peopleCount}).`;
}

function getRating(recipeId: string, ratings: Rating[]): number {
  const r = ratings.find((rt) => rt.recipeId === recipeId);
  return r?.stars ?? 0;
}

/** Build 2× candidate targets per requested meal type. */
export function buildTargetCounts(mealCounts: MealCounts): MealCounts {
  return {
    breakfast: mealCounts.breakfast * 2,
    lunch: mealCounts.lunch * 2,
    dinner: mealCounts.dinner * 2,
  };
}
