import type { ScreenerAnswers, ScreenerResult } from "./types.js";

export function runScreener(a: ScreenerAnswers): ScreenerResult {
  const flags: string[] = [];
  const messagesRU: string[] = [];
  if (a.loudSnoringWithPauses && a.daytimeSleepyDespiteEnoughSleep) {
    flags.push("osa");
    messagesRU.push("Храп с паузами и дневная сонливость при достаточном сне — признаки апноэ. Покажись врачу/сомнологу.");
  } else if (a.daytimeSleepyDespiteEnoughSleep) {
    flags.push("eds");
    messagesRU.push("Сильная дневная сонливость несмотря на достаточный сон — стоит показаться врачу.");
  }
  if (a.legUrgeToMoveEvening) {
    flags.push("rls");
    messagesRU.push("Неприятные ощущения в ногах с позывом двигать по вечерам — возможен синдром беспокойных ног; к врачу (нужны анализы железа).");
  }
  if (a.insomnia3xWeek3Months) {
    flags.push("insomnia");
    messagesRU.push("Трудности со сном ≥3 ночей/нед ≥3 мес — это хроническая инсомния; первая линия — CBT-I у специалиста.");
  }
  if (a.lowMood2Weeks) {
    flags.push("mood");
    messagesRU.push("Сниженное настроение ≥2 недель — обратись к врачу/психотерапевту.");
  }
  const urgent = a.selfHarmThoughts;
  if (urgent) {
    flags.push("selfharm");
    messagesRU.push("Если есть мысли о самоповреждении — немедленно обратись в кризисную службу или к специалисту.");
  }
  return { flagged: flags.length > 0, flags, messagesRU, urgent };
}
