import type {
  Constraints, Day, MealCount, Meal, MealType, Recipe, Slot, Targets,
} from "./types";

// Бюджет — потолок цены одной порции блюда, ₽. Меняет НАБОР блюд, а не ₽/день:
// объём продуктов задаёт цель по белку (замерено в oheedet).
const BUDGET_MEAL_CAP: Record<string, number> = { small: 205, medium: 270, large: Infinity };

/**
 * Схемы числа приёмов пищи (X18 / продуктовый вывод C4).
 * Наука: число приёмов само по себе на вес почти не влияет — влияет регулярность времени
 * и ранний калораж. Поэтому это свободный выбор пользователя, а не предписание.
 *
 * `mains` — доли от калоража за вычетом сладкого и перекусов (в сумме 1).
 * `treatShare` — общая доля на сладкое и перекусы, `treatCount` — на сколько приёмов она делится.
 */
const SCHEMES: Record<MealCount, {
  mains: Partial<Record<MealType, number>>;
  treatShare: number;
  treatCount: number;
}> = {
  2: { mains: { lunch: 0.53, dinner: 0.47 },                          treatShare: 0.15, treatCount: 1 },
  3: { mains: { breakfast: 0.30, lunch: 0.40, dinner: 0.30 },         treatShare: 0,    treatCount: 0 },
  4: { mains: { breakfast: 0.30, lunch: 0.40, dinner: 0.30 },         treatShare: 0.12, treatCount: 1 },
  5: { mains: { breakfast: 0.30, lunch: 0.40, dinner: 0.30 },         treatShare: 0.12, treatCount: 2 },
};

export const DEFAULT_MEAL_COUNT: MealCount = 4;

/** Ритм суток: подъём и отбой. Отбой может быть >24:00 («27:00» = 3 ночи). */
export interface DayRhythm {
  wakeMin: number;
  bedMin: number;
}

/** Ужин ставится за 3 часа до отбоя — обоснование метаболическое (S-026), не «для сна» (X8). */
export const DINNER_BEFORE_BED_MIN = 180;

/**
 * Ожидаемый отбой по профилю: отсчёт НАЗАД от подъёма, а не вперёд.
 * Подъём 07:00 при цели сна 7:45 → лечь надо в 23:15 накануне, то есть в 1395-ю минуту суток.
 */
export function expectedBedMin(wakeMin: number, targetSleepMin: number): number {
  return wakeMin + 1440 - targetSleepMin;
}

/**
 * Времена приёмов пищи от ритма суток, а не из справочника.
 * Ужин привязан к отбою, завтрак к подъёму, остальное раскладывается между ними.
 */
export function mealTimes(
  rhythm: DayRhythm, count: MealCount, lateTreat = false,
): Partial<Record<Slot, number>> {
  const { mains, treatCount } = SCHEMES[count];
  const dinner = rhythm.bedMin - DINNER_BEFORE_BED_MIN;
  const first = rhythm.wakeMin + 30;
  const times: Partial<Record<Slot, number>> = { dinner: Math.round(dinner) };

  const hasBreakfast = mains.breakfast !== undefined;
  if (hasBreakfast) times.breakfast = Math.round(first);

  // обед — середина между первым приёмом и ужином; без завтрака сдвигается в первую треть
  const lunch = hasBreakfast ? (first + dinner) / 2 : first + (dinner - first) / 3;
  times.lunch = Math.round(lunch);

  // После плохой ночи сладкое переносится на вечер: оно уже вписано в норму и работает
  // как запланированная замена срыву, а не как добавка (B1).
  if (treatCount >= 1) {
    times.dessert = Math.round(lateTreat ? (dinner + rhythm.bedMin) / 2 : (lunch + dinner) / 2);
  }
  // второй перекус — в самый длинный оставшийся промежуток (до обеда)
  if (treatCount >= 2) times.snack = Math.round((first + lunch) / 2);

  return times;
}

/**
 * Сдвиг калоража в первую половину дня: завтрак и обед +5 п.п., ужин −10 п.п.
 * Применяется после плохой ночи (B1) — калораж при этом НЕ меняется, меняется распределение.
 */
function shiftEarlier(mains: Partial<Record<MealType, number>>): Partial<Record<MealType, number>> {
  const out = { ...mains };
  if (out.dinner === undefined) return out;
  out.dinner = out.dinner - 0.10;
  if (out.breakfast !== undefined) {
    out.breakfast += 0.05;
    out.lunch = (out.lunch ?? 0) + 0.05;
  } else {
    out.lunch = (out.lunch ?? 0) + 0.10;
  }
  return out;
}

