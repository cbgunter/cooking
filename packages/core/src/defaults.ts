import type { HouseholdPreferences } from "./types.js";

export const DEFAULT_PREFERENCES: HouseholdPreferences = {
  peopleCount: 2,
  defaultDaysPerWeek: 5,
  equipment: ["stove", "oven", "grill", "crockpot", "dutch_oven"],
  dislikes: [],
  cuisinePreferences: [],
  costCaps: {
    breakfast: 5,
    lunch: 7,
    dinner: 10,
  },
  nutrition: {
    maxCaloriesPerMeal: 700,
    maxSodiumMgPerMeal: 800,
  },
  prepTimeRange: {
    minMinutes: 20,
    maxMinutes: 45,
  },
  adventureLevel: "balanced",
  reminderDayOfWeek: 4, // Thursday
  notificationEmail: "",
};
