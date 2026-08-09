import { costOf } from "./prices";
import { coverageOf, type Pantry } from "./packaging";
import type {
  Constraints, Day, MealCount, Meal, MealType, Recipe, Slot, Targets,
} from "./types";

/**
 * Бюджет — какую долю блюд КАЖДОГО приёма оставляем, считая от дешёвых.
 *
 * Раньше стоял потолок в рублях (205 / 270) и сверялся с полем `cost_rub` — той самой
 * «прикидкой на глаз», которую в 16-й волне признали выдумкой и заменили ценами магазина.
 * У новых рецептов поля просто нет, поэтому они проходили любой бюджет: выбор «небольшой»
 * мог выдать неделю ДОРОЖЕ свободного (замерено: 10004 ₽ против 7808 ₽). Теперь цена
 * порции считается по реальным ценам, а критерий относительный — как у упрощения дня:
 * он не ломается, когда рецепты добавляют, и не оставляет приём без выбора.
 */
const BUDGET_KEEP_SHARE: Record<string, number> = { small: 0.6, medium: 1, large: 1 };
const MIN_PER_SLOT = 3;              // меньше — планировщику нечем заменять блюдо
const KEEP_FIBER_TOP = 3;            // сколько богатых клетчаткой блюд слота бюджет не трогает

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

/** Цена порции по ценам магазина. `null` — ни одного продукта с известной ценой. */
export function portionCost(r: Recipe): number | null {
  let sum = 0, known = false;
  for (const i of r.ingredients ?? []) {
    const c = costOf(i.name, i.qty, i.unit);
    if (c !== null) { sum += c; known = true; }
  }
  return known ? Math.round(sum) : null;
}

/**
 * Бюджет: «небольшой» оставляет в каждом приёме блюда повыгоднее. Средний и свободный
 * не режут набор вовсе — «средний» это и есть обычный полный набор.
 *
 * Мерило — рубли на грамм белка, а не просто цена порции: дешёвая еда бывает пустой,
 * и при сортировке по цене белок падал до 73 г при цели 128. Но у самого этого мерила
 * есть обратная сторона — овощные блюда вылетают первыми, а с ними уходит клетчатка
 * (замерено: 15 г вместо 30). Поэтому три самых богатых клетчаткой блюда каждого приёма
 * остаются в наборе при любом бюджете.
 */
function applyBudget(rs: Recipe[], budget?: string): Recipe[] {
  const share = BUDGET_KEEP_SHARE[budget ?? ""] ?? 1;
  if (share >= 1) return rs;
  const perProtein = (r: Recipe): number => {
    const c = portionCost(r);
    return c === null ? Infinity : c / Math.max(1, r.protein_g);
  };
  const out: Recipe[] = [];
  for (const type of new Set(rs.map(r => r.meal_type))) {
    const ofType = rs.filter(r => r.meal_type === type);
    const cheap = [...ofType].sort((a, b) => perProtein(a) - perProtein(b))
      .slice(0, Math.max(MIN_PER_SLOT, Math.ceil(ofType.length * share)));
    const fibrous = [...ofType].sort((a, b) => b.fiber_g - a.fiber_g).slice(0, KEEP_FIBER_TOP);
    out.push(...new Set([...cheap, ...fibrous]));
  }
  return out;
}

