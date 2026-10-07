import { useEffect, useMemo, useState } from "react";
import { planDay, parseHM, sleepDurationMin } from "../index.js";
import type { DayMode, DayToggles } from "../index.js";
import { toPlanView } from "../ui/viewModel.js";
import { loadDayDraft, saveDayDraft, type StoredState } from "../ui/storage.js";
import { syncPushContext } from "../ui/notifications.js";
import { expectedBedMin, isRoughNight } from "../food/index.js";
import { eatenTotals, rebalance } from "../food/eaten.js";
import { mealRows, mergeTimeline, type TimelineRow } from "../ui/mealRows.js";
import { todayFoodDay } from "../ui/todayPlan.js";
import { toDayRecords } from "../ui/dayRecords.js";
import { explain } from "../explain.js";
import { localDateISO, localMinutes, plusDaysISO } from "../today-date.js";
import type { Meal } from "../food/types.js";
import type { PushMeal } from "../push.js";
import { dayWord } from "../dayWord.js";
import { streakWithFreezes } from "../streak2.js";
import { personalEffects } from "../effects.js";

const toPush = (meals: Meal[]): PushMeal[] => meals.map(m => ({
  slot: m.slot, timeMin: m.timeMin, name: m.recipe.name, cookMin: m.recipe.time_min ?? 0, ...(m.leftover ? { leftover: true } : {}),
}));

/** "03:00" после полуночи → "27:00": движок сна считает минуты от полуночи дня. */
const crunchStr = (hm: string): string => {
  const [h, m] = hm.split(":").map(Number);
  const hh = (h ?? 0) < 12 ? (h ?? 0) + 24 : (h ?? 0);
  return `${hh}:${String(m ?? 0).padStart(2, "0")}`;
};

/**
 * Всё, что нужно экрану «Сутки», — одним расчётом.
 *
 * Логика та же, что у старого экрана «Сегодня» (план сна, меню дня под ночь, пересчёт
 * по съеденному, объяснение), плюс 2.0: слово дня, серия с заморозками, личный эффект.
 * Режим дня и переключатели живут в черновике дня, как и раньше, — и уходят на Worker,
 * чтобы пуши шли по тому плану, что на экране.
 */
