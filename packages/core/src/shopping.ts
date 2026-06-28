import type { Recipe, ShoppingList, ShoppingListItem, WeekSelection } from "./types.js";

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
      const key = `${ing.name.toLowerCase()}::${ing.unit.toLowerCase()}`;
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
          unit: ing.unit,
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
