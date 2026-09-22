import type { Day, Slot } from "./types";

/**
 * Факт против плана: что человек на самом деле съел.
 *
 * До этого у приложения был только план. Из-за этого «почему вес стоит» опиралось на догадку:
 * `plateau.ts` умеет отличать «еда течёт» от «сон течёт», но поле `food.followed` не заполнял
 * никто — ветка про еду не могла сработать ни разу. Приверженность считалась по отметкам сна,
 * то есть про еду приложение честно ничего не знало.
 *
 * Отметок две, и вторая важна не меньше первой: «съел» и «заменил на своё». Без второй
 * пропущенный приём и своя еда сливаются в один «провал», а это разные вещи —
 * человек, который поел по-своему, не сорвался, он просто поел.
 */

export type MealMark = "ate" | "own";

/**
 * Сколько примерно съедено своей еды — относительно плановой порции.
 *
 * До этого «своё» считалось нулём: кольца показывали меньше, чем человек съел, и чем
 * честнее он отмечал, тем сильнее врала сводка. Точное число он всё равно не знает,
 * а «лёгкое / как в плане / плотное» ответит за секунду.
 */
export type OwnSize = "light" | "usual" | "big";
/** Еда, записанная словами, и прикидка калорий к ней. */
export interface WrittenFood { text: string; kcal: number; protein: number }
export const OWN_FACTOR: Record<OwnSize, number> = { light: 0.6, usual: 1, big: 1.5 };

export interface DayEaten {
  /** Слот → что с ним стало. Слот в дне один, поэтому его хватает как ключа. */
  marks: Partial<Record<Slot, MealMark>>;
  /** Размер своей еды по слотам. Нет записи — «как в плане». */
  sizes?: Partial<Record<Slot, OwnSize>>;
  /**
   * Калорийность плана этого дня в момент первой отметки. Норма потом может поменяться —
   * по реальному расходу, — а съедено было по тогдашней: без этого поправка нормы задним
   * числом «переписывала» прошлое, и оценка расхода падала ровно на величину поправки.
   */
  dayKcal?: number;
  /** Своя еда, описанная словами, — точнее, чем «лёгкое / плотное». Прикидка коуча. */
  ownText?: Partial<Record<Slot, WrittenFood>>;
  /** Съеденное вне плана, записанное словами («шаурма и кола»): калории — прикидка коуча. */
  extras?: WrittenFood[];
  /** Сколько приёмов было в плане в момент отметки. Хранится, чтобы доля не поехала,
   *  когда человек потом сменит схему питания с четырёх приёмов на два. */
  planned: number;
}

/** Отметить приём. Повторное нажатие той же отметкой снимает её — это же переключатель. */
export function toggleMark(cur: DayEaten | undefined, slot: Slot, mark: MealMark, planned: number, dayKcal?: number): DayEaten {
  const marks = { ...(cur?.marks ?? {}) };
  if (marks[slot] === mark) delete marks[slot];
  else marks[slot] = mark;
  // размер относится только к своей еде: сменили отметку — старый размер не должен всплыть
  const sizes = { ...(cur?.sizes ?? {}) };
  const ownText = { ...(cur?.ownText ?? {}) };
  if (marks[slot] !== "own") { delete sizes[slot]; delete ownText[slot]; }
  const kcal = cur?.dayKcal ?? dayKcal;
  return { ...cur, marks, sizes, ownText, planned: cur?.planned ?? planned, ...(kcal ? { dayKcal: kcal } : {}) };
}

/** «Весь день по плану» — одной кнопкой вместо пяти. Уже отмеченное не трогаем:
 *  если обед был своим, вечерняя кнопка не имеет права переписать это в «съел». */
export function markAllAte(cur: DayEaten | undefined, slots: Slot[], planned: number, dayKcal?: number): DayEaten {
  const marks = { ...(cur?.marks ?? {}) };
  for (const s of slots) marks[s] ??= "ate";
  const kcal = cur?.dayKcal ?? dayKcal;
  return { ...cur, marks, planned: cur?.planned ?? planned, ...(kcal ? { dayKcal: kcal } : {}) };
}

export function setOwnSize(cur: DayEaten, slot: Slot, size: OwnSize): DayEaten {
  // выбранный размер важнее прежнего описания: человек передумал, как это считать
  const ownText = { ...(cur.ownText ?? {}) };
  delete ownText[slot];
  return { ...cur, sizes: { ...(cur.sizes ?? {}), [slot]: size }, ownText };
}

export function setOwnText(cur: DayEaten, slot: Slot, food: WrittenFood): DayEaten {
  return { ...cur, ownText: { ...(cur.ownText ?? {}), [slot]: food } };
}

export function addExtra(cur: DayEaten | undefined, food: WrittenFood, planned: number): DayEaten {
  return { marks: {}, ...cur, planned: cur?.planned ?? planned, extras: [...(cur?.extras ?? []), food] };
}

export function removeExtra(cur: DayEaten, index: number): DayEaten {
  return { ...cur, extras: (cur.extras ?? []).filter((_, i) => i !== index) };
}

