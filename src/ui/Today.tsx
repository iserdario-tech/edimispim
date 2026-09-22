import React, { useEffect, useMemo, useState } from "react";
import type { Profile, DayLog, DayMode, DayToggles, ScreenerResult } from "../index.js";
import { planDay, parseHM, sleepDurationMin, streakDays } from "../index.js";
import { toPlanView } from "./viewModel.js";
import { loadDayDraft, saveDayDraft, type FoodSettings } from "./storage.js";
import { enableNotifications, syncPushContext } from "./notifications.js";
import { expectedBedMin } from "../food/index.js";
import type { Slot } from "../food/types.js";
import { eatenTotals, rebalance, type DayEaten, type MealMark, type OwnSize, type WrittenFood } from "../food/eaten.js";
import { EatSheet } from "./EatSheet.js";
import { NO_COOK_MIN } from "./dayOpts.js";
import { SwipeRow } from "./SwipeRow.js";
import { plusDaysISO } from "../today-date.js";
import { mealRows, mergeTimeline } from "./mealRows.js";
import { tap } from "./haptics.js";
import { explain } from "../explain.js";
import { toDayRecords } from "./dayRecords.js";
import { WeekFoodBars, DayRings } from "./Charts.js";
import { followedPlan } from "../food/eaten.js";
import { localDateISO, localMinutes } from "../today-date.js";
import { useNow } from "./useNow.js";
import { todayFoodDay } from "./todayPlan.js";
import { Sheet } from "./Sheet.js";
import { MealIngredients } from "./Grocery.js";
import type { Meal } from "../food/types.js";
import { isStandalone, isIOS, backupDue, daysSince, INSTALL_HINT_KEY } from "./dataSafety.js";
import { readLS, writeLS } from "./localStore.js";

const QUALITY_RU = [[1, "ужасно"], [2, "плохо"], [3, "норм"], [4, "хорошо"], [5, "отлично"]] as const;
const OWN_SIZES = [["light", "лёгкое"], ["usual", "как в плане"], ["big", "плотное"]] as const;

// "03:00" после полуночи -> "27:00" (движок считает минуты от полуночи дня)
function crunchStr(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const hh = (h ?? 0) < 12 ? (h ?? 0) + 24 : (h ?? 0);
  return `${hh}:${String(m ?? 0).padStart(2, "0")}`;
}

/** «7 августа, четверг» — дата под крупным заголовком, как в системных приложениях.
 *  Дату берём из того же «сейчас», что и вся лента: иначе после полуночи заголовок
 *  показывал бы вчерашнее число, пока приложение висит открытым. */
const todayLabel = (d: Date): string =>
  d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });

