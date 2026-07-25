export { computeTargets } from "./targets";
export { applySafety } from "./safety";
export {
  filterRecipes, generateDay, generateWeek, swapDish, mealTimes, expectedBedMin,
  DEFAULT_MEAL_COUNT, DINNER_BEFORE_BED_MIN,
  type DayRhythm, type DayOptions, type WeekOptions,
} from "./planner";
export {
  generateAdaptedDay, isRoughNight, simplifyPool, ROUGH_SLEEP_DEFICIT_MIN,
  type NightSummary,
} from "./adapt";
export { buildGroceryList } from "./grocery";
export type * from "./types";
export { diagnosePool, type PoolDiagnosis } from "./diagnose";
