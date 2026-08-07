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

export interface DayEaten {
  /** Слот → что с ним стало. Слот в дне один, поэтому его хватает как ключа. */
  marks: Partial<Record<Slot, MealMark>>;
  /** Сколько приёмов было в плане в момент отметки. Хранится, чтобы доля не поехала,
   *  когда человек потом сменит схему питания с четырёх приёмов на два. */
  planned: number;
}

/** Отметить приём. Повторное нажатие той же отметкой снимает её — это же переключатель. */
export function toggleMark(cur: DayEaten | undefined, slot: Slot, mark: MealMark, planned: number): DayEaten {
  const marks = { ...(cur?.marks ?? {}) };
  if (marks[slot] === mark) delete marks[slot];
  else marks[slot] = mark;
  return { marks, planned: cur?.planned ?? planned };
}

export interface EatenTotals {
  kcal: number;
  protein: number;
  /** Сколько приёмов отмечено «съел» — не считая заменённых своим. */
  ate: number;
  marked: number;
}

/** Сколько съедено по плану. Заменённое своим не считаем: что там было, приложение не знает. */
export function eatenTotals(day: Day, eaten: DayEaten | undefined): EatenTotals {
  let kcal = 0, protein = 0, ate = 0, marked = 0;
  for (const m of day.meals) {
    const mark = eaten?.marks[m.slot];
    if (!mark) continue;
    marked++;
    if (mark !== "ate") continue;
    ate++;
    kcal += m.recipe.kcal * m.servings;
    protein += m.recipe.protein_g * m.servings;
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein), ate, marked };
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
