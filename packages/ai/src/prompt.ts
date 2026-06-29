import type { HouseholdPreferences, Recipe, Rating, MealCounts } from "@cooking/core";

export interface GenerationContext {
  prefs: HouseholdPreferences;
  recentRecipes: Recipe[];
  highlyRatedRecipes: Recipe[];
  dislikedRecipes: Array<{ title: string; notes?: string; permanent?: boolean }>;
  ratings: Rating[];
  /** Per-type candidate targets (already 2× user days) */
  targetCounts: MealCounts;
  weekStart: string;
  /** Already-accepted candidates (title + cuisine) — new batch must avoid these cells */
  existingCandidates?: Array<{ title: string; cuisine: string }>;
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

  const permanentlyBanned = dislikedRecipes.filter((r) => r.permanent);
  const temporarilyDisliked = dislikedRecipes.filter((r) => !r.permanent);

  const bannedText =
    permanentlyBanned.length > 0
      ? permanentlyBanned.map((r) => `- ${r.title}`).join("\n")
      : "None";

  const dislikedText =
    temporarilyDisliked.length > 0
      ? temporarilyDisliked
          .map((r) => `- ${r.title}${r.notes ? ` (${r.notes})` : ""}`)
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

  const existingBlock = ctx.existingCandidates?.length
    ? `\n## Already on the menu (do not repeat — also avoid their protein+method cells)\n${ctx.existingCandidates.map((c) => `- ${c.title} (${c.cuisine})`).join("\n")}\n`
    : "";

  const tasteProfileBlock = prefs.tasteProfile?.trim()
    ? `\n## How this household actually eats\n${prefs.tasteProfile.trim()}\nUse this as the primary style anchor — generate dishes that feel like natural fits for these tastes.\n`
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
${tasteProfileBlock}
## Distribution (MUST match exactly)
${distributionLines}

## Hard constraints (NEVER violate these)
- Max calories per serving: ${prefs.nutrition.maxCaloriesPerMeal} kcal
- Max sodium per serving: ${prefs.nutrition.maxSodiumMgPerMeal} mg
- Total prep + cook time: up to ${prefs.prepTimeRange.maxMinutes} minutes (breakfast and lunch have no minimum; dinner minimum is ${prefs.prepTimeRange.minMinutes} min)
- Cost per serving: breakfast ≤$${prefs.costCaps.breakfast}, lunch ≤$${prefs.costCaps.lunch}, dinner ≤$${prefs.costCaps.dinner}
- Avoid (ingredients/cuisines): ${ingredientDislikes}

## Variety contract (CRITICAL — read before generating)
These ${total} recipes are a menu to choose from, not variations of one dish.
Before calling add_recipe, use your thinking to map out a spread across these axes:
- Primary protein: chicken / beef / pork / fish / shellfish / eggs / legumes-tofu / other
  → No single protein should appear in more than ${Math.ceil(total / 3)} of the ${total} recipes.
- Cuisine / flavor profile: aim for mostly distinct cuisines across the set.
- Cooking format: sheet-pan, stir-fry, soup/stew, salad/bowl, pasta, tacos, curry, roast, sandwich, grain bowl, etc.

**Hard rule:** Two candidates that share the SAME primary protein AND the SAME cooking format are too similar — change at least one axis.

## Preferences
- Cuisine preferences: ${cuisinePrefsText}
- Adventure level: ${prefs.adventureLevel} → ${adventureGuidance[prefs.adventureLevel] ?? ""}

## Recent history (don't repeat these exact dishes — but they reflect household taste, so stay stylistically compatible)
${recentTitles}

## Household favorites (generate new dishes in this spirit — similar vibe and comfort level — but vary the specifics, do NOT clone them)
${favoriteTitles}

## NEVER recommend these again (both users rejected them)
${bannedText}

## Avoid for now (recently thumbed down or rated poorly)
${dislikedText}
${existingBlock}
## Ingredient reuse
Where it does not reduce variety, prefer shareable ingredients to limit waste and grocery cost. **Variety across candidates takes priority over ingredient overlap.** Include a reuseNotes field when ingredients genuinely overlap.

## Output format
Use the add_recipe tool exactly ${total} times — once per recipe. Be precise with nutritional estimates; they must be realistic for the exact ingredients and quantities listed. All quantities must serve ${prefs.peopleCount} people (i.e., servings = ${prefs.peopleCount}).`;
}

function getRating(recipeId: string, ratings: Rating[]): number {
  const r = ratings.find((rt) => rt.recipeId === recipeId);
  return r?.stars ?? 0;
}

/** Build candidate targets: breakfast/lunch always get 4 options when enabled; dinner gets 2×. */
export function buildTargetCounts(mealCounts: MealCounts): MealCounts {
  return {
    breakfast: mealCounts.breakfast > 0 ? 4 : 0,
    lunch: mealCounts.lunch > 0 ? 4 : 0,
    dinner: mealCounts.dinner * 2,
  };
}
