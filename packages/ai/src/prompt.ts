import type { HouseholdPreferences, Recipe, Rating, MealType } from "@cooking/core";

export interface GenerationContext {
  prefs: HouseholdPreferences;
  recentRecipes: Recipe[];
  highlyRatedRecipes: Recipe[];
  ratings: Rating[];
  candidateCount: number;
  weekStart: string;
  /** mealType distribution for candidates */
  mealDistribution: { breakfast: number; lunch: number; dinner: number };
}

export function buildMenuGenerationPrompt(ctx: GenerationContext): string {
  const { prefs, recentRecipes, highlyRatedRecipes, candidateCount, mealDistribution } =
    ctx;

  const recentTitles =
    recentRecipes.length > 0
      ? recentRecipes.map((r) => `- ${r.title} (${r.cuisine})`).join("\n")
      : "None yet";

  const favoriteTitles =
    highlyRatedRecipes.length > 0
      ? highlyRatedRecipes.map((r) => `- ${r.title} (${r.cuisine}, ⭐${getRating(r.id, ctx.ratings)})`).join("\n")
      : "None yet";

  const dislikesText =
    prefs.dislikes.length > 0 ? prefs.dislikes.join(", ") : "None";

  const cuisinePrefsText =
    prefs.cuisinePreferences.length > 0
      ? prefs.cuisinePreferences.join(", ")
      : "No strong preference";

  const adventureGuidance: Record<string, string> = {
    adventurous:
      "PRIORITIZE variety — new cuisines, techniques, and ingredients not seen recently. Only 1 favorite if any.",
    balanced:
      "Mix of new recipes (~60%) and familiar favorites (~40%).",
    comfort:
      "Lean toward known favorites and reliable classics. New recipes should be gentle variations.",
  };

  const equipment = prefs.equipment.join(", ");

  return `You are a personal meal planner for a household of ${prefs.peopleCount} people.

Generate exactly ${candidateCount} recipe candidates for the week of ${ctx.weekStart}.

## Distribution
- Breakfast: ${mealDistribution.breakfast} recipes (prep-ahead, batch-friendly)
- Lunch: ${mealDistribution.lunch} recipes (prep-ahead, batch-friendly)
- Dinner: ${mealDistribution.dinner} recipes (cook-fresh, 20–45 min)

## Hard constraints (NEVER violate these)
- Max calories per serving: ${prefs.nutrition.maxCaloriesPerMeal} kcal
- Max sodium per serving: ${prefs.nutrition.maxSodiumMgPerMeal} mg
- Total prep + cook time: ${prefs.prepTimeRange.minMinutes}–${prefs.prepTimeRange.maxMinutes} minutes
- Cost per serving: breakfast ≤$${prefs.costCaps.breakfast}, lunch ≤$${prefs.costCaps.lunch}, dinner ≤$${prefs.costCaps.dinner}
- Available equipment: ${equipment}
- Avoid (ingredients/cuisines): ${dislikesText}

## Preferences
- Cuisine preferences: ${cuisinePrefsText}
- Adventure level: ${prefs.adventureLevel} → ${adventureGuidance[prefs.adventureLevel] ?? ""}

## Recent history (avoid repeating)
${recentTitles}

## Household favorites
${favoriteTitles}

## Ingredient reuse
Design the week so that ingredients overlap across meals where practical to minimize waste and grocery cost. Include a reuseNotes field indicating which ingredients are shared across multiple recipes.

## Output format
Use the add_recipe tool exactly ${candidateCount} times — once per recipe. Be precise with nutritional estimates; they must be realistic for the exact ingredients and quantities listed. All quantities must serve ${prefs.peopleCount} people (i.e., servings = ${prefs.peopleCount}).`;
}

function getRating(recipeId: string, ratings: Rating[]): number {
  const r = ratings.find((rt) => rt.recipeId === recipeId);
  return r?.stars ?? 0;
}

export function buildMealDistribution(
  totalCandidates: number,
  daysPerWeek: number
): { breakfast: number; lunch: number; dinner: number } {
  // Typical week: breakfast every day, lunch every day, dinner every day.
  // Generate slightly more candidates per meal type than days.
  const extra = Math.ceil(totalCandidates / 3) - daysPerWeek;
  const base = daysPerWeek + Math.max(0, extra);
  return {
    breakfast: base,
    lunch: base,
    dinner: base,
  };
}