export function useDay(state: StoredState, now: Date) {
  const today = localDateISO(now);
  const nowMin = localMinutes(now);
  const { profile, history } = state;
  const [draft] = useState(() => loadDayDraft(today));
  const [mode, setMode] = useState<DayMode>(draft?.mode ?? "normal");
  const [crunchEndHM, setCrunchEndHM] = useState(draft?.crunchEndHM ?? "03:00");
  const [toggles, setToggles] = useState<DayToggles>(draft?.toggles ?? {});
  useEffect(() => { saveDayDraft({ date: today, mode, crunchEndHM, toggles }); }, [today, mode, crunchEndHM, toggles]);

  const logged = history.find(h => h.date === today);
  const wokeHM = logged?.wokeHM ?? profile.anchorWakeHM;
  const bedHM = logged?.bedHM;
  const quality = logged?.quality ?? 3;

  const view = useMemo(() => toPlanView(planDay({
    profile,
    ctx: { date: today, mode, ...(mode === "crunch" ? { crunchUntilHM: crunchStr(crunchEndHM) } : {}), toggles },
    lastNight: { wokeHM, quality, ...(bedHM ? { bedHM } : {}) },
    history,
  }), nowMin), [profile, history, mode, crunchEndHM, toggles, wokeHM, bedHM, quality, today, nowMin]);

  const bedMin = view.rows.find(r => r.kind === "sleep" && r.icon === "🛌")?.startMin
    ?? expectedBedMin(parseHM(profile.anchorWakeHM), profile.targetSleepMin);
  const sleptMin = bedHM ? sleepDurationMin({ wokeHM, bedHM, quality }, profile.targetSleepMin) : undefined;
  const cheat = !!state.cheatDays?.includes(today);
  const noCook = !!state.noCookDays?.includes(today);

  const foodDay = useMemo(() => (!state.food || cheat ? null : todayFoodDay({
    food: state.food, today, wokeHM, bedMin, ratings: state.ratings, swaps: state.swaps, menu: state.menu, noCookDays: state.noCookDays,
    night: { targetSleepMin: profile.targetSleepMin, quality, ...(sleptMin !== undefined ? { sleptMin } : {}) },
  })), [state.food, cheat, today, wokeHM, bedMin, state.ratings, state.swaps, state.menu, state.noCookDays, profile.targetSleepMin, quality, sleptMin]);

  const eaten = state.eaten?.[today];
  const balanced = useMemo(() => (foodDay ? rebalance(foodDay.day, eaten) : null), [foodDay, eaten]);
  const rows: TimelineRow[] = useMemo(
    () => (balanced ? mergeTimeline(view.rows, mealRows(balanced.day, bedMin, nowMin)) : view.rows),
    [view.rows, balanced, bedMin, nowMin],
  );
  // Серверу пушей — план дня и меню на сегодня и завтра: напоминание «пора готовить»
  // считается от времени готовки блюда, а меню живёт только на телефоне.
  useEffect(() => {
    const id = setTimeout(() => {
      const tomorrow = plusDaysISO(today, 1);
      const next = state.food ? todayFoodDay({
        food: state.food, today: tomorrow, wokeHM: profile.anchorWakeHM,
        bedMin: expectedBedMin(parseHM(profile.anchorWakeHM), profile.targetSleepMin),
        ratings: state.ratings, swaps: state.swaps, menu: state.menu, noCookDays: state.noCookDays,
        night: { targetSleepMin: profile.targetSleepMin },
      }) : null;
      void syncPushContext(profile, {
        date: today, mode, toggles, ...(mode === "crunch" ? { crunchUntilHM: crunchStr(crunchEndHM) } : {}),
      }, { meals: { [today]: toPush(balanced?.day.meals ?? []), [tomorrow]: toPush(next?.day.meals ?? []) } });
    }, 800);
    return () => clearTimeout(id);
  }, [profile, today, mode, crunchEndHM, toggles, balanced, state.food, state.ratings, state.swaps, state.menu, state.noCookDays]);

  const fact = foodDay ? eatenTotals(foodDay.day, eaten) : null;
  const dinner = foodDay?.day.meals.find(m => m.slot === "dinner");

  const explanation = useMemo(() => {
    const days = toDayRecords(history, state.weights ?? [], state.eaten ?? {}, state.cheatDays ?? []);
    const todayRec = days.find(d => d.date === today) ?? { date: today, sleep: { wokeHM, bedHM, quality } };
    return explain({
      today: todayRec,
      days: days.some(d => d.date === today) ? days : [...days, todayRec],
      targetSleepMin: profile.targetSleepMin,
      screenerFlagged: state.screener?.flagged,
      caffeineCutoffHM: view.rows.find(r => r.icon === "☕")?.time,
    });
  }, [history, state.weights, state.eaten, state.cheatDays, state.screener, today, wokeHM, bedHM, quality, profile.targetSleepMin, view.rows]);

  const rough = !!logged && isRoughNight({ quality, targetSleepMin: profile.targetSleepMin, ...(sleptMin !== undefined ? { sleptMin } : {}) });
  const word = dayWord({
    nowMin, logged: !!logged, rough, mode, cheat, bedMin, wokeHM,
    dinnerMarked: !!eaten?.marks.dinner, ...(dinner ? { dinnerMin: dinner.timeMin } : {}),
    ...(sleptMin !== undefined ? { sleptMin } : {}),
  });

  /** Ближайшее дело: первая строка, которая ещё не прошла. */
  const nextIdx = rows.findIndex(r => (r.endTime ? r.startMin + 1 : r.startMin) >= nowMin - 15);
  const marked = [...new Set([...history.map(h => h.date), ...Object.keys(state.eaten ?? {}).filter(d => Object.keys(state.eaten![d]!.marks).length)])];
  const streak = streakWithFreezes(marked, state.cheatDays ?? [], today);
  const effects = useMemo(() => personalEffects(history, state.yesterday ?? {}, profile.targetSleepMin), [history, state.yesterday, profile.targetSleepMin]);

  return {
    today, nowMin, logged, wokeHM, bedHM, quality, sleptMin, bedMin, view, rows, nextIdx,
    foodDay, balanced, fact, eaten, cheat, noCook, rough, word, explanation, streak, effects,
    mode, setMode, crunchEndHM, setCrunchEndHM, toggles, setToggles,
  };
}
export type DayModel = ReturnType<typeof useDay>;