export function filterRecipes(recipes: Recipe[], c: Constraints = {}): Recipe[] {
  const allergens = new Set(c.allergens ?? []);
  const dislikes = (c.dislikes ?? []).map(x => String(x).toLowerCase());
  const cookware = new Set(c.cookware ?? []);
  const cuisines = c.cuisines ?? [];
  const cap = BUDGET_MEAL_CAP[c.budget ?? ""] ?? Infinity;
  return recipes.filter(r => {
    if ((r.allergens ?? []).some(a => allergens.has(a as never))) return false;
    const hay = (r.name + " " + (r.tags ?? []).join(" ")).toLowerCase();
    // ponytail: обрезка окончания ловит русские словоформы (капуста→капустой); не полная морфология.
    if (dislikes.some(d => d && hay.includes(d.length > 5 ? d.slice(0, -2) : d))) return false;
    if ((r.cookware ?? []).some(w => !cookware.has(w))) return false;
    if ((r.cost_rub ?? 0) > cap) return false;
    // мягкий фильтр кухни: universal проходит всегда и покрывает все слоты → план не пустеет
    if (cuisines.length && r.cuisine !== "universal" && !cuisines.includes(r.cuisine as never)) return false;
    return true;
  });
}

function recomputeTotals(day: Day): void {
  let k = 0, p = 0, f = 0;
  for (const m of day.meals) {
    k += m.recipe.kcal * m.servings;
    p += m.recipe.protein_g * m.servings;
    f += m.recipe.fiber_g * m.servings;
  }
  day.totals = { kcal: Math.round(k), protein: Math.round(p), fiber: Math.round(f) };
}

export interface DayOptions {
  rhythm: DayRhythm;
  mealCount?: MealCount;
  offset?: number;              // двигает выбор рецептов: разнообразие по дням
  roughNight?: boolean;         // после плохой ночи: сдвиг калоража вперёд + позднее сладкое
}

/**
 * Один день: доли по выбранной схеме, времена — от ритма суток.
 * Сладкое вписано в дневную норму, поэтому не ломает дефицит.
 */
export function generateDay(targets: Targets, pool: Recipe[], opts: DayOptions): Day {
  const count = opts.mealCount ?? DEFAULT_MEAL_COUNT;
  const offset = opts.offset ?? 0;
  const scheme = SCHEMES[count];
  const byType = (t: MealType) => pool.filter(r => r.meal_type === t);

  const hasDesserts = byType("dessert").length > 0;
  const treatKcal = hasDesserts ? Math.round(targets.kcalTarget * scheme.treatShare) : 0;
  const mainTarget = targets.kcalTarget - treatKcal;
  const times = mealTimes(opts.rhythm, count, opts.roughNight);
  const mains = opts.roughNight ? shiftEarlier(scheme.mains) : scheme.mains;
  const meals: Meal[] = [];

  for (const [type, share] of Object.entries(mains) as [MealType, number][]) {
    const options = byType(type);
    const recipe = options[offset % options.length];
    if (!recipe) continue;
    const servings = Math.max(0.5, +((mainTarget * share) / recipe.kcal).toFixed(1));
    meals.push({ recipe, servings, timeMin: times[type as Slot] ?? 0, slot: type });
  }

  if (treatKcal > 0) {
    const desserts = byType("dessert");
    const perTreat = treatKcal / scheme.treatCount;
    const treatSlots: Slot[] = scheme.treatCount >= 2 ? ["dessert", "snack"] : ["dessert"];
    treatSlots.forEach((slot, i) => {
      const recipe = desserts[(offset + i) % desserts.length];
      if (!recipe) return;
      const servings = Math.max(0.5, +(perTreat / recipe.kcal).toFixed(1));
      meals.push({ recipe, servings, timeMin: times[slot] ?? 0, slot });
    });
  }

  const day: Day = { meals, totals: { kcal: 0, protein: 0, fiber: 0 } };
  recomputeTotals(day);
  swapForFiber(day, targets, pool, mains);
  addProteinTopUp(day, targets);
  day.meals.sort((a, b) => a.timeMin - b.timeMin);
  if (opts.roughNight) day.simplified = true;
  return day;
}

/**
 * Добор клетчатки ЗАМЕНОЙ блюда, а не увеличением порции.
 *
 * Планировщик выбирал рецепты по очереди и на клетчатку не смотрел вовсе — типичный день
 * выходил около 20 г при цели 30, хотя контента хватает с запасом (на текущих рецептах
 * можно набрать больше 50 г). Увеличивать порцию нельзя: это потащило бы калории вверх
 * и сломало дефицит. Поэтому меняем одно блюдо на более богатое клетчаткой в том же слоте
 * и пересчитываем порцию под ту же долю калорий — калораж дня не меняется.
 *
 * ponytail: одна замена, самая выгодная. Итеративный перебор — если одной перестанет хватать.
 */