export function filterRecipes(recipes: Recipe[], c: Constraints = {}): Recipe[] {
  const allergens = new Set(c.allergens ?? []);
  const dislikes = (c.dislikes ?? []).map(x => String(x).toLowerCase());
  const cookware = new Set(c.cookware ?? []);
  const cuisines = c.cuisines ?? [];
  const banned = new Set(c.bannedIds ?? []);
  const fit = recipes.filter(r => {
    // «палец вниз» — самый точный сигнал из всех: человек это блюдо уже видел и не хочет
    if (banned.has(r.id)) return false;
    if ((r.allergens ?? []).some(a => allergens.has(a as never))) return false;
    // состав тоже участвует: «нут» в названии есть не у всех блюд с нутом,
    // а человек, написавший «не люблю нут», имел в виду именно продукт
    const hay = [r.name, ...(r.tags ?? []), ...(r.ingredients ?? []).map(i => i.name)]
      .join(" ").toLowerCase();
    // ponytail: обрезка окончания ловит русские словоформы (капуста→капустой); не полная морфология.
    if (dislikes.some(d => d && hay.includes(d.length > 5 ? d.slice(0, -2) : d))) return false;
    if ((r.cookware ?? []).some(w => !cookware.has(w))) return false;
    // мягкий фильтр кухни: universal проходит всегда и покрывает все слоты → план не пустеет
    if (cuisines.length && r.cuisine !== "universal" && !cuisines.includes(r.cuisine as never)) return false;
    return true;
  });
  return applyBudget(fit, c.budget);
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
  familiar?: boolean;           // начало вхождения в дефицит: еда попривычнее (поплотнее)
  liked?: string[];             // id блюд с «пальцем вверх» — им отдаётся половина меню
  /**
   * Блюда, которые уже стоят в других днях недели.
   *
   * Раньше каждый день собирался независимо, и планировщик просто не знал, что вчера
   * был тот же обед. Все косвенные приёмы (чередование по дню, ротация кандидатов)
   * только маскировали это: замер на цели давал три разных обеда за неделю при шестидесяти
   * одном подходящем блюде. Если после исключения выбирать не из чего — ограничение
   * снимается: пустой приём хуже повтора.
   */
  avoid?: string[];
}

/**
 * Блюдо дня из списка своего типа.
 *
 * Раньше стояло `options[offset % options.length]`, то есть неделя брала ПЕРВЫЕ СЕМЬ блюд
 * списка. Пока их было двадцать, разницы не чувствовалось; когда стало тридцать, добавленные
 * рецепты просто не появлялись в меню — до них можно было добраться только кнопкой ↻.
 * Теперь семь дней раскладываются по всему списку с равным шагом, и новые блюда видны сразу.
 */
const pickForDay = (options: Recipe[], offset: number): Recipe | undefined =>
  options[Math.round((offset * options.length) / 7) % options.length];

/**
 * Блюда, у которых порция примерно равна доле калорий этого приёма.
 *
 * Иначе планировщик добирает калории множителем порции, и в меню появляется
 * «крем-суп из брокколи ×3.4» — формально 600 ккал, на деле полтора литра супа.
 * Ровно та еда, из-за которой правильное питание выглядит как «весь день овощи».
 * Берём тех, кто укладывается в 0.6–1.6 порции; если таких нет — весь список,
 * потому что оставить приём пустым хуже.
 */
const FIT_MIN = 0.6, FIT_MAX = 1.6;
/** Потолок порции при доборе белка: полторы порции ещё еда, три — уже добавка. */
const PORTION_MAX = 2;
const ROUGH_FIT_MIN = 0.5, ROUGH_FIT_MAX = 2;

/**
 * Сколько блюд должно остаться в приёме, чтобы неделя не приелась.
 *
 * Семь — по числу дней. Меньше — и одно и то же блюдо неизбежно повторится дважды,
 * а Сердар сказал ровно это: «блюда каждый день почти одни и те же».
 */
const MIN_CHOICES = 7;

/**
 * Блюда, у которых порция примерно равна доле калорий этого приёма.
 *
 * Иначе планировщик добирает калории множителем порции, и в меню появляется
 * «крем-суп из брокколи ×3.4» — формально 600 ккал, на деле полтора литра супа.
 *
 * Рамка РАСТЯГИВАЕТСЯ, пока в приёме не наберётся семь блюд. Жёсткие 0.6–1.6 хорошо
 * работали при четырёх приёмах в день, но на двух приём стоит уже 1100 ккал, и таких
 * блюд в наборе единицы: замер показал два разных обеда на всю неделю. Лучше слегка
 * увеличить порцию знакомого блюда, чем месяц есть одно и то же.
 */
