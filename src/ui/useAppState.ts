import { useEffect, useState } from "react";
import type { Yesterday } from "../effects.js";
import type { DayLog } from "../index.js";
import { todayFoodDay } from "./todayPlan.js";
import { eatenTotals, rebalance } from "../food/eaten.js";
import { expectedBedMin } from "../food/index.js";
import { parseHM, fmtHM, sleepDurationMin } from "../index.js";
import { loadState, saveState, exportAll, importAll, type FoodSettings, type StoredState } from "./storage.js";
import { syncPushContext } from "./notifications.js";
import { migrateAll } from "../migrate.js";
import { localDateISO } from "../today-date.js";
import { toggleMark, markAllAte, setOwnSize, setOwnText, addExtra, removeExtra, type DayEaten, type MealMark, type OwnSize, type WrittenFood } from "../food/eaten.js";
import type { Slot } from "../food/types.js";
import { readLS, writeLS } from "./localStore.js";
import { BACKUP_KEY } from "./dataSafety.js";

/**
 * Данные из pospat и oheedet лежат на том же origin — подхватываем их, а не просим вводить заново.
 *
 * Здесь была самая дорогая потеря во всём приложении: из перенесённых суток забирались
 * ТОЛЬКО замеры веса, а ночи сна выбрасывались. При этом человеку честно писали
 * «Перенесено ночей сна: 24» — то есть приложение сообщало о переносе, которого не делало.
 * Ради этих ночей вся миграция и затевалась: без них не считается ни ровность режима,
 * ни разбор плато, ни «почему сегодня так».
 *
 * Заодно возвращён скрининг питания из oheedet: на нём стоят guardrails безопасности
 * (мягкий дефицит при красных флагах), и без него они не срабатывали никогда.
 */
export function pickUpOldApps(): {
  food?: FoodSettings;
  weights: { date: string; kg: number }[];
  history: DayLog[];
  notesRU: string[];
} {
  if (typeof localStorage === "undefined") return { weights: [], history: [], notesRU: [] };
  const m = migrateAll(localStorage);
  const weights = m.days.flatMap(d =>
    typeof d.body?.weightKg === "number" ? [{ date: d.date, kg: d.body.weightKg }] : []);
  const history: DayLog[] = m.days.flatMap(d => d.sleep ? [{
    date: d.date,
    wokeHM: d.sleep.wokeHM,
    quality: d.sleep.quality,
    ...(d.sleep.bedHM ? { bedHM: d.sleep.bedHM } : {}),
    ...(d.sleep.alcohol ? { hadAlcohol: true } : {}),
  }] : []);
  const food: FoodSettings | undefined = m.foodProfile
    ? {
        profile: m.foodProfile, constraints: m.constraints ?? {}, mealCount: 4,
        ...(m.screen ? { screen: m.screen } : {}),
      }
    : undefined;
  return { food, weights, history, notesRU: m.notesRU };
}

/**
 * Состояние приложения и все действия над ним — без единого экрана.
 *
 * Вынесено из App, когда появился второй интерфейс (2.0): оба должны писать в одно
 * хранилище одними и теми же функциями, иначе отметка «съел» в новом интерфейсе
 * и в старом считалась бы по-разному.
 */
