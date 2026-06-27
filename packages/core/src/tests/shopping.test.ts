import { describe, it, expect } from "vitest";
import { buildShoppingList } from "../shopping.js";
import type { Recipe } from "../types.js";

const makeRecipe = (id: string, overrides: Partial<Recipe> = {}): Recipe => ({
  id,
  title: "Test Recipe",
  description: "",
  mealType: "dinner",
  cuisine: "American",
  tags: [],
  equipment: ["stove"],
  cookStyle: "cook_fresh",
  servings: 2,
  prepMinutes: 20,
  cookMinutes: 20,
  ingredients: [
    { name: "Chicken Breast", quantity: 1, unit: "lb", category: "protein" },
    { name: "Garlic", quantity: 3, unit: "cloves", category: "produce" },
  ],
  steps: [],
  nutrition: { calories: 500, sodiumMg: 600, proteinG: 40, carbsG: 20, fatG: 15 },
  costPerServing: 8,
  aiGenerated: true,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("buildShoppingList", () => {
  it("aggregates quantities for same ingredient across recipes", () => {
    const r1 = makeRecipe("r1");
    const r2 = makeRecipe("r2", {
      ingredients: [
        { name: "Garlic", quantity: 2, unit: "cloves", category: "produce" },
        { name: "Olive Oil", quantity: 1, unit: "tbsp", category: "pantry" },
      ],
    });

    const list = buildShoppingList("w1", [r1, r2], 2);
    const garlic = list.items.find((i) => i.name === "Garlic");
    expect(garlic?.totalQuantity).toBe(5); // 3 + 2
    expect(garlic?.recipeIds).toEqual(["r1", "r2"]);
  });

  it("scales quantities by peopleCount vs servings", () => {
    const r = makeRecipe("r1", { servings: 2 });
    const list = buildShoppingList("w1", [r], 4); // double the servings
    const chicken = list.items.find((i) => i.name === "Chicken Breast");
    expect(chicken?.totalQuantity).toBe(2); // 1 * (4/2) = 2
  });

  it("sorts items by category then name", () => {
    const r = makeRecipe("r1", {
      ingredients: [
        { name: "Zucchini", quantity: 1, unit: "each", category: "produce" },
        { name: "Chicken", quantity: 1, unit: "lb", category: "protein" },
        { name: "Apple", quantity: 2, unit: "each", category: "produce" },
      ],
    });
    const list = buildShoppingList("w1", [r], 2);
    const names = list.items.map((i) => i.name);
    expect(names.indexOf("Chicken")).toBeLessThan(names.indexOf("Apple"));
    expect(names.indexOf("Apple")).toBeLessThan(names.indexOf("Zucchini"));
  });
});