function fittingOptions(options: Recipe[], slotKcal: number, wide = false): Recipe[] {
  let lo = wide ? ROUGH_FIT_MIN : FIT_MIN, hi = wide ? ROUGH_FIT_MAX : FIT_MAX;
  const within = () => options.filter(r => {
    const s = slotKcal / r.kcal;
    return s >= lo && s <= hi;
  });
  let fit = within();
  /*
   * Растягиваем в основном ВВЕРХ — то есть разрешаем взять блюдо поменьше и положить
   * побольше. Вниз опускать нельзя ниже половины порции: минимальная порция и так
   * обрезана снизу на 0.5, и блюдо вдвое крупнее слота даёт перебор по калориям.
   * Тесты поймали это сразу: день после плохой ночи вылез на 1920 ккал при норме 1836.
   */
  for (let step = 0; step < 4 && fit.length < MIN_CHOICES; step++) {
    lo = Math.max(0.5, lo * 0.9);
    hi *= 1.15;
    fit = within();
  }
  return fit.length ? fit : options;
}

/**
 * Основной приём — это еда, а не гарнир.
 *
 * Планировщик брал блюда по разнообразию и на белок в самом блюде не смотрел: на узком
 * наборе (одна плита, ограничения) в обед мог попасть овощной салат, а в ужин каша —
 * и день выходил на 87 г белка при цели 120. Поэтому в обед и ужин сначала ищутся блюда,
 * которые сами по себе дают заметный белок, и только если таких нет — берётся что есть.
 */
const PROTEIN_MIN: Partial<Record<MealType, number>> = { lunch: 25, dinner: 25, breakfast: 15 };
function proteinRich(options: Recipe[], type: MealType, servingsOf: (r: Recipe) => number): Recipe[] {
  const min = PROTEIN_MIN[type];
  if (min === undefined) return options;
  const rich = options.filter(r => r.protein_g * servingsOf(r) >= min);
  return rich.length ? rich : options;
}

/** Цена приготовления: сложность и время в одной шкале, шаг сложности ≈ полчаса готовки. */
export const effortOf = (r: Recipe): number => (r.difficulty ?? 1) * 30 + (r.time_min ?? 0);

/**
 * После плохой ночи из подходящих блюд остаются три самых простых.
 *
 * Сужать пул заранее мало: сначала отбираются блюда, чья порция совпадает с долей калорий,
 * и среди них «самое простое» может оказаться сорокапятиминутным. Тогда упрощённый день
 * выходил длиннее обычного на те самые пару минут, которые ломают обещание.
 */
const EASY_KEEP = 3;
const easiest = (options: Recipe[]): Recipe[] =>
  [...options].sort((a, b) => effortOf(a) - effortOf(b)).slice(0, EASY_KEEP);

/**
 * Привычная еда в начале вхождения в дефицит: верхняя половина набора по плотности энергии.
 *
 * Пока калораж почти не срезан, лёгкое блюдо приходится увеличивать до горы еды — а человек
 * пришёл не за этим. Половина, а не «три самых плотных», чтобы неделя не выродилась в три
 * блюда: выбор дня всё равно идёт по всему оставшемуся списку.
 */
const denser = (options: Recipe[]): Recipe[] => {
  if (options.length <= MIN_CHOICES) return options;
  const sorted = [...options].sort((a, b) => (b.energy_density ?? 0) - (a.energy_density ?? 0));
  // половина набора, но не меньше недельной нормы разнообразия
  return sorted.slice(0, Math.max(MIN_CHOICES, Math.ceil(sorted.length / 2)));
};

/**
 * Любимые блюда — примерно половина меню, а не всё подряд.
 *
 * Соблазн был отдать понравившимся всё: человек же сам их отметил. Но тогда набор схлопывается
 * до нескольких блюд, приедается за неделю, и оценка «нравится» превращается в наказание.
 * Поэтому чередуем по дням: чётные дни берут из любимых, нечётные — из всего набора,
 * куда любимые тоже входят. Никакой случайности — план должен собираться одинаково
 * при каждом открытии экрана.
 */