export interface EatenTotals {
  kcal: number;
  protein: number;
  /** Клетчатка тоже по факту: три кольца дня должны говорить об одном и том же. */
  fiber: number;
  /** Сколько приёмов отмечено «съел» — не считая заменённых своим. */
  ate: number;
  /** В сумме есть своя еда — её калории прикинуты, а не посчитаны. Показывается как «≈». */
  estimated: boolean;
  marked: number;
}

/** Сколько съедено: по плану — точно, своё — прикидкой от плановой порции. */
export function eatenTotals(day: Day, eaten: DayEaten | undefined): EatenTotals {
  let kcal = 0, protein = 0, fiber = 0, ate = 0, marked = 0, estimated = false;
  for (const m of day.meals) {
    const mark = eaten?.marks[m.slot];
    if (!mark) continue;
    marked++;
    if (mark === "own") {
      // своя еда — описанная словами или прикидка от плановой порции; клетчатку не выдумываем
      const written = eaten?.ownText?.[m.slot];
      const k = OWN_FACTOR[eaten?.sizes?.[m.slot] ?? "usual"];
      kcal += written ? written.kcal : m.recipe.kcal * m.servings * k;
      protein += written ? written.protein : m.recipe.protein_g * m.servings * k;
      estimated = true;
      continue;
    }
    ate++;
    kcal += m.recipe.kcal * m.servings;
    protein += m.recipe.protein_g * m.servings;
    fiber += m.recipe.fiber_g * m.servings;
  }
  // записанное словами вне плана — тоже прикидка
  for (const x of eaten?.extras ?? []) { kcal += x.kcal; protein += x.protein; estimated = true; }
  return { kcal: Math.round(kcal), protein: Math.round(protein), fiber: Math.round(fiber), ate, marked, estimated };
}

/** Доля дня, пройденная по плану. Нужна порогу «день засчитан» и разбору плато. */
const FOLLOWED_SHARE = 0.6;

/**
 * Считать ли день пройденным по плану.
 *
 * Порог, а не «всё или ничего»: три приёма из четырёх по плану — это соблюдённый день,
 * а не провал, и обратное отбивает желание отмечать вовсе. `undefined` — день не трогали,
 * и делать вид, что это провал, нельзя: у отсутствия данных нет знака.
 */
export function followedPlan(eaten: DayEaten | undefined): boolean | undefined {
  if (!eaten || !eaten.planned) return undefined;
  const ate = Object.values(eaten.marks).filter(m => m === "ate").length;
  const own = Object.values(eaten.marks).filter(m => m === "own").length;
  if (ate + own === 0) return undefined;
  return ate / eaten.planned >= FOLLOWED_SHARE;
}

/**
 * День подстраивается под то, что уже съедено.
 *
 * План на утро не знает, что обед оказался плотнее или завтрак пропал. Без этого человек,
 * съевший на обед вдвое больше, получал вечером тот же полный ужин — и либо перебирал,
 * либо бросал план как «уже всё равно сорвался». Поправка идёт мягко: порции оставшихся
 * приёмов меняются не больше чем на 30% — ужин в полпорции уже не ужин.
 *
 * Непомеченные приёмы ДО последней отметки считаются съеденными по плану: скорее всего
 * их просто забыли отметить, а считать их пропуском значило бы раздуть вечер.
 *
 * ponytail: отмеченный «съел» приём считается по плановой порции, даже если перед этим
 * её уменьшили — хранить порцию в момент отметки, если расхождение станет заметным.
 */
const REBALANCE_MIN = 0.7, REBALANCE_MAX = 1.3, REBALANCE_STEP = 0.1;

export function rebalance(day: Day, eaten: DayEaten | undefined): { day: Day; noteRU?: string } {
  const marks = eaten?.marks ?? {};
  const lastMarked = day.meals.reduce((last, m, i) => (marks[m.slot] ? i : last), -1);
  if (lastMarked < 0) return { day };
  const rest = day.meals.slice(lastMarked + 1).filter(m => !marks[m.slot]);
  const restKcal = rest.reduce((s, m) => s + m.recipe.kcal * m.servings, 0);
  if (!rest.length || restKcal <= 0) return { day };

  const assumed = day.meals.slice(0, lastMarked).filter(m => !marks[m.slot])
    .reduce((s, m) => s + m.recipe.kcal * m.servings, 0);
  const left = day.totals.kcal - eatenTotals(day, eaten).kcal - assumed;
  const k = Math.min(REBALANCE_MAX, Math.max(REBALANCE_MIN, left / restKcal));
  if (Math.abs(k - 1) < REBALANCE_STEP) return { day };

  const restSet = new Set(rest);
  const meals = day.meals.map(m => restSet.has(m)
    ? { ...m, servings: Math.max(0.5, Math.round(m.servings * k * 10) / 10) }
    : m);
  return {
    day: { ...day, meals },
    noteRU: k < 1
      ? "Порции на остаток дня уменьшены: съедено больше плана."
      : "Порции на остаток дня чуть больше: до этого съедено меньше плана.",
  };
}
