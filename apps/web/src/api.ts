import type {
  HouseholdPreferences,
  Recipe,
  Week,
  ShoppingList,
  WeekSelection,
} from "@cooking/core";
import { getToken } from "./auth.js";

const BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "").replace(/\/$/, "");

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Preferences ────────────────────────────────────────────────────────────

export const getPreferences = () => req<HouseholdPreferences>("/preferences");

export const savePreferences = (prefs: HouseholdPreferences) =>
  req<HouseholdPreferences>("/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });

// ── All weeks ─────────────────────────────────────────────────────────────

export const getWeeks = () =>
  req<{ weeks: Array<{ week: Week; selectedRecipes: Recipe[] }> }>("/weeks");

// ── Week by start date ────────────────────────────────────────────────────

export const getWeekByStart = (weekStart: string) =>
  req<{ week: Week | null; candidates: Recipe[] }>(`/weeks/${weekStart}`);

export const triggerGenerateForWeek = (weekStart: string, daysPerWeek?: number) =>
  req<{ week: Week }>(`/weeks/${weekStart}/generate`, {
    method: "POST",
    body: JSON.stringify(daysPerWeek ? { daysPerWeek } : {}),
  });

export const selectMealsForWeek = (
  weekStart: string,
  selections: WeekSelection[],
  daysPerWeek?: number
) =>
  req<{ week: Week }>(`/weeks/${weekStart}/select`, {
    method: "POST",
    body: JSON.stringify({ selections, daysPerWeek }),
  });

export const skipWeekByStart = (weekStart: string) =>
  req<{ week: Week }>(`/weeks/${weekStart}/skip`, { method: "POST" });

export const getShoppingListForWeek = (weekStart: string) =>
  req<ShoppingList>(`/weeks/${weekStart}/shopping-list`);

// ── Current week (kept for legacy compat) ─────────────────────────────────

export const getCurrentWeek = () =>
  req<{ week: Week | null; candidates: Recipe[] }>("/weeks/current");

export const triggerGenerate = () =>
  req<{ week: Week }>("/weeks/current/generate", { method: "POST" });

export const selectMeals = (selections: WeekSelection[], daysPerWeek?: number) =>
  req<{ week: Week }>("/weeks/current/select", {
    method: "POST",
    body: JSON.stringify({ selections, daysPerWeek }),
  });

export const skipWeek = () =>
  req<{ week: Week }>("/weeks/current/skip", { method: "POST" });

export const getShoppingList = () =>
  req<ShoppingList>("/weeks/current/shopping-list");

// ── Recipes ────────────────────────────────────────────────────────────────

export const getRecipe = (id: string) => req<Recipe>(`/recipes/${id}`);

export const markCooked = (id: string, weekStart?: string) =>
  req<{ week: Week }>(`/recipes/${id}/cooked`, {
    method: "POST",
    body: JSON.stringify(weekStart ? { weekStart } : {}),
  });

export const submitRating = (
  id: string,
  stars: 1 | 2 | 3 | 4 | 5,
  makeAgain: boolean,
  notes?: string,
  weekStart?: string
) =>
  req(`/recipes/${id}/rating`, {
    method: "POST",
    body: JSON.stringify({
      stars,
      makeAgain,
      ...(notes ? { notes } : {}),
      ...(weekStart ? { weekStart } : {}),
    }),
  });