/** Убрать то, что уже стоит в других днях; если не остаётся ничего — вернуть как было. */
function dropUsed(options: Recipe[], avoid: string[] | undefined): Recipe[] {
  if (!avoid?.length) return options;
  const fresh = options.filter(r => !avoid.includes(r.id));
  return fresh.length ? fresh : options;
}

function preferLiked(options: Recipe[], liked: string[] | undefined, offset: number): Recipe[] {
  if (!liked?.length || offset % 2 !== 0) return options;
  const mine = options.filter(r => liked.includes(r.id));
  return mine.length ? mine : options;
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
    const slotKcal = mainTarget * share;
    // после плохой ночи рамка по размеру порции шире: важнее найти блюдо побыстрее
    const fit = fittingOptions(byType(type), slotKcal, opts.roughNight);
    const good = proteinRich(fit, type, r => Math.max(0.5, +(slotKcal / r.kcal).toFixed(1)));
    // после плохой ночи простота важнее привычности: усилия сегодня взять неоткуда
    const narrowed = opts.roughNight ? easiest(good) : opts.familiar ? denser(good) : good;
    const recipe = pickForDay(dropUsed(preferLiked(narrowed, opts.liked, offset), opts.avoid), offset);
    if (!recipe) continue;
    const servings = Math.max(0.5, +(slotKcal / recipe.kcal).toFixed(1));
    meals.push({ recipe, servings, timeMin: times[type as Slot] ?? 0, slot: type });
  }

  if (treatKcal > 0) {
    const desserts = byType("dessert");
    const perTreat = treatKcal / scheme.treatCount;
    const treatSlots: Slot[] = scheme.treatCount >= 2 ? ["dessert", "snack"] : ["dessert"];
    // при пяти приёмах сладких слотов два, и оба берут из одного пула: без этого списка
    // перекус и десерт одного дня могли оказаться одним и тем же блюдом
    const taken: string[] = [];
    treatSlots.forEach((slot, i) => {
      // сладкое тоже подбирается по размеру порции: иначе в план попадает «десерт ×3.5»
      const fitDesserts = dropUsed(
        preferLiked(fittingOptions(desserts, perTreat, opts.roughNight), opts.liked, offset),
        [...(opts.avoid ?? []), ...taken],
      );
      const recipe = fitDesserts[(offset + i) % fitDesserts.length];
      if (!recipe) return;
      taken.push(recipe.id);
      const servings = Math.max(0.5, +(perTreat / recipe.kcal).toFixed(1));
      meals.push({ recipe, servings, timeMin: times[slot] ?? 0, slot });
    });
  }

  const day: Day = { meals, totals: { kcal: 0, protein: 0, fiber: 0 } };
  recomputeTotals(day);
  /*
   * Вторая замена ради клетчатки отменяется, когда день собран «привычной» едой:
   * замены тянут набор к овощному, и в замере плотность падала НИЖЕ обычного дня —
   * то есть механика входа в режим работала против себя же.
   */
  swapForFiber(day, targets, pool, mains, offset, opts.roughNight || opts.familiar ? 1 : 2, opts.liked ?? [], !!opts.roughNight, opts.avoid ?? []);
  swapForProtein(day, targets, pool, mains, offset, opts.liked ?? [], !!opts.roughNight, opts.avoid ?? []);
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
 * Замена ЧЕРЕДУЕТСЯ по дням. Когда бралась строго лучшая по клетчатке, неделя получала
 * одно и то же блюдо трижды: выбор не зависел от дня, и «Тунец-боул с фасолью» вставал
 * в понедельник, среду и четверг. Теперь из нескольких лучших вариантов берётся тот,
 * что приходится на этот день, — клетчатка добирается так же, а меню не приедается.
 *
 * Замен до двух — но только в обычный день. В упрощённый (после плохой ночи) вторая
 * замена вытаскивала блюдо подольше и ломала обещание «сегодня готовки меньше»,
 * а это обещание важнее лишних граммов клетчатки. Каждый приём трогается не больше раза.
 */
