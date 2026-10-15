import type { ScreenerResult } from "./types.js";
import type { FoodProfile, Screen } from "./food/types.js";
import { stopBang, nightEating, NES_MESSAGE, type StopBangAnswers, type NesAnswers } from "./screening.js";
import { SCOFF_REFER } from "./food/safety.js";

/**
 * Что из ответов про здоровье стоит обсудить с врачом — одним списком для экранов и коуча.
 *
 * Повод — баг, найденный при сверке документации (2026-10-15): вопросы про храп и ночную еду
 * задавались при быстром старте и в настройках еды, `stopBang` считал вердикт, но после
 * переезда на 2.0 его не вызывал никто. Вкладка «Итоги», где он показывался, исчезла, и человек
 * с признаками апноэ так и не узнавал, что стоит показаться врачу. Ночное питание молча
 * смягчало дефицит, но тоже нигде не объяснялось. Общая анкета (`runScreener`) меняла подсказку
 * дня на «есть повод показаться врачу», не говоря, по какому поводу.
 *
 * ⚠️ Это не диагноз (G3): формулировки ведут к врачу и не утверждают болезнь.
 */
export type HealthFlagKind = "selfharm" | "apnea" | "night_eating" | "eating" | "osa" | "eds" | "rls" | "insomnia" | "mood";

export interface HealthFlag {
  kind: HealthFlagKind;
  titleRU: string;
  messageRU: string;
  /** К кому идти — одной строкой. */
  doctorRU: string;
  /** Срочное: показывается первым, а карточку с ним «Понятно» прячет на неделю, а не навсегда. */
  urgent: boolean;
  /** Не печатаем заголовок на главном экране: телефон может видеть кто-то рядом. */
  sensitive: boolean;
}

export interface HealthInput {
  screener?: ScreenerResult | null;
  screening?: { stopBang?: StopBangAnswers; nes?: NesAnswers };
  /** Сохранённые итоги анкеты еды: флаг ночного питания и SCOFF, в том числе перенесённые из oheedet. */
  screen?: Screen;
  profile?: Pick<FoodProfile, "sex" | "age" | "heightCm" | "weightKg">;
}

const SCREENER: Record<string, { titleRU: string; doctorRU: string; sensitive?: boolean }> = {
  // 112 — единый номер экстренных служб: единственный контакт, который точно работает везде в России
  selfharm: { titleRU: "Мысли навредить себе", doctorRU: "Кризисная служба или специалист — сегодня, не откладывая. Если опасно прямо сейчас — 112", sensitive: true },
  osa: { titleRU: "Храп с паузами и сонливость днём", doctorRU: "Сомнолог или терапевт" },
  eds: { titleRU: "Сонливость днём при достаточном сне", doctorRU: "Терапевт или сомнолог" },
  rls: { titleRU: "Ноги по вечерам не дают покоя", doctorRU: "Невролог, анализ на железо" },
  insomnia: { titleRU: "Сон нарушен уже месяцами", doctorRU: "Сомнолог: когнитивно-поведенческая терапия бессонницы" },
  mood: { titleRU: "Настроение снижено две недели и дольше", doctorRU: "Врач или психотерапевт", sensitive: true },
};

/** ИМТ из анкеты еды; без роста или веса — 0, то есть признак «B» не засчитывается. */
const bmiOf = (p?: HealthInput["profile"]): number =>
  p && p.heightCm > 0 && p.weightKg > 0 ? p.weightKg / (p.heightCm / 100) ** 2 : 0;

