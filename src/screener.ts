import type { ScreenerAnswers, ScreenerResult } from "./types.js";

export function runScreener(a: ScreenerAnswers): ScreenerResult {
  const flags: string[] = [];
  const messagesRU: string[] = [];
  if (a.loudSnoringWithPauses && a.daytimeSleepyDespiteEnoughSleep) {
    flags.push("osa");
    messagesRU.push("Громкий храп с паузами и сонливость днём при достаточном сне бывают при апноэ сна. Покажись врачу или сомнологу.");
  } else if (a.daytimeSleepyDespiteEnoughSleep) {
    flags.push("eds");
    messagesRU.push("Сильная сонливость днём, хотя сна хватает, — повод показаться врачу.");
  }
  if (a.legUrgeToMoveEvening) {
    flags.push("rls");
    messagesRU.push("Неприятные ощущения в ногах и желание ими двигать по вечерам бывают при синдроме беспокойных ног. Покажись врачу, понадобится анализ на железо.");
  }
  if (a.insomnia3xWeek3Months) {
    flags.push("insomnia");
    messagesRU.push("Плохой сон три и больше ночей в неделю дольше трёх месяцев похож на хроническую бессонницу. Первое, что советуют врачи, — когнитивно-поведенческая терапия бессонницы у специалиста, а не снотворное.");
  }
  if (a.lowMood2Weeks) {
    flags.push("mood");
    messagesRU.push("Подавленное настроение две недели и дольше — повод обратиться к врачу или психотерапевту.");
  }
  const urgent = a.selfHarmThoughts;
  if (urgent) {
    flags.push("selfharm");
    messagesRU.push("Если есть мысли причинить себе вред — обратись в кризисную службу или к специалисту сейчас, не откладывая. Можно начать с разговора с близким человеком.");
  }
  return { flagged: flags.length > 0, flags, messagesRU, urgent };
}

/**
 * Ответы обратно из сохранённого результата — чтобы «Я → Настройки сна» открывались с отмеченным,
 * а не с пустой анкетой. Хранится только результат (флаги), но флаги однозначно задают ответы,
 * которые на что-то влияют: «храп с паузами» без дневной сонливости флага не даёт и потерь
 * не вызывает. Без этого сохранение настроек сна молча стирало все флаги анкеты.
 */
export function answersFromResult(r: ScreenerResult | null | undefined): ScreenerAnswers {
  const f = new Set(r?.flags ?? []);
  return {
    loudSnoringWithPauses: f.has("osa"),
    daytimeSleepyDespiteEnoughSleep: f.has("osa") || f.has("eds"),
    legUrgeToMoveEvening: f.has("rls"),
    insomnia3xWeek3Months: f.has("insomnia"),
    lowMood2Weeks: f.has("mood"),
    selfHarmThoughts: f.has("selfharm"),
  };
}