function swapForFiber(
  day: Day, targets: Targets, pool: Recipe[], mains: Partial<Record<MealType, number>>,
  offset = 0, maxPasses = 2, liked: string[] = [], keepEasy = false, avoid: string[] = [],
): void {
  const touched = new Set<number>();
  for (let pass = 0; pass < maxPasses && day.totals.fiber < targets.fiberGTarget; pass++) {
  const candidates: { index: number; recipe: Recipe; servings: number; gain: number }[] = [];

  day.meals.forEach((meal, index) => {
    const share = mains[meal.recipe.meal_type as MealType];
    if (share === undefined || touched.has(index)) return;  // сладкое и уже заменённое не трогаем
    // блюдо, которое человек отметил «нравится», автоматика не выкидывает: он поставил его сам,
    // и молча подменить его ради пары граммов клетчатки — значит обесценить его выбор
    if (liked.includes(meal.recipe.id)) return;
    const kcalShare = meal.recipe.kcal * meal.servings;    // столько калорий занимает этот приём
    for (const candidate of pool) {
      if (candidate.meal_type !== meal.recipe.meal_type) continue;
      if (candidate.id === meal.recipe.id) continue;
      if (avoid.includes(candidate.id)) continue;   // это блюдо уже есть в другом дне недели
      const servings = Math.max(0.5, +(kcalShare / candidate.kcal).toFixed(1));
      // порция остаётся порцией: иначе замена подсовывает «крем-суп ×3.4» — полтора литра супа
      if (servings > FIT_MAX) continue;
      // и не раздувает приём: порция обрезана снизу на 0.5, поэтому блюдо вдвое крупнее слота
      // всё равно вошло бы — и день вылезал за норму (замер: 1920 ккал при цели 1700)
      if (candidate.kcal * servings > kcalShare * 1.05) continue;
      // в упрощённый день замена не имеет права добавить работы: обещание «сегодня готовки
      // меньше» важнее пары граммов клетчатки (замер: 68 минут против 65 у обычного дня)
      if (keepEasy && effortOf(candidate) > effortOf(meal.recipe)) continue;
      const gain = candidate.fiber_g * servings - meal.recipe.fiber_g * meal.servings;
      // белок не должен просесть ради клетчатки — это два разных рычага сытости.
      // На второй замене допуск нулевой: две уступки по 5 г подряд роняли день ниже цели.
      const proteinDrop = meal.recipe.protein_g * meal.servings - candidate.protein_g * servings;
      if (gain > 0 && proteinDrop <= (pass === 0 ? 5 : 0)) {
        candidates.push({ index, recipe: candidate, servings, gain });
      }
    }
  });

  if (!candidates.length) return;
  candidates.sort((a, b) => b.gain - a.gain);
  /*
   * Чередуем среди тех, кто доводит клетчатку до цели; если таких нет — среди лучших.
   *
   * Ширина выбора была четыре, и этого не хватало: при двух приёмах в день цель
   * в 30 г клетчатки одной заменой недостижима в принципе, ветка «лучших» работает
   * каждый день и ставила одни и те же блюда — замер показал три разных обеда на неделю
   * при девятнадцати подходящих. Отсюда и жалоба «каждый день одно и то же».
   * Номер прохода добавлен в сдвиг, чтобы вторая замена не била в то же место.
   */
  const enough = candidates.filter(c => day.totals.fiber + c.gain >= targets.fiberGTarget);
  const pick = enough.length ? enough : candidates;
  /*
   * Чередуем не только блюдо, но и САМ ПРИЁМ, в который лезем.
   *
   * Раньше кандидаты просто сортировались по приросту клетчатки — и побеждал всегда обед,
   * потому что он крупнее и даёт больший прирост. В итоге обед подменялся каждый день,
   * и на цели выходило три разных обеда за неделю при шестидесяти одном подходящем блюде.
   * Теперь день выбирает приём по кругу, а внутри него — лучшую замену.
   */
  const slots = [...new Set(pick.map(c => c.index))];
  const slot = slots[(offset + pass) % slots.length]!;
  const inSlot = pick.filter(c => c.index === slot);
  const chosen = inSlot[Math.floor(offset / slots.length) % inSlot.length]!;
  const target = day.meals[chosen.index]!;
  day.meals[chosen.index] = { ...target, recipe: chosen.recipe, servings: chosen.servings };
  touched.add(chosen.index);
  recomputeTotals(day);
  }
}

