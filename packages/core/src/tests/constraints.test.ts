import { describe, it, expect } from "vitest";
import { validateRecipeConstraints, passesConstraints } from "../constraints.js";
import type { Recipe, HouseholdPreferences } from "../types.js";
import { DEFAULT_PREFERENCES } from "../defaults.js";

const baseRecipe: Recipe = {
  id: "r1",
  title: "Test",
  description: "",
  mealType: "dinner",
  cuisine: "American",
  tags: [],
  equipment: ["stove"],
  cookStyle: "cook_fresh",
  servings: 2,
  prepMinutes: 20,
  cookMinutes: 20,
  ingredients: [{ name: "Chicken", quantity: 1, unit: "lb", category: "protein" }],
  steps: [],
  nutrition: { calories: 600, sodiumMg: 700, proteinG: 40, carbsG: 30, fatG: 15 },
  costPerServing: 9,
  aiGenerated: true,
  createdAt: new Date().toISOString(),
};

const prefs: HouseholdPreferences = {
  ...DEFAULT_PREFERENCES,
  notificationEmail: "test@example.com",
};

describe("validateRecipeConstraints", () => {
  it("passes for a valid recipe", () => {
    const violations = validateRecipeConstraints(baseRecipe, prefs);
    expect(violations).toHaveLength(0);
  });

  it("catches calorie overages", () => {
    const r = { ...baseRecipe, nutrition: { ...baseRecipe.nutrition, calories: 800 } };
    const v = validateRecipeConstraints(r, prefs);
    expect(v.some((x) => x.field === "calories")).toBe(true);
  });

  it("catches cost overages", () => {
    const r = { ...baseRecipe, costPerServing: 15 };
    const v = validateRecipeConstraints(r, prefs);
    expect(v.some((x) => x.field === "costPerServing")).toBe(true);
  });

  it("catches disliked ingredients", () => {
    const p = { ...prefs, dislikes: ["mushroom"] };
    const r = {
      ...baseRecipe,
      ingredients: [{ name: "Portobello Mushroom", quantity: 1, unit: "each", category: "produce" as const }],
    };
    const v = validateRecipeConstraints(r, p);
    expect(v.some((x) => x.field === "ingredients")).toBe(true);
  });

});

describe("passesConstraints", () => {
  it("returns true for valid recipe", () => {
    expect(passesConstraints(baseRecipe, prefs)).toBe(true);
  });

  it("returns false for invalid recipe", () => {
    const r = { ...baseRecipe, costPerServing: 20 };
    expect(passesConstraints(r, prefs)).toBe(false);
  });
});
