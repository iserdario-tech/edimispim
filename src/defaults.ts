export const DEFAULTS = {
  caffeineLargeMg: 300,          // >= это "крупная доза"
  caffeineCutoffLargeH: 8,
  caffeineCutoffModerateH: 6,
  caffeineCutoffRecoveryH: 10,   // день восстановления: ранняя жёсткая отсечка
  napSlotMin: 20,                // длина окна нап (слот)
  napNotLaterBeforeBedH: 9,
  morningLightWindowMin: 60,     // окно "первый час"
  morningLightDoText: "Побудь 20–30 минут на ярком свету, лучше на улице.",
  warmShowerBeforeBedMin: 90,
  winddownBeforeBedMin: 60,
  weekendWakeShiftCapMin: 60,
} as const;