function swapForFiber(
  day: Day, targets: Targets, pool: Recipe[], mains: Partial<Record<MealType, number>>,
): void {
  if (day.totals.fiber >= targets.fiberGTarget) return;

  let best: { index: number; recipe: Recipe; servings: number; gain: number } | null = null;

  day.meals.forEach((meal, index) => {
    const share = mains[meal.recipe.meal_type as MealType];
    if (share === undefined) return;                       // сладкое и перекусы не трогаем
    const kcalShare = meal.recipe.kcal * meal.servings;    // столько калорий занимает этот приём
    for (const candidate of pool) {
      if (candidate.meal_type !== meal.recipe.meal_type) continue;
      if (candidate.id === meal.recipe.id) continue;
      const servings = Math.max(0.5, +(kcalShare / candidate.kcal).toFixed(1));
      const gain = candidate.fiber_g * servings - meal.recipe.fiber_g * meal.servings;
      // белок не должен просесть ради клетчатки — это два разных рычага сытости
      const proteinDrop = meal.recipe.protein_g * meal.servings - candidate.protein_g * servings;
      if (gain > (best?.gain ?? 0) && proteinDrop <= 5) {
        best = { index, recipe: candidate, servings, gain };
      }
    }
  });

  if (!best) return;
  const chosen: { index: number; recipe: Recipe; servings: number } = best;
  const target = day.meals[chosen.index]!;
  day.meals[chosen.index] = { ...target, recipe: chosen.recipe, servings: chosen.servings };
  recomputeTotals(day);
}

/**
 * Добор белка — в самое белково-ПЛОТНОЕ блюдо (минимум лишних калорий) и не выше +8% цели.
 * Урок oheedet: добор по абсолюту раздувал день до +35% и ломал дефицит.
 */
function addProteinTopUp(day: Day, targets: Targets): void {
  if (day.totals.protein >= targets.proteinGTarget || !day.meals.length) return;
  const m = day.meals.reduce((a, b) =>
    b.recipe.protein_g / b.recipe.kcal > a.recipe.protein_g / a.recipe.kcal ? b : a);
  const room = Math.max(0, targets.kcalTarget * 1.08 - day.totals.kcal);
  const byProtein = (targets.proteinGTarget - day.totals.protein) / m.recipe.protein_g;
  const byKcal = room / m.recipe.kcal;
  const add = +Math.min(byProtein, byKcal).toFixed(1);
  if (add > 0) {
    m.servings = +(m.servings + add).toFixed(1);
    recomputeTotals(day);
  }
}

export interface WeekOptions extends Omit<DayOptions, "offset"> {
  constraints?: Constraints;
}

export function generateWeek(targets: Targets, recipes: Recipe[], opts: WeekOptions): Day[] {
  const pool = filterRecipes(recipes, opts.constraints ?? {});
  return Array.from({ length: 7 }, (_, d) => generateDay(targets, pool, { ...opts, offset: d }));
}

/** Заменить блюдо: следующий рецепт того же слота, порция под ту же долю калорий. */
export function swapDish(
  day: Day, mealIndex: number, targets: Targets, pool: Recipe[], count: MealCount = DEFAULT_MEAL_COUNT,
): boolean {
  const meal = day.meals[mealIndex];
  if (!meal) return false;
  const options = pool.filter(r => r.meal_type === meal.recipe.meal_type);
  if (options.length < 2) return false;
  const cur = options.findIndex(r => r.id === meal.recipe.id);
  const recipe = options[(cur + 1) % options.length];
  if (!recipe) return false;

  const scheme = SCHEMES[count];
  const isTreat = meal.slot === "dessert" || meal.slot === "snack";
  const treatKcal = Math.round(targets.kcalTarget * scheme.treatShare);
  const share = isTreat
    ? treatKcal / Math.max(1, scheme.treatCount)
    : (targets.kcalTarget - treatKcal) * (scheme.mains[meal.recipe.meal_type] ?? 0.3);

  day.meals[mealIndex] = {
    recipe,
    servings: Math.max(0.5, +(share / recipe.kcal).toFixed(1)),
    timeMin: meal.timeMin,
    slot: meal.slot,
  };
  day.meals.sort((a, b) => a.timeMin - b.timeMin);
  recomputeTotals(day);
  return true;
}
