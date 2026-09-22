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
export const OWN_FACTOR: Record<OwnSize, number> = { light: 0.6, usual: 1, big: 1.5 };

export interface DayEaten {
  /** Слот → что с ним стало. Слот в дне один, поэтому его хватает как ключа. */
  marks: Partial<Record<Slot, MealMark>>;
  /** Размер своей еды по слотам. Нет записи — «как в плане». */
  sizes?: Partial<Record<Slot, OwnSize>>;
  /** Сколько приёмов было в плане в момент отметки. Хранится, чтобы доля не поехала,
   *  когда человек потом сменит схему питания с четырёх приёмов на два. */
  planned: number;
}

/** Отметить приём. Повторное нажатие той же отметкой снимает её — это же переключатель. */
export function toggleMark(cur: DayEaten | undefined, slot: Slot, mark: MealMark, planned: number): DayEaten {
  const marks = { ...(cur?.marks ?? {}) };
  if (marks[slot] === mark) delete marks[slot];
  else marks[slot] = mark;
  // размер относится только к своей еде: сменили отметку — старый размер не должен всплыть
  const sizes = { ...(cur?.sizes ?? {}) };
  if (marks[slot] !== "own") delete sizes[slot];
  return { ...cur, marks, sizes, planned: cur?.planned ?? planned };
}

/** «Весь день по плану» — одной кнопкой вместо пяти. Уже отмеченное не трогаем:
 *  если обед был своим, вечерняя кнопка не имеет права переписать это в «съел». */
export function markAllAte(cur: DayEaten | undefined, slots: Slot[], planned: number): DayEaten {
  const marks = { ...(cur?.marks ?? {}) };
  for (const s of slots) marks[s] ??= "ate";
  return { ...cur, marks, planned: cur?.planned ?? planned };
}

export function setOwnSize(cur: DayEaten, slot: Slot, size: OwnSize): DayEaten {
  return { ...cur, sizes: { ...(cur.sizes ?? {}), [slot]: size } };
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
      // своя еда — прикидка от плановой порции; клетчатку по ней не выдумываем
      const k = OWN_FACTOR[eaten?.sizes?.[m.slot] ?? "usual"];
      kcal += m.recipe.kcal * m.servings * k;
      protein += m.recipe.protein_g * m.servings * k;
      estimated = true;
      continue;
    }
    ate++;
    kcal += m.recipe.kcal * m.servings;
    protein += m.recipe.protein_g * m.servings;
    fiber += m.recipe.fiber_g * m.servings;
  }
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