export function healthFlags({ screener, screening, screen, profile }: HealthInput): HealthFlag[] {
  const out: HealthFlag[] = [];

  // Апноэ — только если человек ответил «да» на первый вопрос (храп или остановки дыхания).
  // Без этого STOP-Bang набирает 3 балла одними полом, возрастом и весом: мужчина за 50 с ИМТ
  // больше 35 получил бы «признаки апноэ», ни разу не сказав про храп. Анкета так не задумана:
  // при «нет» остальные вопросы про апноэ даже не задаются.
  const sb = screening?.stopBang;
  const apnea = sb?.snoringLoud
    ? stopBang(sb, { bmi: bmiOf(profile), age: profile?.age ?? 0, sex: profile?.sex ?? "f" })
    : null;
  if (apnea?.flagged) out.push({
    kind: "apnea", urgent: false, sensitive: false,
    titleRU: apnea.levelRU === "высокий" ? "Заметный риск апноэ сна" : "Есть признаки апноэ сна",
    messageRU: apnea.messageRU,
    doctorRU: "Сомнолог или терапевт: проверка сна дома или в клинике",
  });

  // Ночное питание: по свежим ответам, а если ответов нет (перенос из oheedet) — по сохранённому флагу,
  // тому же, что смягчает дефицит. Свежие ответы важнее старого флага.
  const nesFlagged = screening?.nes ? nightEating(screening.nes).flagged : !!screen?.nesFlagged;
  if (nesFlagged) out.push({
    kind: "night_eating", urgent: false, sensitive: false,
    titleRU: "Еда сдвинута на вечер и ночь",
    messageRU: NES_MESSAGE,
    doctorRU: "Психотерапевт или специалист по пищевому поведению",
  });

  // SCOFF приезжает только из oheedet, но дефицит смягчает и сейчас — значит, человек должен знать почему.
  if ((screen?.scoffScore ?? 0) >= SCOFF_REFER) out.push({
    kind: "eating", urgent: false, sensitive: true,
    titleRU: "Отношения с едой",
    messageRU: "В анкете о пищевом поведении, которую ты проходил в старом приложении oheedet, были признаки, с которыми лучше работать вместе со специалистом: жёсткая диета тут обычно вредит. Поэтому дефицит в приложении мягче обычного.",
    doctorRU: "Психотерапевт или специалист по пищевому поведению",
  });

  // Общая анкета: флаги и сообщения идут парами в одном порядке (runScreener).
  if (screener?.flagged) screener.flags.forEach((f, i) => {
    const meta = SCREENER[f];
    const msg = screener.messagesRU[i];
    if (!meta || !msg) return;
    if (f === "osa" && apnea?.flagged) return;   // про апноэ уже сказано подробнее
    out.push({ kind: f as HealthFlagKind, urgent: f === "selfharm", sensitive: !!meta.sensitive, messageRU: msg, titleRU: meta.titleRU, doctorRU: meta.doctorRU });
  });

  // срочное — первым
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

/**
 * Подпись набора флагов — какие виды в списке. Карточку на «Сутках» закрывают «Понятно», и она
 * возвращается, только когда появился новый вид. Уровень риска в подпись не входит: он зависит
 * от веса, и карточка выскакивала бы снова от обычных колебаний на весах.
 */
export const healthSignature = (flags: HealthFlag[]): string =>
  [...new Set(flags.map(f => f.kind))].sort().join("|");

/** Строка для карточки на главном экране: чувствительные пункты не называем, только счёт. */
export function healthCardLine(flags: HealthFlag[]): string {
  const open = flags.filter(f => !f.sensitive).map(f => f.titleRU);
  const hidden = flags.length - open.length;
  if (!hidden) return open.join(" · ");
  const more = hidden === 1 ? "ещё один пункт" : `ещё ${hidden} пункта`;
  return open.length ? `${open.join(" · ")} · ${more} — внутри` : "Подробности — внутри";
}

/** Срочное возвращается через неделю: одно нажатие не должно прятать его навсегда. */
export const URGENT_REPEAT_DAYS = 7;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Показывать ли карточку на «Сутках». `seen` — подпись и дата последнего «Понятно».
 * Карточка возвращается, только когда в списке появился вид, которого не было в закрытом:
 * пропавший пункт (похудел, ИМТ ушёл ниже порога) её не возвращает. Срочное — ещё и через неделю.
 */
export function healthCardDue(flags: HealthFlag[], seen: { sig: string; at: string } | null, todayISO: string): boolean {
  if (!flags.length) return false;
  if (!seen) return true;
  const kinds = new Set(seen.sig.split("|"));
  if (flags.some(f => !kinds.has(f.kind))) return true;
  return flags.some(f => f.urgent) && daysBetween(seen.at, todayISO) >= URGENT_REPEAT_DAYS;
}
