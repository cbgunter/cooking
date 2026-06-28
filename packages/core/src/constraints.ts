import type { Recipe, HouseholdPreferences } from "./types.js";

export interface ConstraintViolation {
  field: string;
  message: string;
}

export function validateRecipeConstraints(
  recipe: Recipe,
  prefs: HouseholdPreferences
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;

  if (recipe.nutrition.calories > prefs.nutrition.maxCaloriesPerMeal) {
    violations.push({
      field: "calories",
      message: `${recipe.nutrition.calories} cal exceeds max ${prefs.nutrition.maxCaloriesPerMeal}`,
    });
  }

  if (recipe.nutrition.sodiumMg > prefs.nutrition.maxSodiumMgPerMeal) {
    violations.push({
      field: "sodiumMg",
      message: `${recipe.nutrition.sodiumMg}mg sodium exceeds max ${prefs.nutrition.maxSodiumMgPerMeal}mg`,
    });
  }

  const cap = prefs.costCaps[recipe.mealType];
  if (recipe.costPerServing > cap) {
    violations.push({
      field: "costPerServing",
      message: `$${recipe.costPerServing.toFixed(2)}/serving exceeds ${recipe.mealType} cap of $${cap.toFixed(2)}`,
    });
  }

  if (totalMinutes < prefs.prepTimeRange.minMinutes) {
    violations.push({
      field: "prepTime",
      message: `${totalMinutes} min is under minimum ${prefs.prepTimeRange.minMinutes} min`,
    });
  }

  if (totalMinutes > prefs.prepTimeRange.maxMinutes) {
    violations.push({
      field: "prepTime",
      message: `${totalMinutes} min exceeds maximum ${prefs.prepTimeRange.maxMinutes} min`,
    });
  }

  const dislikedMatch = prefs.dislikes.find((d) =>
    recipe.ingredients.some((i) =>
      i.name.toLowerCase().includes(d.toLowerCase())
    )
  );
  if (dislikedMatch) {
    violations.push({
      field: "ingredients",
      message: `Contains disliked ingredient/cuisine: ${dislikedMatch}`,
    });
  }

  return violations;
}

export function passesConstraints(
  recipe: Recipe,
  prefs: HouseholdPreferences
): boolean {
  return validateRecipeConstraints(recipe, prefs).length === 0;
}
