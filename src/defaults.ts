export const DEFAULTS = {
  // Отсечки кофеина по мета-анализу (Sleep Med Rev 2023, [B-034]):
  // чашка кофе ~107 мг заметна за 8.8 ч до сна, порция предтреника ~217 мг — за 13.2 ч.
  // Прежние 6 ч были мягче доказательного порога: при отбое в 23:00 они разрешали кофе
  // в 17:00, хотя по данным он ещё крадёт сон.
  // Кофеин в среднем отнимает 45 мин сна, 7% эффективности и 11 мин глубокого сна.
  caffeineLargeMg: 150,          // >= это уже «крупная доза» (две чашки/энергетик)
  caffeineCutoffLargeH: 13,
  caffeineCutoffModerateH: 9,
  caffeineCutoffRecoveryH: 13,   // день восстановления: ранняя жёсткая отсечка
  napSlotMin: 20,                // длина окна нап (слот)
  napNotLaterBeforeBedH: 9,
  morningLightWindowMin: 60,     // окно "первый час"
  morningLightDoText: "Побудь 20–30 минут на ярком свету, лучше на улице.",
  warmShowerBeforeBedMin: 90,
  winddownBeforeBedMin: 60,
  weekendWakeShiftCapMin: 60,
} as const;
