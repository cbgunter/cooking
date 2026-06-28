import type { Recipe, ShoppingList, ShoppingListItem, WeekSelection } from "./types.js";

const UNIT_ALIASES: Record<string, string> = {
  tablespoon: "tbsp", tablespoons: "tbsp", tbsps: "tbsp", "tbs": "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsps: "tsp",
  cup: "cup", cups: "cup",
  ounce: "oz", ounces: "oz",
  pound: "lb", pounds: "lb", lbs: "lb",
  gram: "g", grams: "g",
  kilogram: "kg", kilograms: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  liter: "L", liters: "L", litre: "L", litres: "L",
  clove: "clove", cloves: "clove",
  slice: "slice", slices: "slice",
  can: "can", cans: "can",
  piece: "piece", pieces: "piece",
  sprig: "sprig", sprigs: "sprig",
  stalk: "stalk", stalks: "stalk",
  head: "head", heads: "head",
  bunch: "bunch", bunches: "bunch",
  pinch: "pinch", pinches: "pinch",
  whole: "whole",
};

function normalizeUnit(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return UNIT_ALIASES[lower] ?? lower;
}

function normalizeIngredientName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildShoppingList(
  weekId: string,
  recipes: Recipe[],
  peopleCount: number,
  selections?: WeekSelection[]
): ShoppingList {
  const itemMap = new Map<string, ShoppingListItem>();

  for (const recipe of recipes) {
    const sel = selections?.find((s) => s.recipeId === recipe.id);
    const mealQty = sel?.quantity ?? 1;
    const scale = (peopleCount / recipe.servings) * mealQty;

    for (const ing of recipe.ingredients) {
      const normName = normalizeIngredientName(ing.name);
      const normUnit = normalizeUnit(ing.unit);
      const key = `${normName}::${normUnit}`;
      const existing = itemMap.get(key);

      if (existing) {
        existing.totalQuantity += ing.quantity * scale;
        if (!existing.recipeIds.includes(recipe.id)) {
          existing.recipeIds.push(recipe.id);
        }
      } else {
        itemMap.set(key, {
          name: ing.name,
          totalQuantity: ing.quantity * scale,
          unit: normUnit,
          category: ing.category,
          recipeIds: [recipe.id],
        });
      }
    }
  }

  const CATEGORY_ORDER: Record<string, number> = {
    protein: 0, produce: 1, dairy: 2, frozen: 3, pantry: 4, condiments: 5, other: 6,
  };
  const categoryRank = (c: string) => CATEGORY_ORDER[c] ?? 99;

  const items = Array.from(itemMap.values()).sort((a, b) => {
    const catDiff = categoryRank(a.category) - categoryRank(b.category);
    if (catDiff !== 0) return catDiff;
    return a.name.localeCompare(b.name);
  });

  return {
    weekId,
    generatedAt: new Date().toISOString(),
    items,
  };
}