export function useAppState() {
  const [state, setState] = useState<StoredState | null>(() => loadState());
  const [migrationNote, setMigrationNote] = useState("");
  /**
   * Не удалось записать на диск.
   *
   * `saveState` умеет отвечать «не вышло» — место кончилось или Safari в приватном режиме
   * запрещает запись вовсе. Молча терять чужие данные нельзя, поэтому об этом говорится прямо.
   */
  const [saveFailed, setSaveFailed] = useState(false);
  const persist = (next: StoredState): void => { setSaveFailed(!saveState(next)); };
  const [backupAt, setBackupAt] = useState<string | null>(() => readLS<string | null>(BACKUP_KEY, null));

  useEffect(() => {
    if (state) return;
    const picked = pickUpOldApps();
    // ночи сна — самое ценное из перенесённого, и заметку они заслуживают наравне с весом
    if (picked.weights.length || picked.history.length || picked.food) setMigrationNote(picked.notesRU.join(" "));
  }, [state]);

  const update = (next: StoredState) => { persist(next); setState(next); };

  const saveLog = (log: DayLog) => {
    setState((prev) => {
      if (!prev) return prev;
      /*
       * Порядок здесь не косметика: ровность режима берёт `history.slice(-7)`, то есть
       * последние семь ЭЛЕМЕНТОВ массива, считая их последними семью ночами. Пока отмечают
       * только сегодняшний день, порядок совпадает сам собой, но перенос из старого
       * приложения и восстановление из копии такой гарантии не дают.
       */
      const history = [...prev.history.filter((h) => h.date !== log.date), log]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-180);
      const next = { ...prev, history };
      persist(next);
      return next;
    });
  };

  /**
   * Отметка «съел» / «заменил своим». Хранится не больше 180 дней — ровно как история сна:
   * ряд нужен месяцами для разбора плато, но копить его вечно незачем.
   */
  const editEaten = (date: string, edit: (cur: DayEaten | undefined) => DayEaten) => {
    setState((prev) => {
      if (!prev) return prev;
      const all = { ...(prev.eaten ?? {}) };
      all[date] = edit(all[date]);
      const kept = Object.keys(all).sort().slice(-180);
      const eaten = Object.fromEntries(kept.map(d => [d, all[d]!]));
      const next = { ...prev, eaten };
      persist(next);
      return next;
    });
  };
  const markMeal = (date: string, slot: Slot, mark: MealMark, planned: number, dayKcal?: number, portion?: number) =>
    editEaten(date, cur => toggleMark(cur, slot, mark, planned, dayKcal, portion));
  const markAll = (date: string, slots: Slot[], planned: number, dayKcal?: number, portions?: Partial<Record<Slot, number>>) =>
    editEaten(date, cur => markAllAte(cur, slots, planned, dayKcal, portions));
  const ownSize = (date: string, slot: Slot, size: OwnSize) =>
    editEaten(date, cur => setOwnSize(cur ?? { marks: {}, planned: 0 }, slot, size));
  const ownWritten = (date: string, slot: Slot, food: WrittenFood) =>
    editEaten(date, cur => setOwnText(cur ?? { marks: {}, planned: 0 }, slot, food));
  const extraAdd = (date: string, food: WrittenFood, planned: number) =>
    editEaten(date, cur => addExtra(cur, food, planned));
  const extraRemove = (date: string, index: number) =>
    editEaten(date, cur => removeExtra(cur ?? { marks: {}, planned: 0 }, index));

  /**
   * Оценка блюда. Повторное нажатие той же оценки снимает её: человек передумал —
   * это нормально, и запирать его в собственном «не люблю» навсегда незачем.
   *
   * Оценки не покидают устройство. Коллективный топ блюд, о котором шла речь, требует
   * отправки данных на сервер — это отдельное решение и отдельная явная галочка.
   */
  const rateDish = (id: string, value: 1 | -1) => {
    setState((prev) => {
      if (!prev) return prev;
      const ratings = { ...(prev.ratings ?? {}) };
      if (ratings[id] === value) delete ratings[id];
      else ratings[id] = value;
      const next = { ...prev, ratings };
      persist(next);
      return next;
    });
  };

  /**
   * Объявить (или отменить) читмил. Хранится в истории, а не в контексте суток: день должен
   * остаться помеченным и назавтра, иначе статистика приверженности сочтёт его провалом —
   * то есть накажет ровно за то, что человек честно объявил заранее.
   */
  const setCheatDay = (date: string, on: boolean) => {
    setState((prev) => {
      if (!prev) return prev;
      const rest = (prev.cheatDays ?? []).filter(d => d !== date);
      const cheatDays = (on ? [...rest, date] : rest).sort().slice(-180);
      const next = { ...prev, cheatDays };
      persist(next);
      return next;
    });
  };

  /** Поправка нормы по реальному расходу: шаг прибавляется к прежней; 0 — сбросить. */
  const adjustKcal = (step: number) => {
    setState((prev) => {
      if (!prev?.food) return prev;
      const kcalAdjust = step === 0 ? 0 : (prev.food.kcalAdjust ?? 0) + step;
      const next = { ...prev, food: { ...prev.food, kcalAdjust, kcalAdjustAt: localDateISO() } };
      persist(next);
      return next;
    });
  };

  /** Карточка «донастрой» закрыта без правки настроек — больше не показываем. */
  const markTuned = () => {
    setState((prev) => {
      if (!prev?.food) return prev;
      const next = { ...prev, food: { ...prev.food, tuned: true } };
      persist(next);
      return next;
    });
  };

  /** «Сегодня не готовлю» — по датам, как читмил: «Еда» и «Сегодня» должны видеть одно и то же. */
  const setNoCook = (date: string, on: boolean) => {
    setState((prev) => {
      if (!prev) return prev;
      const rest = (prev.noCookDays ?? []).filter(d => d !== date);
      const noCookDays = (on ? [...rest, date] : rest).sort().slice(-60);
      const next = { ...prev, noCookDays };
      persist(next);
      return next;
    });
  };

  /**
   * Ручная замена блюда. Хранится по дате и приёму: меню привязано к календарю,
   * поэтому замена в четверг должна остаться заменой в четверг, а не «в первом дне списка».
   */
  const saveSwap = (date: string, slot: string, recipeId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const all = { ...(prev.swaps ?? {}) };
      all[date] = { ...(all[date] ?? {}), [slot]: recipeId };
      // храним ровно столько же, сколько отметки: неделя вперёд и полгода назад — перебор
      const kept = Object.keys(all).sort().slice(-30);
      const swaps = Object.fromEntries(kept.map(d => [d, all[d]!]));
      const next = { ...prev, swaps };
      persist(next);
      return next;
    });
  };

  const addWeight = (kg: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const date = localDateISO();
      const weights = [...(prev.weights ?? []).filter(w => w.date !== date), { date, kg }]
        .sort((a, b) => a.date.localeCompare(b.date));
      const next = { ...prev, weights };
      persist(next);
      return next;
    });
  };

  const backup = () => {
    const url = URL.createObjectURL(new Blob([exportAll()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `edim-spim-копия-${localDateISO()}.json`;
    a.click(); URL.revokeObjectURL(url);
    // отметка для напоминания «копии N дней»: скачал — значит, сохранил
    const today = localDateISO();
    writeLS(BACKUP_KEY, today); setBackupAt(today);
  };
  const restore = async (file: File) => {
    const restored = importAll(await file.text());
    if (!restored) { alert("Не похоже на копию «edim & spim». Файл не подошёл."); return; }
    update(restored);
    void syncPushContext(restored.profile);
    alert("Данные восстановлены ✓");
  };

  /** «Вчера было?» — ответ на один вопрос; повторный тот же ответ снимает его. */
  const setYesterday = (date: string, key: keyof Yesterday, value: boolean) => {
    setState((prev) => {
      if (!prev) return prev;
      const all = { ...(prev.yesterday ?? {}) };
      const cur = { ...(all[date] ?? {}) };
      if (cur[key] === value) delete cur[key]; else cur[key] = value;
      all[date] = cur;
      const kept = Object.keys(all).sort().slice(-180);
      const next = { ...prev, yesterday: Object.fromEntries(kept.map(d => [d, all[d]!])) };
      persist(next);
      return next;
    });
  };

  return {
    state, update, saveFailed, backupAt, migrationNote,
    actions: {
      saveLog, markMeal, markAll, ownSize, ownWritten, extraAdd, extraRemove, rateDish, setCheatDay,
      adjustKcal, markTuned, setNoCook, saveSwap, addWeight, backup, restore, setYesterday,
    },
  };
}

/** Короткая сводка «как дела сейчас» — чтобы коуч отвечал про этого человека, а не вообще. */
export function coachContext(state: StoredState): string {
  const last = state.history[state.history.length - 1];
  const weights = state.weights ?? [];
  return [
    // Стилевых указаний здесь больше нет: они дублировали промпт на Worker'е и требовали
    // ровно обратного — «отвечай развёрнуто, 4–8 предложений». Отсюда и была вода.
    "Приложение объединяет сон и питание: можешь отвечать и про еду, и про режим дня.",
    `Обычный подъём: ${state.profile.anchorWakeHM}. Цель сна: ${(state.profile.targetSleepMin / 60).toFixed(1)} ч.`,
    last ? `Последняя отмеченная ночь ${last.date}: подъём ${last.wokeHM}, качество ${last.quality}/5${last.hadAlcohol ? ", был алкоголь" : ""}.` : "Ночи пока не отмечались.",
    state.food ? `Питание настроено: ${state.food.mealCount} ${state.food.mealCount < 5 ? "приёма" : "приёмов"} в день.` : "Питание пока не настроено.",
    ...todayMenuRU(state),
    weights.length >= 2
      ? `Вес: с ${weights[0]!.kg} до ${weights[weights.length - 1]!.kg} кг за ${weights.length} замеров.`
      : "",
    state.screener?.flagged
      ? `ВАЖНО, анкета показала признаки, требующие врача: ${state.screener.messagesRU.join(" ")}`
      : "",
  ].filter(Boolean).join("\n");
}

const SLOT_RU: Record<string, string> = { breakfast: "завтрак", lunch: "обед", dinner: "ужин", dessert: "сладкое", snack: "перекус" };
const SIZE_RU: Record<string, string> = { light: "лёгкое", usual: "как в плане", big: "плотное" };

/**
 * Сегодняшнее меню и что из него съедено — чтобы коуч отвечал про этот день.
 * На «чем заменить ужин» без меню он мог сказать только «чем-нибудь белковым».
 */
function todayMenuRU(state: StoredState): string[] {
  if (!state.food) return [];
  const today = localDateISO();
  if (state.cheatDays?.includes(today)) return ["Сегодня человек объявил читмил: калории не считаем, меню нет."];
  const log = state.history.find(h => h.date === today);
  const p = state.profile;
  const fd = todayFoodDay({
    food: state.food, today,
    wokeHM: log?.wokeHM ?? p.anchorWakeHM,
    bedMin: expectedBedMin(parseHM(p.anchorWakeHM), p.targetSleepMin),
    night: {
      targetSleepMin: p.targetSleepMin,
      ...(log ? { quality: log.quality } : {}),
      ...(log?.bedHM ? { sleptMin: sleepDurationMin(log, p.targetSleepMin) } : {}),
    },
    ratings: state.ratings, swaps: state.swaps, noCookDays: state.noCookDays,
  });
  if (!fd.day.meals.length) return ["Меню на сегодня не собралось: ограничения выели все блюда."];
  const eaten = state.eaten?.[today];
  const { day, noteRU } = rebalance(fd.day, eaten);
  const fact = eatenTotals(fd.day, eaten);
  const lines = day.meals.map(m => {
    const mark = eaten?.marks[m.slot];
    const status = mark === "ate" ? " [съел]" : mark === "own" ? ` [ел своё, ${SIZE_RU[eaten?.sizes?.[m.slot] ?? "usual"]}]` : "";
    return `${fmtHM(m.timeMin)} ${SLOT_RU[m.slot] ?? m.slot} — ${m.recipe.name}, ${Math.round(m.recipe.kcal * m.servings)} ккал${m.leftover ? ", остатки вчерашнего ужина" : ""}${status}`;
  });
  return [
    `Меню на сегодня (цель ${fd.day.totals.kcal} ккал, белок ${fd.safe.proteinGTarget} г):`,
    ...lines,
    fact.marked
      ? `Съедено ${fact.estimated ? "примерно " : ""}${fact.kcal} ккал, белок ${fact.protein} г; осталось около ${Math.max(0, fd.day.totals.kcal - fact.kcal)} ккал.`
      : "Из сегодняшнего меню пока ничего не отмечено.",
    ...(fd.changes.length ? [`День перестроен после плохой ночи: ${fd.changes.join("; ")}.`] : []),
    ...(state.noCookDays?.includes(today) ? ["Сегодня человек не готовит: блюда до 10 минут."] : []),
    ...(noteRU ? [noteRU] : []),
  ];
}