/**
 * Добор белка ЗАМЕНОЙ блюда — когда порцией уже не помочь.
 *
 * Увеличение порции упирается в калораж: если день собрался из некрепких по белку блюд
 * (а так бывает, когда человек исключает курицу или молочное), он застревает на 89 г
 * при цели 120. Тогда меняем самый слабый основной приём на белковый в том же слоте
 * и с той же долей калорий — ровно как добор клетчатки, только рычаг другой.
 */
function swapForProtein(
  day: Day, targets: Targets, pool: Recipe[], mains: Partial<Record<MealType, number>>,
  offset = 0, liked: string[] = [], keepEasy = false, avoid: string[] = [],
): void {
  if (day.totals.protein >= targets.proteinGTarget * 0.85) return;

  const candidates: { index: number; recipe: Recipe; servings: number; gain: number }[] = [];
  day.meals.forEach((meal, index) => {
    if (mains[meal.recipe.meal_type as MealType] === undefined) return;   // сладкое не трогаем
    if (liked.includes(meal.recipe.id)) return;                           // любимое не подменяем
    const kcalShare = meal.recipe.kcal * meal.servings;
    for (const candidate of pool) {
      if (candidate.meal_type !== meal.recipe.meal_type || candidate.id === meal.recipe.id) continue;
      if (avoid.includes(candidate.id)) continue;                   // уже стоит в другом дне
      const servings = Math.max(0.5, +(kcalShare / candidate.kcal).toFixed(1));
      if (servings > FIT_MAX) continue;
      if (candidate.kcal * servings > kcalShare * 1.05) continue;   // замена не раздувает приём
      if (keepEasy && effortOf(candidate) > effortOf(meal.recipe)) continue;   // и не добавляет готовки
      const gain = candidate.protein_g * servings - meal.recipe.protein_g * meal.servings;
      // клетчатку ради белка тоже не роняем: оба рычага нужны
      const fiberDrop = meal.recipe.fiber_g * meal.servings - candidate.fiber_g * servings;
      if (gain > 0 && fiberDrop <= 3) candidates.push({ index, recipe: candidate, servings, gain });
    }
  });

  if (!candidates.length) return;
  /*
   * Чередуем по дням, а не берём каждый раз строго лучшее.
   *
   * Строгий максимум и был причиной жалобы «блюда каждый день почти одни и те же»:
   * при двух-трёх приёмах белка нужно много, добор срабатывает почти каждый день
   * и всегда подставляет ОДНО И ТО ЖЕ самое белковое блюдо. Замер: три разных обеда
   * на неделю. Берём из нескольких лучших тот, что приходится на этот день, —
   * белок добирается так же, а меню перестаёт повторяться.
   */
  candidates.sort((a, b) => b.gain - a.gain);
  const top = candidates.slice(0, MIN_CHOICES);
  const chosen = top[offset % top.length]!;
  const target = day.meals[chosen.index]!;
  day.meals[chosen.index] = { ...target, recipe: chosen.recipe, servings: chosen.servings };
  recomputeTotals(day);
}

/**
 * Добор белка порцией — в самое белково-ПЛОТНОЕ блюдо (минимум лишних калорий) и не выше +8% цели.
 * Урок oheedet: добор по абсолюту раздувал день до +35% и ломал дефицит.
 */
