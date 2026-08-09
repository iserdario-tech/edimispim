export { computeTargets } from "./targets";
export { applySafety } from "./safety";
export {
  filterRecipes, generateDay, generateWeek, swapDish, swapOptions, swapTo, mealTimes, expectedBedMin,
  DEFAULT_MEAL_COUNT, DINNER_BEFORE_BED_MIN,
  type DayRhythm, type DayOptions, type WeekOptions,
} from "./planner";
export {
  generateAdaptedDay, isRoughNight, simplifyPool, ROUGH_SLEEP_DEFICIT_MIN,
  type NightSummary,
} from "./adapt";
export {
  rampIn, targetsForToday, prefersFamiliar, RAMP_DAYS, DEFAULT_PACE,
  type RampPace, type RampState,
} from "./rampin";
export {
  planBlock, planWindow, scheduleFor, dayNumber, isoOfDay, type ScheduledDay,
} from "./schedule";
export { buildGroceryList } from "./grocery";
export type * from "./types";
export { diagnosePool, type PoolDiagnosis } from "./diagnose";
export { PRICES, priceFor, costOf, coverage, PRICES_SOURCE, PRICES_DATE } from "./prices";
export { hintFor, hasHint } from "./ingredients";