export function Today({ profile, history, screener, onLog, food, weights, eaten, ratings, cheatDays, swaps, onMarkMeal, onMarkAll, onOwnSize, onOwnWritten, onExtraAdd, onExtraRemove, onCheatDay, onSetupFood, backupAt, onBackup, noCookDays, onNoCook, onTuned }: {
  profile: Profile;
  history: DayLog[];
  screener?: ScreenerResult | null;
  onLog: (log: DayLog) => void;
  food?: FoodSettings;
  weights?: { date: string; kg: number }[];
  eaten?: Record<string, DayEaten>;
  ratings?: Record<string, 1 | -1>;
  /** Дни, которые человек сам объявил читмилом. Хранятся в истории, а не в контексте суток:
   *  день должен остаться помеченным и завтра, иначе статистика посчитает его срывом. */
  cheatDays?: string[];
  /** Ручные замены блюд по датам — накладываются поверх календарного плана,
   *  иначе «Сегодня» показывало бы не то, что человек выбрал на экране «Еда». */
  swaps?: Record<string, Record<string, string>>;
  onMarkMeal?: (date: string, slot: Slot, mark: MealMark, planned: number, dayKcal?: number, portion?: number) => void;
  onMarkAll?: (date: string, slots: Slot[], planned: number, dayKcal?: number, portions?: Partial<Record<Slot, number>>) => void;
  onOwnSize?: (date: string, slot: Slot, size: OwnSize) => void;
  /** «Напиши, что съел» — своя еда словами и еда вне плана. */
  onOwnWritten?: (date: string, slot: Slot, food: WrittenFood) => void;
  onExtraAdd?: (date: string, food: WrittenFood, planned: number) => void;
  onExtraRemove?: (date: string, index: number) => void;
  onCheatDay?: (date: string, on: boolean) => void;
  onSetupFood?: () => void;
  /** Когда последний раз сохраняли копию — для напоминания. */
  backupAt?: string | null;
  onBackup?: () => void;
  /** Дни «не готовлю» и переключатель — хранятся по датам, как читмил: «Еда» должна их видеть. */
  noCookDays?: string[];
  onNoCook?: (date: string, on: boolean) => void;
  /** Закрыть «донастрой» без правки настроек. */
  onTuned?: () => void;
}) {
  // «сейчас» обязано идти вперёд, пока экран открыт: у PWA он живёт часами без перезагрузки
  const now = useNow();
  const today = localDateISO(now);        // по местному времени: за полночь день уже новый
  const nowMin = localMinutes(now);
  const [draft] = useState(() => loadDayDraft(today));
  const [mode, setMode] = useState<DayMode>(draft?.mode ?? "normal");
  const [openRecipe, setOpenRecipe] = useState<Meal | null>(null);
  const [markOpen, setMarkOpen] = useState(false);
  // шторка «что съел»: для своего приёма (slot) или вне плана (null)
  const [writing, setWriting] = useState<{ slot: Slot | null } | null>(null);
  const [crunchEndHM, setCrunchEndHM] = useState(draft?.crunchEndHM ?? "03:00");
  const [toggles, setToggles] = useState<DayToggles>(draft?.toggles ?? {});
  const loggedToday = history.find((h) => h.date === today);
  const [wokeHM, setWokeHM] = useState(loggedToday?.wokeHM ?? profile.anchorWakeHM);
  const [bedHM, setBedHM] = useState(loggedToday?.bedHM ?? "");
  const [quality, setQuality] = useState<1 | 2 | 3 | 4 | 5>(loggedToday?.quality ?? 3);
  const [notifMsg, setNotifMsg] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const notifOn = typeof Notification !== "undefined" && Notification.permission === "granted";
  const isCheat = !!cheatDays?.includes(today);
  const noCook = !!noCookDays?.includes(today);
  // Safari стирает данные сайта после недели простоя, установленное приложение — нет
  const [installHint, setInstallHint] = useState(() => isIOS() && !isStandalone() && !readLS(INSTALL_HINT_KEY, false));
  const daysWithData = new Set([...history.map(h => h.date), ...Object.keys(eaten ?? {})]).size;
  const showBackup = !!onBackup && backupDue(backupAt ?? null, today, daysWithData);

  useEffect(() => { saveDayDraft({ date: today, mode, crunchEndHM, toggles }); }, [today, mode, crunchEndHM, toggles]);
  // контекст дня — на Worker, иначе пуши шли бы по «обычному дню», а не по тому, что на экране
  useEffect(() => {
    const id = setTimeout(() => void syncPushContext(profile, {
      date: today, mode, toggles, ...(mode === "crunch" ? { crunchUntilHM: crunchStr(crunchEndHM) } : {}),
    }), 800);
    return () => clearTimeout(id);
  }, [profile, today, mode, crunchEndHM, toggles]);
  useEffect(() => { if (location.hash === "#mark") setTimeout(() => document.getElementById("mark")?.scrollIntoView({ block: "center" }), 0); }, []);

  const view = useMemo(() => {
    const plan = planDay({
      profile,
      ctx: { date: today, mode, ...(mode === "crunch" ? { crunchUntilHM: crunchStr(crunchEndHM) } : {}), toggles },
      lastNight: { wokeHM, quality, ...(bedHM ? { bedHM } : {}) },
      history,
    });
    return toPlanView(plan, nowMin);
  }, [profile, history, mode, crunchEndHM, toggles, wokeHM, bedHM, quality, today, nowMin]);

  // ——— вторая половина суток: еда ———
  const bedMin = useMemo(() => {
    const bed = view.rows.find(r => r.kind === "sleep" && r.icon === "🛌");
    return bed?.startMin ?? expectedBedMin(parseHM(profile.anchorWakeHM), profile.targetSleepMin);
  }, [view.rows, profile]);

  const sleptMin = useMemo(
    () => (bedHM ? sleepDurationMin({ wokeHM, bedHM, quality }, profile.targetSleepMin) : undefined),
    [wokeHM, bedHM, quality, profile.targetSleepMin],
  );

  const foodDay = useMemo(() => {
    // читмил объявляет сам человек: в этот день приложение не считает калории
    // и не показывает меню — иначе оно спорит с решением, которое уже принято
    if (!food || isCheat) return null;
    return todayFoodDay({
      food, today, wokeHM, bedMin, ratings, swaps, noCookDays,
      night: { sleptMin, targetSleepMin: profile.targetSleepMin, quality },
    });
  }, [food, isCheat, noCookDays, wokeHM, bedMin, today, sleptMin, profile.targetSleepMin, quality, ratings, swaps]);

  // факт против плана: что из сегодняшнего меню действительно съедено
  const todayEaten = eaten?.[today];
  // остаток дня подстраивается под съеденное: плотный обед — ужин поменьше
  const balanced = useMemo(() => (foodDay ? rebalance(foodDay.day, todayEaten) : null), [foodDay, todayEaten]);

  const rows = useMemo(() => {
    if (!foodDay || !balanced) return view.rows;
    return mergeTimeline(view.rows, mealRows(balanced.day, bedMin, nowMin));
  }, [view.rows, foodDay, balanced, bedMin, nowMin]);

  const fact = useMemo(
    () => (foodDay ? eatenTotals(foodDay.day, todayEaten) : null),
    [foodDay, todayEaten],
  );
  // факт есть и когда отмечена только еда вне плана: утренняя шоколадка тоже съедена
  const hasFact = !!fact && (fact.marked > 0 || fact.kcal > 0);
  const unmarkedSlots = foodDay ? foodDay.day.meals.map(m => m.slot).filter(sl => !todayEaten?.marks[sl]) : [];
  const dinnerMin = foodDay?.day.meals.find(m => m.slot === "dinner")?.timeMin ?? 19 * 60;
  // какая доля плановой порции стоит сейчас: после пересчёта дня ужин мог стать ×0.7
  const portionOf = (slot: Slot): number => {
    const plan = foodDay?.day.meals.find(m => m.slot === slot)?.servings;
    const now = balanced?.day.meals.find(m => m.slot === slot)?.servings;
    return plan && now ? Math.round((now / plan) * 100) / 100 : 1;
  };
  const markMeal = (slot: Slot, mark: MealMark) => {
    if (!onMarkMeal || !foodDay) return;
    tap();
    onMarkMeal(today, slot, mark, foodDay.day.meals.length, foodDay.day.totals.kcal, portionOf(slot));
  };

  /**
   * Неделя еды для графика: последние семь дней, включая сегодня.
   *
   * Доля — это отмеченные «съел» приёмы к запланированным. Дни без отметок остаются
   * пустыми: отсутствие данных и ноль съеденного — разные вещи, и рисовать их одинаково
   * значило бы обвинять человека в том, чего он не делал.
   */
  const foodWeek = useMemo(() => {
    const DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
    return [...Array(7)].map((_, i) => {
      const iso = plusDaysISO(today, i - 6);
      const e = eaten?.[iso];
      const ate = e ? Object.values(e.marks).filter(m => m === "ate").length : 0;
      const share = e?.planned ? Math.min(1, ate / e.planned) : null;
      return {
        iso,
        label: DOW[new Date(iso + "T12:00:00Z").getUTCDay()] ?? "",
        share,
        followed: followedPlan(e) === true,
        cheat: cheatDays?.includes(iso) ?? false,
      };
    });
  }, [eaten, cheatDays, today]);
  const weekMarked = foodWeek.filter(d => d.share != null || d.cheat).length;

  const explanation = useMemo(() => {
    const days = toDayRecords(history, weights ?? [], eaten ?? {}, cheatDays ?? []);
    const todayRec = days.find(d => d.date === today)
      ?? { date: today, sleep: { wokeHM, bedHM: bedHM || undefined, quality } };
    return explain({
      today: todayRec,
      days: days.some(d => d.date === today) ? days : [...days, todayRec],
      targetSleepMin: profile.targetSleepMin,
      screenerFlagged: screener?.flagged,
      caffeineCutoffHM: view.rows.find(r => r.icon === "☕")?.time,
    });
  }, [history, weights, eaten, cheatDays, today, wokeHM, bedHM, quality, profile.targetSleepMin, screener, view.rows]);

  // Стрик и подсветка ближайшего шага были в pospat и потерялись при переносе:
  // первое — единственная награда за регулярность, второе — ответ на «что сейчас».
  const streak = useMemo(() => streakDays(history, today), [history, today]);
  const t = (k: keyof DayToggles) => setToggles({ ...toggles, [k]: !toggles[k] });
  const quickLog = (q: 1 | 2 | 3 | 4 | 5) => {
    tap();
    setQuality(q);
    onLog({ date: today, wokeHM, quality: q, ...(bedHM ? { bedHM } : {}), ...(toggles.hadAlcohol ? { hadAlcohol: true } : {}) });
  };
  const markBlock = (
    <>
      <label className="fld small">Во сколько встал сегодня
        <input type="time" value={wokeHM} onChange={e => { setWokeHM(e.target.value); setSavedMsg(""); }} />
      </label>
      <label className="fld small">Во сколько лёг вчера (если помнишь)
        <input type="time" value={bedHM} onChange={e => { setBedHM(e.target.value); setSavedMsg(""); }} />
      </label>
      <label className="fld small">Как спалось: {quality}/5
        <input type="range" min={1} max={5} value={quality}
          onChange={e => { setQuality(Number(e.target.value) as 1 | 2 | 3 | 4 | 5); setSavedMsg(""); }} />
      </label>
      <button className="chip on" onClick={() => {
        tap();
        onLog({ date: today, wokeHM, quality, ...(bedHM ? { bedHM } : {}), ...(toggles.hadAlcohol ? { hadAlcohol: true } : {}) });
        setSavedMsg("Сохранено ✓");
      }}>{loggedToday ? "Обновить отметку" : "Записать ночь"}</button>
      {savedMsg && <span className="small muted ml-2">{savedMsg}</span>}
    </>
  );

  return (
    <main className="wrap two-col">
      <h1 className="page-title">
        Сегодня
        <span className="page-sub">{todayLabel(now)}</span>
      </h1>
      <div className="col-side">
      {/* Самое срочное — сохранность данных: без неё всё остальное можно потерять за неделю */}
      {installHint && (
        <section className="card install-hint">
          <div className="install-head">
            <b>Safari сотрёт данные, если не заходить неделю</b>
            <button className="sheet-close" aria-label="Закрыть"
              onClick={() => { writeLS(INSTALL_HINT_KEY, true); setInstallHint(false); }}>✕</button>
          </div>
          <p className="small">
            Приложение, установленное на экран «Домой», так не делает. Три шага: кнопка
            «Поделиться» внизу Safari → «На экран „Домой“» → «Добавить».
          </p>
          <p className="small muted">
            У установленной версии своя память: сначала сохрани копию здесь («Я» → «Сохранить»),
            потом загрузи её там.
          </p>
        </section>
      )}
      {showBackup && (
        <p className="small muted backup-line">
          {backupAt ? `Копия данных — ${daysSince(backupAt, today)} дн. назад` : "Копии данных ещё нет"}
          {" · "}<button className="linkbtn small" onClick={onBackup}>Сохранить</button>
        </p>
      )}

      {/* «Что сейчас» — первый вопрос, с которым открывают приложение */}
      {view.nextIdx != null && rows[view.nextIdx] && (
        <div className="nextup">
          <span className="nextup-label">Сейчас / дальше</span>
          <span className="nextup-body">
            {rows[view.nextIdx]!.icon} {rows[view.nextIdx]!.title} · {rows[view.nextIdx]!.time}
          </span>
        </div>
      )}

      {/* Пока ночь не отмечена — это единственное действие дня, поэтому оно наверху */}
      {/* Утро в один тап. Отбой не подставляем: время, которое человек не называл,
          стало бы выдуманной ночью в истории и испортило бы подсчёт недосыпа. */}
      {!loggedToday && (
        <section className="card accent" id="mark">
          <h3 className="card-h">Как спалось?</h3>
          <div className="q-row" role="group" aria-label="Как спалось">
            {QUALITY_RU.map(([q, ru]) => (
              <button key={q} className="q-btn" onClick={() => quickLog(q)}>{ru}</button>
            ))}
          </div>
          <p className="small muted q-hint">
            встал {wokeHM} · {bedHM ? `лёг ${bedHM}` : "отбой не указан"} —{" "}
            <button className="linkbtn small" aria-expanded={markOpen}
              onClick={() => setMarkOpen(!markOpen)}>поправить</button>
          </p>
          {markOpen && <div className="reveal">{markBlock}</div>}
        </section>
      )}

      {/* Главное сообщение дня. Готовность и стрик живут в его шапке, а не отдельной
          строкой между карточками — висящая сама по себе строка выпадала из сетки. */}
      <section className="why-today">
        <div className="why-today-head">
          <span className="why-today-label">Почему сегодня так</span>
          <span className="why-today-status">
            <span className="dot" style={{ background: view.readiness.color }} />
            {view.readiness.label}
          </span>
          {streak > 0 && <span className="streak">🔥 {streak} подряд</span>}
        </div>
        <p>{explanation.textRU}</p>
        {/* Главное отличие приложения — еда под сон. Раньше от него оставалась метка
            «упрощён», а что именно изменилось, человек не видел. */}
        {foodDay && foodDay.changes.length > 0 && (
          <>
            <div className="why-changes-label">Что поменялось из-за ночи</div>
            <ul className="why-changes">{foodDay.changes.map(c => <li key={c}>{c}</li>)}</ul>
          </>
        )}
        <p className="small muted">{view.readiness.whyRU}</p>
      </section>

      {/* После быстрого старта меню собрано по умолчанию — зовём донастроить, но не заставляем */}
      {food && food.tuned === false && onSetupFood && (
        <section className="card">
          <h3 className="card-h">Донастрой меню · 1 минута</h3>
          <p className="small muted">
            Сейчас стоят настройки по умолчанию. Скажи, что не ешь, какая техника есть на кухне,
            бюджет и сколько времени готовить в будни — меню станет твоим.
          </p>
          <div className="btn-row">
            <button className="chip on" onClick={onSetupFood}>Настроить</button>
            {onTuned && <button className="linkbtn" onClick={onTuned}>не нужно</button>}
          </div>
        </section>
      )}

      {loggedToday && (
        <details className="card" id="mark">
          <summary className="card-h">Ночь отмечена ✓ — поправить</summary>
          <div className="tips-body">{markBlock}</div>
        </details>
      )}

      {isCheat ? (
        /* Читмил. Никаких цифр, никакого меню и ни одного слова про «отработать»:
           попытка компенсировать день голоданием — это возврат к жёсткому правилу,
           то есть ровно к тому, из-за чего люди и срываются (X28). */
        <div className="day-totals small">
          <b>Сегодня читмил.</b> Ешь что хочется — сегодня приложение калории не считает
          и меню не показывает. Завтра просто возвращаемся к плану.
          <p className="small muted mt-2">
            Отрабатывать этот день голоданием не надо: так делают хуже, а не лучше.
            Недельный дефицит станет меньше — это всё, что произойдёт. День запланирован
            тобой, поэтому в статистике он не считается срывом.
          </p>
        </div>
      ) : foodDay && foodDay.day.meals.length === 0 ? (
        /* Ни одного блюда: ограничения выели набор подчистую. Цифры «0 ккал» тут были бы
           издевательством — человеку нужна причина и способ починить. */
        <div className="day-totals small">
          <b>Меню на сегодня не собралось.</b>
          <p className="small note-warn mt-2">{foodDay.diagnosis.messageRU}</p>
          {onSetupFood && (
            <button className="linkbtn" onClick={onSetupFood}>Поправить ограничения →</button>
          )}
        </div>
      ) : foodDay ? (
        <div className="day-totals small">
          {/*
            * Сводка дня — крупной цифрой и кольцами, а не строкой мелкого серого текста.
            * Раньше главное число дня выглядело так же, как пояснение под ним: экран
            * приходилось читать, чтобы понять, как идут дела. Кольцо показывает долю от
            * нормы без чтения вообще.
            */}
          <div className="day-summary-card">
            <div className="day-figure">
              <b>{hasFact ? `${fact!.estimated ? "≈" : ""}${fact!.kcal}` : foodDay.day.totals.kcal}</b>
              <span>
                {hasFact
                  ? `из ${foodDay.day.totals.kcal} ккал съедено`
                  : `ккал на сегодня · белок ${foodDay.day.totals.protein} г`}
              </span>
            </div>
            {/* Все три кольца — про съеденное. Раньше два показывали факт, а клетчатка план,
                и на нетронутом дне экран выглядел сломанным: два пустых кольца рядом с полным. */}
            <DayRings rings={[
              { label: "ккал", value: fact?.kcal ?? 0,
                goal: foodDay.day.totals.kcal, color: "var(--accent)" },
              { label: "белок", value: fact?.protein ?? 0,
                goal: foodDay.safe.proteinGTarget, color: "var(--ok)" },
              { label: "клетч", value: fact?.fiber ?? 0, goal: 30, color: "var(--warn)" },
            ]} />
            {/* Пустые кольца без объяснения читаются как «приложение сломалось» */}
            {!fact?.marked && (
              <div className="small muted rings-hint">
                Кольца заполняются, когда отмечаешь приёмы: жми «съел» в ленте дня.
              </div>
            )}
          </div>
          {foodDay.day.simplified && <span className="tag">упрощён после плохой ночи</span>}
          {noCook && <span className="tag">сегодня без готовки — блюда до {NO_COOK_MIN} минут</span>}
          {balanced?.noteRU && <p className="small muted mt-2">{balanced.noteRU}</p>}
          {foodDay.ramp.active && (
            <p className="small muted mt-2">
              Вход в режим: день {foodDay.ramp.day} из {foodDay.ramp.total}. Сегодня норма выше
              конечной ({foodDay.ramp.kcalGoal} ккал) — спускаемся понемногу.
            </p>
          )}
          {fact && fact.marked > 0 && (
            <p className="small muted mt-2">
              Отмечено {fact.marked} из {foodDay.day.meals.length} приёмов · белок {fact.protein} г
              {fact.estimated && " · своя еда — прикидкой"}
            </p>
          )}
          {/* Съеденное вне плана: раньше ему некуда было попасть, и день выглядел лучше, чем был */}
          {todayEaten?.extras?.length ? (
            <ul className="extras small">
              {todayEaten.extras.map((x, k) => (
                <li key={k}>
                  <span>Вне плана: {x.text} ≈ {x.kcal} ккал</span>
                  {onExtraRemove && <button className="linkbtn small" aria-label={`Убрать «${x.text}»`}
                    onClick={() => onExtraRemove(today, k)}>убрать</button>}
                </li>
              ))}
            </ul>
          ) : null}
          {onExtraAdd && (
            <button className="linkbtn small extra-add" onClick={() => setWriting({ slot: null })}>+ съел что-то ещё</button>
          )}
          {/* Вечером — одна кнопка вместо пяти отметок. Уже отмеченное она не трогает. */}
          {onMarkAll && unmarkedSlots.length > 0 && nowMin >= dinnerMin && (
            <button className="all-plan-btn" onClick={() => {
              tap();
              onMarkAll(today, unmarkedSlots, foodDay.day.meals.length, foodDay.day.totals.kcal,
                Object.fromEntries(unmarkedSlots.map(sl => [sl, portionOf(sl)])));
            }}>✓ Весь день по плану</button>
          )}
          {foodDay.diagnosis.messageRU && (
            <p className="small note-warn mt-2">{foodDay.diagnosis.messageRU}</p>
          )}
        </div>
      ) : (
        <div className="day-totals small">
          <b>Еда пока не подключена</b> — приложение ведёт только сон.{" "}
          {onSetupFood && <button className="linkbtn" onClick={onSetupFood}>Добавить меню под свой сон →</button>}
        </div>
      )}

      {/* Неделя одним взглядом: форму недели цифра «4 из 7» не показывает.
          Появляется только когда есть что показывать. */}
      {food && !isCheat && weekMarked > 0 && (
        <section className="card">
          <h3 className="card-h">Неделя по еде</h3>
          <WeekFoodBars days={foodWeek} />
          <p className="small muted mt-2">
            Отмечено дней: {weekMarked} из 7. Высота — сколько приёмов дня съедено по плану;
            пустая рамка значит, что день не отмечался.
          </p>
        </section>
      )}

      </div>

      <div className="col-main">

      {/* Одна лента суток: сон и еда на общей оси времени, а не два раздела */}
      <ol className="timeline">
        {rows.map((r, i) => (
          <li key={i} className={"row" + (r.past ? " past" : "") + (r.kind === "food" ? " food" : "") + (i === view.nextIdx ? " now" : "")}>
            <div className="row-time">{r.time}{r.endTime ? `–${r.endTime}` : ""}</div>
            <SwipeRow enabled={r.kind === "food" && !!r.slot && !!onMarkMeal}
              leftLabel="съел ✓" rightLabel="своё"
              onLeft={() => r.slot && todayEaten?.marks[r.slot] !== "ate" && markMeal(r.slot, "ate")}
              onRight={() => r.slot && todayEaten?.marks[r.slot] !== "own" && markMeal(r.slot, "own")}>
            <div className="row-body">
              {/* Фотография блюда. Строка еды без картинки читается как строка таблицы —
                  а это единственное место, где человек решает, будет он это готовить. */}
              {r.photo && (
                <img className="row-photo" src={r.photo} alt="" loading="lazy" decoding="async" />
              )}
              {r.kicker && <div className="row-kicker">{r.icon} {r.kicker}</div>}
              {/* У еды название — кнопка: рецепт открывается здесь же, а не через «Еду» */}
              {r.kind === "food" && r.meal ? (
                <button className="row-title row-title-btn" onClick={() => setOpenRecipe(r.meal!)}>
                  {r.title}<span className="row-go" aria-hidden="true">›</span>
                </button>
              ) : (
                <div className="row-title">{`${r.icon} ${r.title}`}</div>
              )}
              <div className="row-detail">{r.detail}</div>
              {/* «Почему» — под спойлером: три уровня текста в каждой строке превращали
                  ленту в документ. Причина никуда не делась, она в одном нажатии. */}
              <details className="row-why-box">
                <summary className="small muted">почему так</summary>
                <div className="row-why muted small">{r.why}</div>
              </details>
              {/* Факт рядом с планом. Пропущенный приём — это данные, а не провал,
                  поэтому ничего не осуждаем и ничего не подсвечиваем красным. */}
              {r.kind === "food" && r.slot && onMarkMeal && (
                <div className="eat-row">
                  {([["ate", "съел"], ["own", "своё"]] as const).map(([m, ru]) => (
                    <button key={m} className={todayEaten?.marks[r.slot!] === m ? "eat-btn on" : "eat-btn"}
                      aria-pressed={todayEaten?.marks[r.slot!] === m}
                      onClick={() => markMeal(r.slot!, m)}>{ru}</button>
                  ))}
                </div>
              )}
              {/* Своя еда — «сколько примерно». Без этого она считалась нулём и сводка врала. */}
              {r.kind === "food" && r.slot && todayEaten?.marks[r.slot] === "own" && onOwnSize && (
                <div className="own-size">
                  <div className="small muted">Сколько примерно?</div>
                  <div className="chips">
                    {OWN_SIZES.map(([sz, ru]) => {
                      const on = !todayEaten?.ownText?.[r.slot!] && (todayEaten?.sizes?.[r.slot!] ?? "usual") === sz;
                      return (
                        <button key={sz} className={on ? "chip on" : "chip"} aria-pressed={on}
                          onClick={() => { tap(); onOwnSize(today, r.slot!, sz); }}>{ru}</button>
                      );
                    })}
                    {onOwnWritten && (
                      <button className={todayEaten?.ownText?.[r.slot!] ? "chip on" : "chip"}
                        onClick={() => setWriting({ slot: r.slot! })}>✎ написать</button>
                    )}
                  </div>
                  {todayEaten?.ownText?.[r.slot!] && (
                    <div className="small muted">
                      «{todayEaten.ownText[r.slot!]!.text}» ≈ {todayEaten.ownText[r.slot!]!.kcal} ккал
                    </div>
                  )}
                </div>
              )}
            </div>
            </SwipeRow>
          </li>
        ))}
      </ol>

      {writing && foodDay && (
        <EatSheet title={writing.slot ? "Что ты съел вместо плана?" : "Что ты съел ещё?"}
          onClose={() => setWriting(null)}
          onSave={food => {
            if (writing.slot) onOwnWritten?.(today, writing.slot, food);
            else onExtraAdd?.(today, food, foodDay.day.meals.length);
          }} />
      )}

      {openRecipe && (
        <Sheet title={openRecipe.recipe.name} onClose={() => setOpenRecipe(null)}>
          <MealIngredients meal={openRecipe} household={food?.household ?? 1} />
        </Sheet>
      )}

      {/* Настройки дня нужны не каждый день — по умолчанию свёрнуты */}
      <details className="card">
        <summary className="card-h">Сегодня всё иначе?</summary>
        {/*
          * Три группы вместо россыпи кнопок разной ширины.
          *
          * Раньше здесь лежали восемь чипов подряд — «обычный день», «нельзя вздремнуть»,
          * «читмил», «напоминания», — и глазу не за что было зацепиться: одинаковые с виду
          * кнопки означали разное. Теперь видно устройство: каким сегодня день (выбор один
          * из трёх), чего сегодня не будет (независимые переключатели), и отдельные решения.
          */}
        <div className="tips-body">
          <div className="day-group">
            <div className="day-group-label small muted">Каким сегодня будет день</div>
            <div className="seg" role="group" aria-label="Каким сегодня будет день">
              {([["normal", "Обычный"], ["crunch", "Допоздна"], ["recovery", "Отсыпаюсь"]] as const).map(([v, ru]) => (
                <button key={v} className={mode === v ? "seg-item on" : "seg-item"}
                  aria-pressed={mode === v} onClick={() => setMode(v)}>{ru}</button>
              ))}
            </div>
            {mode === "crunch" && (
              <label className="fld small">До скольких сегодня работаешь
                <input type="time" value={crunchEndHM} onChange={e => setCrunchEndHM(e.target.value)} />
              </label>
            )}
          </div>

          <div className="day-group">
            <div className="day-group-label small muted">Чего сегодня не будет</div>
            <div className="chips-grid">
              <button className={toggles.napUnavailable ? "chip on" : "chip"} onClick={() => t("napUnavailable")}>Не вздремнуть</button>
              <button className={toggles.noBrightLight ? "chip on" : "chip"} onClick={() => t("noBrightLight")}>Нет света</button>
              <button className={toggles.noCaffeine ? "chip on" : "chip"} onClick={() => t("noCaffeine")}>Без кофеина</button>
              <button className={toggles.hadAlcohol ? "chip on" : "chip"} onClick={() => t("hadAlcohol")}>🍷 Был алкоголь</button>
            </div>
          </div>

          <div className="day-group">
            {onNoCook && food && !isCheat && (
              <button className={noCook ? "chip on wide" : "chip wide"} aria-pressed={noCook}
                onClick={() => { tap(); onNoCook(today, !noCook); }}>
                🥪 Сегодня не готовлю
              </button>
            )}
            {onCheatDay && (
              <button className={isCheat ? "chip on wide" : "chip wide"}
                onClick={() => { tap(); onCheatDay(today, !isCheat); }}>
                🍕 Сегодня читмил
              </button>
            )}
            <button className={notifOn ? "chip on wide" : "chip wide"}
              onClick={async () => setNotifMsg(await enableNotifications(profile))}>
              {notifOn ? "🔔 Напоминания включены" : "🔔 Включить напоминания"}
            </button>
            {notifMsg && <p className="muted small">{notifMsg}</p>}
          </div>
        </div>
      </details>

      {view.notes.length > 0 && (
        <ul className="notes small">{view.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      </div>
    </main>
  );
}
