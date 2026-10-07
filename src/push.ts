import type { PlanWindow, WindowKind } from "./types.js";
import { fmtHM } from "./time.js";

/** Три переключателя в «Я → Напоминания». По умолчанию включено всё. */
export interface PushPrefs { food: boolean; caffeine: boolean; sleep: boolean }
export const ALL_PUSHES: PushPrefs = { food: true, caffeine: true, sleep: true };

export interface Push { kind: string; title: string; body: string; data?: { url: string } }

/** Приём пищи, как его знает сервер: приложение присылает меню на сегодня и завтра. */
export interface PushMeal { slot: string; timeMin: number; name: string; cookMin: number; leftover?: boolean }

// Какие окна плана шлём (бюджет уведомлений — только ключевые) и к какому переключателю они относятся
const GROUP: Partial<Record<WindowKind, keyof PushPrefs>> = {
  morning_light: "sleep", target_bed: "sleep",
  caffeine_last: "caffeine", nap: "caffeine", coffee_nap: "caffeine",
};
/**
 * За сколько минут предупреждать. Уведомление ровно в 16:00 «последний кофе в 16:00»
 * бесполезно: выпить его уже некогда. Свет — в момент подъёма: это и есть действие.
 */
const LEAD: Partial<Record<WindowKind, number>> = { caffeine_last: 30, nap: 15, coffee_nap: 15, target_bed: 60 };

const wrap = (min: number) => ((min % 1440) + 1440) % 1440;
// момент наступил в последнем интервале крона (nowMin - slotMin, nowMin]
const due = (atMin: number, nowMin: number, slotMin: number) => {
  const s = wrap(atMin);
  return s > nowMin - slotMin && s <= nowMin;
};

function windowText(w: PlanWindow): { title: string; body: string } {
  const hm = fmtHM(w.startMin);
  switch (w.kind) {
    case "caffeine_last": return { title: `Последний кофе — до ${hm}`, body: "Хочешь кофе — самое время. Позже он помешает уснуть." };
    case "target_bed": return { title: "Через час — спать", body: `Отбой в ${hm}. Приглуши свет и отложи экраны.` };
    case "nap": case "coffee_nap": return { title: `${w.title} — в ${hm}`, body: w.detail };
    default: return { title: w.title, body: w.detail };
  }
}

/** Пуши по плану дня, которые пора отправить сейчас — с запасом времени на действие. */
export function planPushes(windows: PlanWindow[], nowMin: number, slotMin: number, prefs: PushPrefs = ALL_PUSHES): Push[] {
  return windows
    .filter(w => { const g = GROUP[w.kind]; return !!g && prefs[g] && due(w.startMin - (LEAD[w.kind] ?? 0), nowMin, slotMin); })
    .map(w => ({ kind: w.kind, ...windowText(w) }));
}

const MEAL_RU: Record<string, string> = { breakfast: "завтрак", lunch: "обед", dinner: "ужин" };
/** Дойти до кухни, достать продукты — к времени готовки из рецепта. */
const TO_KITCHEN_MIN = 10;
/** Быстрое блюдо и остатки: просто напомнить, что скоро еда. */
const SOON_MIN = 15;

/**
 * Пуши про еду. Долгое блюдо — «пора готовить» за время готовки плюс 10 минут,
 * быстрое и остатки — «через 15 минут». Перекусы и сладкое не беспокоим.
 * Раньше подъёма не будим: готовка завтрака начинается не раньше, чем человек встал.
 */
export function mealPushes(meals: PushMeal[], nowMin: number, slotMin: number, wakeMin: number): Push[] {
  return meals.flatMap(m => {
    const ru = MEAL_RU[m.slot];
    if (!ru) return [];
    const cook = !m.leftover && m.cookMin > SOON_MIN;
    const at = Math.max(m.timeMin - (cook ? m.cookMin + TO_KITCHEN_MIN : SOON_MIN), wakeMin);
    if (!due(at, nowMin, slotMin)) return [];
    return [cook
      ? { kind: `meal:${m.slot}`, title: `Пора готовить ${ru}`, body: `${m.name} — ${m.cookMin} мин, к ${fmtHM(m.timeMin)}` }
      : { kind: `meal:${m.slot}`, title: `Через ${m.timeMin - at} мин — ${ru}`, body: m.leftover ? `Уже готово, разогрей: ${m.name}` : m.name }];
  });
}

// Утренний пуш «как спалось?» — через 45 мин после обычного подъёма (даёт проснуться).
export const CHECKIN_AFTER_WAKE_MIN = 45;
export function checkinDue(minOfDay: number, wakeMin: number, slotMin = 5): boolean {
  const at = (((wakeMin + CHECKIN_AFTER_WAKE_MIN) % 1440) + 1440) % 1440;
  return minOfDay > at - slotMin && minOfDay <= at;
}
