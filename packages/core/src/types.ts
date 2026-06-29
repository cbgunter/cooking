export type MealType = "breakfast" | "lunch" | "dinner";
export type Equipment =
  | "stove"
  | "oven"
  | "grill"
  | "sous_vide"
  | "crockpot"
  | "dutch_oven"
  | "microwave"
  | "air_fryer";
export type CookStyle = "prep_ahead" | "cook_fresh";

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category: IngredientCategory;
  /** if true, this ingredient can be shared with other recipes in the same week */
  shareable?: boolean;
}

export type IngredientCategory =
  | "produce"
  | "protein"
  | "dairy"
  | "grains"
  | "pantry"
  | "frozen"
  | "condiments"
  | "beverages"
  | "other";

export interface Nutrition {
  calories: number;
  sodiumMg: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  mealType: MealType;
  cuisine: string;
  tags: string[];
  equipment: Equipment[];
  cookStyle: CookStyle;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: Ingredient[];
  /** Mise en place: all prep work before any heat is applied */
  prepSteps: string[];
  /** Mise en place: the cooking steps, run after all prep is done */
  cookSteps: string[];
  nutrition: Nutrition;
  /** estimated cost per serving in USD */
  costPerServing: number;
  /** notes on which ingredients can be reused across the week */
  reuseNotes?: string;
  /** AI-generated, not user-added */
  aiGenerated: boolean;
  createdAt: string;
}

export type WeekStatus =
  | "pending"
  | "selecting"
  | "shopping"
  | "cooking"
  | "done"
  | "skipped"
  | "error";

export interface MealCounts {
  breakfast: number;
  lunch: number;
  dinner: number;
}

export interface WeekSelection {
  recipeId: string;
  mealType: MealType;
  /** How many times this meal is planned (default 1) */
  quantity?: number;
}

export interface Week {
  id: string;
  /** ISO date of the Monday starting this week */
  weekStart: string;
  status: WeekStatus;
  daysPerWeek: number;
  /** Per-meal-type counts chosen by the user before generation */
  mealCounts?: MealCounts;
  candidateRecipeIds: string[];
  selections: WeekSelection[];
  cookedRecipeIds: string[];
  /** Per-user thumbs up/down votes on candidate recipes (email → recipeId → vote) */
  votes?: { [userEmail: string]: { [recipeId: string]: "up" | "down" } };
  /** Emails of users who have confirmed the final meal selections */
  confirmedBy?: string[];
  /** Human-readable reason set when status is "error" */
  errorMessage?: string;
  /** Set while a per-type top-up generation is in flight; cleared when done */
  topUpMealCounts?: MealCounts;
  /** ISO datetime */
  createdAt: string;
  updatedAt: string;
}

export interface Rating {
  id: string;
  recipeId: string;
  weekId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  makeAgain: boolean;
  ratedBy?: string;
  createdAt: string;
}

export interface HouseholdPreferences {
  /** how many people are eating */
  peopleCount: number;
  /** default number of days to plan; overrideable per week */
  defaultDaysPerWeek: number;
  /** ingredient names or cuisine types to avoid */
  dislikes: string[];
  /** cuisine types to prefer */
  cuisinePreferences: string[];
  /** per-meal cost cap in USD per person */
  costCaps: {
    breakfast: number;
    lunch: number;
    dinner: number;
  };
  /** nutritional constraints */
  nutrition: {
    maxCaloriesPerMeal: number;
    maxSodiumMgPerMeal: number;
  };
  /** in minutes */
  prepTimeRange: {
    minMinutes: number;
    maxMinutes: number;
  };
  /** preference for new recipes vs. favorites */
  adventureLevel: "adventurous" | "balanced" | "comfort";
  /** day of week for meal selection reminder (0=Sun..6=Sat) */
  reminderDayOfWeek: number;
  /** email address for reminders */
  notificationEmail: string;
  /** free-text description of what the household typically eats, used to ground generation */
  tasteProfile?: string;
}

export interface RecipeDownvoteEntry {
  userEmail: string;
  weekStart: string;
  timestamp: string;
}

export interface RecipeDownvote {
  /** Normalized (lowercase, trimmed) recipe title — used as the lookup key */
  title: string;
  /** Original title as shown in the UI */
  displayTitle: string;
  downvotes: RecipeDownvoteEntry[];
  updatedAt: string;
}

export interface ShoppingListItem {
  name: string;
  totalQuantity: number;
  unit: string;
  category: IngredientCategory;
  recipeIds: string[];
}

export interface ShoppingList {
  weekId: string;
  generatedAt: string;
  items: ShoppingListItem[];
}