function addProteinTopUp(day: Day, targets: Targets): void {
  if (day.totals.protein >= targets.proteinGTarget || !day.meals.length) return;
  const m = day.meals.reduce((a, b) =>
    b.recipe.protein_g / b.recipe.kcal > a.recipe.protein_g / a.recipe.kcal ? b : a);
  const room = Math.max(0, targets.kcalTarget * 1.08 - day.totals.kcal);
  const byProtein = (targets.proteinGTarget - day.totals.protein) / m.recipe.protein_g;
  const byKcal = room / m.recipe.kcal;
  // добор тоже не должен раздувать порцию: «×3.5» — это уже не порция, а добавка
  const room2 = Math.max(0, PORTION_MAX - m.servings);
  const add = +Math.min(byProtein, byKcal, room2).toFixed(1);
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
  // неделя помнит, что уже стояло: иначе дни собираются независимо и повторяются
  const used: string[] = [];
  return Array.from({ length: 7 }, (_, d) => {
    const day = generateDay(targets, pool, { ...opts, offset: d, avoid: [...used] });
    for (const m of day.meals) used.push(m.recipe.id);
    return day;
  });
}

/** Насколько блюдо собирается из домашних запасов — при пустой кладовке всегда 0. */
const homeShare = (r: Recipe, slotKcal: number, pantry: Pantry): number =>
  coverageOf(r.ingredients ?? [], pantry, Math.max(0.5, +(slotKcal / r.kcal).toFixed(1))).share;

/**
 * Кого предложить вместо текущего блюда.
 *
 * С кладовкой — самое «домашнее» из подходящих по размеру порции; при равенстве
 * (обычный случай — кладовка пуста) остаётся прежний обход по кругу, чтобы повторные
 * нажатия ↻ перебирали набор, а не возвращали одно и то же.
 */
function pickReplacement(
  options: Recipe[], current: Recipe, slotKcal: number, pantry?: Pantry,
): Recipe | undefined {
  const others = options.filter(r => r.id !== current.id);
  if (!others.length) return undefined;

  if (pantry && Object.keys(pantry).length) {
    const fit = fittingOptions(others, slotKcal);
    const best = fit.reduce((a, b) => (homeShare(b, slotKcal, pantry) > homeShare(a, slotKcal, pantry) ? b : a));
    if (homeShare(best, slotKcal, pantry) > 0) return best;
  }

  const cur = options.findIndex(r => r.id === current.id);
  return options[(cur + 1) % options.length] ?? others[0];
}

/**
 * Заменить блюдо: другой рецепт того же слота, порция под ту же долю калорий.
 *
 * Если передана кладовка, замена в первую очередь предлагает то, что можно приготовить
 * из уже купленного: ходить в магазин ради одной замены — ровно та мелочь, из-за которой
 * человек вместо готовки заказывает доставку. Без кладовки поведение прежнее —
 * следующий рецепт по кругу, чтобы кнопка ↻ оставалась предсказуемой.
 */
export function swapDish(
  day: Day, mealIndex: number, targets: Targets, pool: Recipe[], count: MealCount = DEFAULT_MEAL_COUNT,
  pantry?: Pantry,
): boolean {
  const meal = day.meals[mealIndex];
  if (!meal) return false;
  const options = pool.filter(r => r.meal_type === meal.recipe.meal_type);
  if (options.length < 2) return false;

  const scheme = SCHEMES[count];
  const isTreat = meal.slot === "dessert" || meal.slot === "snack";
  const treatKcal = Math.round(targets.kcalTarget * scheme.treatShare);
  const share = isTreat
    ? treatKcal / Math.max(1, scheme.treatCount)
    : (targets.kcalTarget - treatKcal) * (scheme.mains[meal.recipe.meal_type] ?? 0.3);

  const recipe = pickReplacement(options, meal.recipe, share, pantry);
  if (!recipe) return false;

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
