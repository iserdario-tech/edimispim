import React, { useEffect, useMemo, useState } from "react";
import type { Profile, DayLog, DayMode, DayToggles, ScreenerResult } from "../index.js";
import { planDay, parseHM, sleepDurationMin, streakDays } from "../index.js";
import { toPlanView } from "./viewModel.js";
import { loadDayDraft, saveDayDraft, type FoodSettings } from "./storage.js";
import { enableNotifications, syncPushContext } from "./notifications.js";
import { computeTargets, applySafety, filterRecipes, generateAdaptedDay, expectedBedMin, diagnosePool, targetsForToday, prefersFamiliar } from "../food/index.js";
import type { Recipe, Slot } from "../food/types.js";
import { eatenTotals, type DayEaten, type MealMark } from "../food/eaten.js";
import recipesJson from "../food/data/recipes.json";
import { mealRows, mergeTimeline } from "./mealRows.js";
import { tap } from "./haptics.js";
import { explain } from "../explain.js";
import { toDayRecords } from "./dayRecords.js";
import { localDateISO, localMinutes } from "../today-date.js";
import { useNow } from "./useNow.js";

const RECIPES = recipesJson as Recipe[];

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

export function Today({ profile, history, screener, onLog, food, weights, eaten, ratings, cheatDays, onMarkMeal, onCheatDay, onSetupFood }: {
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
  onMarkMeal?: (date: string, slot: Slot, mark: MealMark, planned: number) => void;
  onCheatDay?: (date: string, on: boolean) => void;
  onSetupFood?: () => void;
}) {
  // «сейчас» обязано идти вперёд, пока экран открыт: у PWA он живёт часами без перезагрузки
  const now = useNow();
  const today = localDateISO(now);        // по местному времени: за полночь день уже новый
  const nowMin = localMinutes(now);
  const [draft] = useState(() => loadDayDraft(today));
  const [mode, setMode] = useState<DayMode>(draft?.mode ?? "normal");
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
    const base = applySafety(computeTargets(food.profile), food.profile, food.screen ?? {});
    // во время вхождения в дефицит цель на сегодня своя — она выше конечной и снижается по дням
    const { targets: safe, ramp } = targetsForToday(base, food.startISO, today, food.pace);
    const rated = Object.entries(ratings ?? {});
    const pool = filterRecipes(RECIPES, {
      ...food.constraints,
      bannedIds: rated.filter(([, v]) => v === -1).map(([id]) => id),
    });
    if (!pool.length) return null;
    const diagnosis = diagnosePool(pool, food.mealCount);
    const day = generateAdaptedDay(
      safe, pool,
      { rhythm: { wakeMin: parseHM(wokeHM), bedMin }, mealCount: food.mealCount,
        offset: new Date(today).getDay(), familiar: prefersFamiliar(ramp),
        liked: rated.filter(([, v]) => v === 1).map(([id]) => id) },
      { sleptMin, targetSleepMin: profile.targetSleepMin, quality },
    );
    return { day, safe, diagnosis, ramp };
  }, [food, isCheat, wokeHM, bedMin, today, sleptMin, profile.targetSleepMin, quality, ratings]);

  const rows = useMemo(() => {
    if (!foodDay) return view.rows;
    return mergeTimeline(view.rows, mealRows(foodDay.day, bedMin, nowMin));
  }, [view.rows, foodDay, bedMin, nowMin]);

  // факт против плана: что из сегодняшнего меню действительно съедено
  const todayEaten = eaten?.[today];
  const fact = useMemo(
    () => (foodDay ? eatenTotals(foodDay.day, todayEaten) : null),
    [foodDay, todayEaten],
  );
  const markMeal = (slot: Slot, mark: MealMark) => {
    if (!onMarkMeal || !foodDay) return;
    tap();
    onMarkMeal(today, slot, mark, foodDay.day.meals.length);
  };

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
      {savedMsg && <span className="small muted" style={{ marginLeft: 8 }}>{savedMsg}</span>}
    </>
  );

  return (
    <main className="wrap two-col">
      <h1 className="page-title">
        Сегодня
        <span className="page-sub">{todayLabel(now)}</span>
      </h1>
      <div className="col-side">
      {/* Главное сообщение дня — первое, что видно */}
      <section className="why-today">
        <div className="why-today-label">Почему сегодня так</div>
        <p>{explanation.textRU}</p>
      </section>

      <div className="status-line">
        <span className="dot" style={{ background: view.readiness.color }} />
        <b>{view.readiness.label}</b>
        <span className="small muted">{view.readiness.whyRU}</span>
        {streak > 0 && <span className="streak">🔥 {streak} подряд</span>}
      </div>

      {/* Пока ночь не отмечена — это единственное действие дня, поэтому оно наверху.
          После отметки сворачивается и не мешает. */}
      {loggedToday ? (
        <details className="card" id="mark">
          <summary className="card-h">Ночь отмечена ✓ — поправить</summary>
          <div className="tips-body">{markBlock}</div>
        </details>
      ) : (
        <section className="card accent" id="mark">
          <h3 className="card-h">Отметь, как спалось</h3>
          <p className="small muted">С этого весь день и строится: план еды подстроится под ночь.</p>
          {markBlock}
        </section>
      )}

      {isCheat ? (
        /* Читмил. Никаких цифр, никакого меню и ни одного слова про «отработать»:
           попытка компенсировать день голоданием — это возврат к жёсткому правилу,
           то есть ровно к тому, из-за чего люди и срываются (X28). */
        <div className="day-totals small">
          <b>Сегодня читмил.</b> Ешь что хочется — сегодня приложение калории не считает
          и меню не показывает. Завтра просто возвращаемся к плану.
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Отрабатывать этот день голоданием не надо: так делают хуже, а не лучше.
            Недельный дефицит станет меньше — это всё, что произойдёт. День запланирован
            тобой, поэтому в статистике он не считается срывом.
          </p>
        </div>
      ) : foodDay ? (
        <div className="day-totals small">
          <b>День целиком:</b> {foodDay.day.totals.kcal} ккал · белок {foodDay.day.totals.protein} г ·
          клетчатка {foodDay.day.totals.fiber} г
          {foodDay.day.simplified && <span className="tag"> · упрощён после плохой ночи</span>}
          {foodDay.ramp.active && (
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              Вход в режим: день {foodDay.ramp.day} из {foodDay.ramp.total}. Сегодня норма выше
              конечной ({foodDay.ramp.kcalGoal} ккал) — спускаемся понемногу.
            </p>
          )}
          {fact && fact.marked > 0 && (
            <p className="small" style={{ margin: "6px 0 0" }}>
              Съедено: <b>{fact.kcal} из {foodDay.day.totals.kcal} ккал</b> · белок {fact.protein} г ·
              отмечено {fact.marked} из {foodDay.day.meals.length}
              {fact.marked > fact.ate && <span className="muted"> (часть — своей едой)</span>}
            </p>
          )}
          {foodDay.diagnosis.messageRU && (
            <p className="small note-warn" style={{ marginTop: 8 }}>{foodDay.diagnosis.messageRU}</p>
          )}
        </div>
      ) : (
        <div className="day-totals small">
          <b>Еда пока не подключена</b> — приложение ведёт только сон.{" "}
          {onSetupFood && <button className="linkbtn" onClick={onSetupFood}>Добавить меню под свой сон →</button>}
        </div>
      )}

      </div>

      <div className="col-main">
      {view.nextIdx != null && rows[view.nextIdx] && (
        <div className="nextup">
          <span className="nextup-label">Сейчас / дальше</span>
          <span className="nextup-body">
            {rows[view.nextIdx]!.icon} {rows[view.nextIdx]!.title} · {rows[view.nextIdx]!.time}
          </span>
        </div>
      )}

      {/* Одна лента суток: сон и еда на общей оси времени, а не два раздела */}
      <ol className="timeline">
        {rows.map((r, i) => (
          <li key={i} className={"row" + (r.past ? " past" : "") + (r.kind === "food" ? " food" : "") + (i === view.nextIdx ? " now" : "")}>
            <div className="row-time">{r.time}{r.endTime ? `–${r.endTime}` : ""}</div>
            <div className="row-body">
              <div className="row-title">{r.icon} {r.title}</div>
              <div className="row-detail">{r.detail}</div>
              <div className="row-why muted small">{r.why}</div>
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
            </div>
          </li>
        ))}
      </ol>

      {/* Настройки дня нужны не каждый день — по умолчанию свёрнуты */}
      <details className="card">
        <summary className="card-h">Сегодня всё иначе?</summary>
        <div className="tips-body">
          <div className="chips">
            <button className={mode === "normal" ? "chip on" : "chip"} onClick={() => setMode("normal")}>Обычный день</button>
            <button className={mode === "crunch" ? "chip on" : "chip"} onClick={() => setMode("crunch")}>Работаю допоздна</button>
            <button className={mode === "recovery" ? "chip on" : "chip"} onClick={() => setMode("recovery")}>Отсыпаюсь</button>
          </div>
          {mode === "crunch" && (
            <label className="fld small">До скольких сегодня работаешь
              <input type="time" value={crunchEndHM} onChange={e => setCrunchEndHM(e.target.value)} />
            </label>
          )}
          <div className="chips">
            <button className={toggles.napUnavailable ? "chip on" : "chip"} onClick={() => t("napUnavailable")}>Нельзя вздремнуть</button>
            <button className={toggles.noBrightLight ? "chip on" : "chip"} onClick={() => t("noBrightLight")}>Нет дневного света</button>
            <button className={toggles.noCaffeine ? "chip on" : "chip"} onClick={() => t("noCaffeine")}>Без кофеина</button>
            <button className={toggles.hadAlcohol ? "chip on" : "chip"} onClick={() => t("hadAlcohol")}>🍷 Вчера был алкоголь</button>
            {onCheatDay && (
              <button className={isCheat ? "chip on" : "chip"}
                onClick={() => { tap(); onCheatDay(today, !isCheat); }}>
                🍕 Сегодня читмил
              </button>
            )}
          </div>
          <button className={notifOn ? "chip on" : "chip"} onClick={async () => setNotifMsg(await enableNotifications(profile))}>
            {notifOn ? "🔔 Напоминания включены" : "🔔 Включить напоминания"}
          </button>
          {notifMsg && <p className="muted small">{notifMsg}</p>}
        </div>
      </details>

      {view.notes.length > 0 && (
        <ul className="notes small">{view.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      </div>
    </main>
  );
}
