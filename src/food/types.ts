export type Sex = "m" | "f";
export type Activity = "low" | "medium" | "high";
export type Budget = "small" | "medium" | "large";
export type MealType = "breakfast" | "lunch" | "dinner" | "dessert";
export type Cuisine = "universal" | "mediterranean" | "asian" | "middleeast" | "slavic";
export type Allergen = "milk" | "egg" | "fish" | "gluten" | "nuts" | "soy";
export type Condition = "thyroid" | "pcos" | "psych_meds";

export interface FoodProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number;
  activity: Activity;          // образ жизни, НЕ спорт
}

export interface Constraints {
  allergens?: Allergen[];
  cookware?: string[];         // "stove","oven","microwave",… (13 значений)
  budget?: Budget;
  cuisines?: Cuisine[];        // пусто = все
  dislikes?: string[];         // свободный ввод
}

export interface Screen {
  conditions?: Condition[];
  scoffScore?: number;         // 0..5 — число «да» в SCOFF
  nesFlagged?: boolean;        // синдром ночного питания (X21)
}

export interface Targets {
  bmr: number;
  tdee: number;
  kcalTarget: number;
  proteinGTarget: number;
  fiberGTarget: number;
  tempoKgPerWeek: number;      // ≤1
}

export interface SafeTargets extends Targets {
  flags: string[];             // "kcal_floored","deficit_softened","screen_eating_disorder",…
  referDoctor: boolean;
}

export interface Ingredient {
  name: string;
  qty: number;
  unit: string;
  category: string;
  costTier?: string;
}

export interface Recipe {
  id: string;
  name: string;
  meal_type: MealType;
  cuisine?: Cuisine;
  kcal: number;
  protein_g: number;
  fiber_g: number;             // всё — НА ПОРЦИЮ
  energy_density?: number;     // ккал/г — рычаг сытости
  cost_tier?: string;
  cost_rub?: number;           // прикидка, НЕ калибровано под магазин
  cookware?: string[];
  allergens?: string[];        // структурные теги, не текст
  tags?: string[];
  difficulty?: 1 | 2 | 3;
  time_min?: number;
  ingredients?: Ingredient[];
  steps?: string[];
  /** Откуда рецепт: ссылка на источник. Пусто — рецепт написан для приложения. */
  source?: string;
}

export type Slot = "breakfast" | "lunch" | "dinner" | "dessert" | "snack";

export interface Meal {
  recipe: Recipe;
  servings: number;            // множитель порции, напр. 1.3
  timeMin: number;             // минуты от 00:00; вычисляется от подъёма и отбоя, может быть >1440
  slot: Slot;
}

/** Сколько приёмов пищи в дне. Выбор пользователя: на вес почти не влияет (X18). */
export type MealCount = 2 | 3 | 4 | 5;

export interface Day {
  meals: Meal[];
  totals: { kcal: number; protein: number; fiber: number };
  simplified?: boolean;        // день перестроен после плохой ночи (X24)
}

export interface GroceryItem {
  name: string;
  unit: string;
  qty: number;
  category: string;
  perishable: boolean;
}

export interface Grocery {
  items: GroceryItem[];
  estCostRub: number;
  byDay: { day: number; items: GroceryItem[]; estCostRub: number; hasPerishable: boolean }[];
}
