export type Chronotype = "early" | "intermediate" | "late";
export type Goal = "alertness" | "less_grogginess" | "regular_schedule";

export interface CaffeineHabit {
  typicalMgPerDose: number;   // напр. 100/200
  regularUser: boolean;       // ежедневный потребитель
}
export interface Profile {
  anchorWakeHM: string;       // "07:00" — стабильный якорь подъёма
  targetSleepMin: number;     // деф. 465; рамка 420..540
  chronotype: Chronotype;
  caffeine: CaffeineHabit;
  napPossibleByDefault: boolean;
  goal: Goal;
}
export type DayMode = "normal" | "crunch" | "recovery";
export interface DayToggles {
  napUnavailable?: boolean;
  noBrightLight?: boolean;
  noCaffeine?: boolean;
  driving?: boolean;
  eveningBusy?: boolean;      // рано лечь нельзя
  weekend?: boolean;
  hadAlcohol?: boolean;       // вчера был алкоголь → сон менее восстановительный
}
export interface DayContext {
  date: string;               // ISO "2026-06-28"
  mode: DayMode;
  crunchUntilHM?: string;     // для crunch: конец работы (может быть >24ч, напр "27:00")
  toggles: DayToggles;
}
export interface LastNight {
  wokeHM: string;             // фактический подъём сегодня
  bedHM?: string;             // фактический отбой прошлой ночью (для длительности)
  quality: 1 | 2 | 3 | 4 | 5;
}
export interface DayLog {      // история для регулярности/долга
  date: string;
  wokeHM: string;
  bedHM?: string;
  quality: 1 | 2 | 3 | 4 | 5;
  hadAlcohol?: boolean;        // была ли выпивка в эту ночь
}
export type WindowKind =
  | "morning_light" | "caffeine_last" | "caffeine_boost" | "nap" | "coffee_nap"
  | "afternoon_dip" | "warm_shower" | "winddown" | "target_bed";
export interface PlanWindow {
  kind: WindowKind;
  startMin: number;           // минуты от 00:00 дня (может быть >1440)
  endMin?: number;
  title: string;              // RU
  detail: string;             // RU действие
  why: string;                // RU обоснование
  refs: string[];             // внутренние коды источников (в UI не показываются)
  available: boolean;
}
export type Readiness = "charged" | "ok" | "in_debt";
export interface DayPlan {
  date: string;
  mode: DayMode;
  windows: PlanWindow[];      // отсортированы по startMin
  readiness: { level: Readiness; whyRU: string; priorityRU: string };
  notesRU: string[];
}
export interface ScreenerAnswers {
  loudSnoringWithPauses: boolean;
  daytimeSleepyDespiteEnoughSleep: boolean;
  legUrgeToMoveEvening: boolean;
  insomnia3xWeek3Months: boolean;
  lowMood2Weeks: boolean;
  selfHarmThoughts: boolean;
}
export interface ScreenerResult {
  flagged: boolean;
  flags: string[];            // машинные ключи
  messagesRU: string[];       // что показать пользователю
  urgent: boolean;            // selfHarm -> кризисные службы
}
