import React, { useMemo, useState } from "react";
import type { Profile, DayLog } from "../index.js";
import { weeklyInsight } from "../index.js";
import { targetsFor, type FoodSettings } from "./storage.js";
import { targetsForToday } from "../food/index.js";
import { followedPlan, type DayEaten } from "../food/eaten.js";
import { anchor, anchorSummaryRU } from "../anchor.js";
import { toDayRecords } from "./dayRecords.js";
import { localDateISO, plusDaysISO } from "../today-date.js";
import { nextStep } from "../next-step.js";
import { plateau } from "../plateau.js";
import { SleepSparkline, WeightChart } from "./Charts.js";
import { tap } from "./haptics.js";

/**
 * Итоги: где ты сейчас и что дальше.
 *
 * Здесь то, на что СМОТРЯТ, — в отличие от экрана «Еда», где то, что делают руками.
 * Раньше и то и другое лежало на одном экране «Неделя»: восемь карточек подряд,
 * где список покупок приходилось искать под пятью блоками аналитики.
 *
 * Порядок карточек — по убыванию срочности: один следующий шаг, где ты в лестнице входа,
 * почему стоит вес, как прошла неделя, ровность режима. Первое, что видно, — действие,
 * а не цифры: цифры без действия только тревожат.
 */
export function Progress({ profile, history, food, weights, eaten, cheatDays, onAddWeight }: {
  profile: Profile;
  history: DayLog[];
  food?: FoodSettings;
  weights?: { date: string; kg: number }[];
  eaten?: Record<string, DayEaten>;
  cheatDays?: string[];
  onAddWeight: (kg: number) => void;
}) {
  const [kg, setKg] = useState("");
  const today = localDateISO();

  const insight = useMemo(
    () => weeklyInsight(history, today, profile.targetSleepMin),
    [history, today, profile.targetSleepMin],
  );

  const records = useMemo(
    () => toDayRecords(history, weights ?? [], eaten ?? {}, cheatDays ?? []),
    [history, weights, eaten, cheatDays],
  );
  const anchorInfo = useMemo(() => anchor(records, profile.targetSleepMin), [records, profile.targetSleepMin]);
  const step = useMemo(() => nextStep(records, !!food), [records, food]);
  const plateauInfo = useMemo(() => plateau(records, profile.targetSleepMin), [records, profile.targetSleepMin]);

  /** Где человек в лестнице входа. Меню для этого собирать не нужно — только цели. */
  const ramp = useMemo(() => {
    if (!food) return null;
    const safe = targetsFor(food);
    return targetsForToday(safe, food.startISO, today, food.pace).ramp;
  }, [food, today]);

  // качество сна по дням за последнюю неделю — для спарклайна
  const qualitySeries = useMemo(() => {
    const base = Date.parse(today + "T00:00:00Z");
    return [...Array(7)].map((_, i) => {
      const d = new Date(base - (6 - i) * 86_400_000).toISOString().slice(0, 10);
      return history.find(h => h.date === d)?.quality ?? null;
    });
  }, [history, today]);

  // за последнюю неделю: сколько дней прошло по плану еды из тех, что вообще отмечались
  const foodWeek = useMemo(() => {
    const from = plusDaysISO(today, -6);
    const cheat = new Set(cheatDays ?? []);
    const marks = Object.entries(eaten ?? {})
      .filter(([d]) => d >= from && d <= today && !cheat.has(d))
      .map(([, e]) => followedPlan(e))
      .filter((v): v is boolean => v !== undefined);
    const cheats = (cheatDays ?? []).filter(d => d >= from && d <= today).length;
    return { marked: marks.length, followed: marks.filter(Boolean).length, cheats };
  }, [eaten, cheatDays, today]);

  const weightSeries = weights ?? [];
  const delta = weightSeries.length >= 2
    ? weightSeries[0]!.kg - weightSeries[weightSeries.length - 1]!.kg
    : null;

  return (
    <main className="wrap">
      <h1 className="page-title">
        Итоги
        <span className="page-sub">как идут дела и что дальше</span>
      </h1>

      <section className="card accent">
        <h3 className="card-h">Что дальше</h3>
        <p style={{ margin: "0 0 4px" }}>{step.titleRU}</p>
        <p className="small muted" style={{ margin: 0 }}>{step.whyRU}</p>
        {step.need > 1 && step.done < step.need && (
          <p className="small muted" style={{ marginTop: 6 }}>Уже есть: {step.done} из {step.need}.</p>
        )}
      </section>

      {/* Где ты в лестнице. Без этого низкая цель выглядит как обещание, которое приложение
          почему-то не выполняет: в «Сегодня» одна цифра, в цели — другая. */}
      {ramp?.active && (
        <section className="card">
          <h3 className="card-h">Вход в режим</h3>
          <div className="ramp-row">
            <div className="ramp-bar" role="img" aria-label={`День ${ramp.day} из ${ramp.total}`}>
              <span style={{ width: `${Math.round((ramp.day / ramp.total) * 100)}%` }} />
            </div>
            <span className="small muted">день {ramp.day} из {ramp.total}</span>
          </div>
          <p className="small">
            Сегодня <b>{ramp.kcalToday} ккал</b>, цель — {ramp.kcalGoal}.
            Спускаемся понемногу: так первая неделя не отбивает желание.
          </p>
          <p className="small muted">
            Вес первые недели будет идти медленнее, чем при резком старте. Смысл не в скорости,
            а в том, чтобы дойти: с плавным входом бросают заметно реже.
          </p>
        </section>
      )}

      {plateauInfo.messageRU && (
        <section className="card">
          <h3 className="card-h">Почему вес стоит</h3>
          <p className="small">{plateauInfo.messageRU}</p>
          <p className="small muted">Это не расчёт, а взгляд на два ряда сразу — куда посмотреть в первую очередь.</p>
        </section>
      )}

      {/* Карточка появляется, когда в ней есть хоть что-то, кроме нулей: «Ночей отмечено: 0/7»
          в одиночестве — это не итог недели, а напоминание о пустоте. Что делать дальше,
          уже сказано выше, в «Что дальше». */}
      {(insight.daysLogged > 0 || foodWeek.marked > 0 || foodWeek.cheats > 0) && (
      <section className="card">
        <h3 className="card-h">Как прошла неделя</h3>
        <div className="week-stats small">
          <span>Ночей отмечено: {insight.daysLogged}/7</span>
          {insight.daysLogged >= 2 && <span>Регулярность: {insight.regularity}/100</span>}
          {insight.avgSleepMin != null && <span>Средний сон: {(insight.avgSleepMin / 60).toFixed(1)} ч</span>}
          {insight.avgQuality != null && <span>Качество: {insight.avgQuality}/5</span>}
        </div>
        {insight.daysLogged >= 2 && (
          <div className="spark-row">
            <SleepSparkline series={qualitySeries} />
            <span className="small muted">качество сна, 7 дней</span>
          </div>
        )}
        {/* Приверженность еде считается по отметкам «съел», а не по отметкам сна:
            раньше их просто не существовало, и про еду приложение ничего не знало. */}
        {foodWeek.marked > 0 && (
          <p className="small" style={{ marginTop: 8 }}>
            По плану еды прошло <b>{foodWeek.followed} из {foodWeek.marked}</b> отмеченных дней.
          </p>
        )}
        {foodWeek.cheats > 0 && (
          <p className="small muted" style={{ marginTop: 4 }}>
            Читмилов за неделю: {foodWeek.cheats}. Они запланированы тобой и в счёт выше не входят.
          </p>
        )}
      </section>
      )}

      <section className="card">
        <h3 className="card-h">Вес</h3>
        {delta != null && (
          <p className="small" style={{ marginTop: 0 }}>
            С первого замера: <b>{delta > 0 ? "−" : "+"}{Math.abs(delta).toFixed(1)} кг</b>
          </p>
        )}
        <WeightChart weights={weightSeries} goal={food?.profile.goalWeightKg} />
        {insight.avgSleepMin != null && delta != null && delta > 0 && insight.avgSleepMin < profile.targetSleepMin - 45 && (
          <p className="small note-warn">
            Вес снижается, но сон за неделю короче цели. Это стоит держать в голове: при таком
            сне в исследованиях меньшая часть потерянного веса приходится на жир.
          </p>
        )}
        {/* Поле веса: крупная цифра и подпись «кг» внутри поля — чтобы это читалось
            как замер, а не как случайное поле формы посреди карточки */}
        <div className="w-input">
          <div className="w-field">
            <input type="number" inputMode="decimal" step="0.1" placeholder="0,0" value={kg}
              onChange={e => setKg(e.target.value)} aria-label="Вес в килограммах" />
            <span className="w-unit">кг</span>
          </div>
          <button className="w-save" disabled={!+kg}
            onClick={() => { const v = +kg; if (v) { tap(); onAddWeight(v); setKg(""); } }}>
            Записать
          </button>
        </div>
        <p className="small muted">Взвешивайся раз в неделю в одно время: одна цифра прыгает, линия за недели показывает правду.</p>
      </section>

      {/* Карточка появляется вместе с цифрой. Пока ночей мало, она повторяла бы слово
          в слово то, что уже сказано в «Что дальше» («отметь ещё N ночей»), — а один
          и тот же призыв дважды на экране читается как шум, а не как настойчивость.
          Выдуманная сотня, которая стояла здесь раньше, — тем более неправда. */}
      {anchorInfo.score != null && (
      <section className="card">
        <h3 className="card-h">Ровность режима</h3>
        <div className="anchor-row">
          <div className="anchor-num">{anchorInfo.score}<span className="small">/100</span></div>
          <div className="small muted">
            {anchorInfo.socialJetlagMin == null
              ? "насколько одинаково ты встаёшь изо дня в день"
              : <>встаёшь ли в одно время и насколько выходные уезжают от будней
                (<b>на {anchorInfo.socialJetlagMin} мин</b>)</>}
          </div>
        </div>
        <p className="small">{anchorInfo.verdictRU}</p>
        {anchorInfo.socialJetlagMin != null && (
          <p className="small muted">{anchorSummaryRU(anchorInfo)}</p>
        )}
        <p className="small muted">
          Зачем это: по наблюдениям на 231 тысяче человек ровный режим связан с меньшим весом
          и объёмом талии — сам по себе, отдельно от еды и количества сна.
        </p>
      </section>
      )}
    </main>
  );
}
