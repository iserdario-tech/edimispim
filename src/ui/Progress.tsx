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
import { stopBang, nightEating } from "../screening.js";
import { sleepFoodLink, monthRecap } from "../sleep-food.js";
import { expenditure } from "../expenditure.js";
import { readLS, writeLS } from "./localStore.js";

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
export function Progress({ profile, history, food, weights, eaten, cheatDays, onAddWeight, onAdjustKcal }: {
  profile: Profile;
  history: DayLog[];
  food?: FoodSettings;
  weights?: { date: string; kg: number }[];
  eaten?: Record<string, DayEaten>;
  cheatDays?: string[];
  onAddWeight: (kg: number) => void;
  /** Принять поправку нормы по реальному расходу (шаг в ккал; 0 — сбросить поправку). */
  onAdjustKcal?: (step: number) => void;
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
  // последние 60 дней: старые привычки не должны заслонять нынешние
  const link = useMemo(
    () => sleepFoodLink(records.filter(r => r.date >= plusDaysISO(today, -60)), profile.targetSleepMin),
    [records, today, profile.targetSleepMin],
  );
  // реальный расход по весу и отмеченной еде (research-2026-09-23, раздел 2)
  const exp = useMemo(() => {
    if (!food) return null;
    const base = targetsFor(food);
    // дни до поправки нормы считаются по норме без неё — съедено было по тогдашней
    const unadjusted = targetsFor({ ...food, kcalAdjust: 0 });
    const targetOf = (iso: string) => targetsForToday(
      food.kcalAdjustAt && iso < food.kcalAdjustAt ? unadjusted : base, food.startISO, iso, food.pace).targets.kcalTarget;
    return {
      formulaTdee: base.tdee, tempo: base.tempoKgPerWeek,
      r: expenditure({
        today, weights: weights ?? [], eaten: eaten ?? {}, mealCount: food.mealCount, targetOf,
        currentTarget: targetOf(today),
        ...(food.startISO ? { startISO: food.startISO } : {}),
        ...(cheatDays ? { cheatDays } : {}),
        ...(food.kcalAdjustAt ? { lastAdjustISO: food.kcalAdjustAt } : {}),
      }),
    };
  }, [food, weights, eaten, cheatDays, today]);
  // «не сейчас» прячет предложение на неделю — к следующему пересчёту
  const [expHiddenAt, setExpHiddenAt] = useState(() => readLS<string | null>("edimispim.expHidden", null));
  const expHidden = !!expHiddenAt && plusDaysISO(expHiddenAt, 7) > today;

  // итог ПРОШЛОГО месяца: текущий ещё не закончен
  const prevMonth = useMemo(() => {
    const d = new Date(today + "T12:00:00Z"); d.setUTCDate(0);
    const ym = d.toISOString().slice(0, 7);
    return { ym, name: d.toLocaleDateString("ru-RU", { month: "long", timeZone: "UTC" }), recap: monthRecap(records, ym) };
  }, [records, today]);

  /**
   * Вердикты скрининга стыка. Считаются из сохранённых ответов, а не хранятся текстом:
   * формулировки живут в одном месте и правятся один раз.
   */
  const screening = useMemo(() => {
    const a = food?.screening;
    if (!a || !food) return [];
    const out: { titleRU: string; messageRU: string }[] = [];
    if (a.stopBang) {
      const bmi = food.profile.weightKg / Math.pow(food.profile.heightCm / 100, 2);
      const r = stopBang(a.stopBang, { bmi, age: food.profile.age, sex: food.profile.sex });
      if (r.flagged) out.push({ titleRU: `Похоже на апноэ сна · риск ${r.levelRU}`, messageRU: r.messageRU });
    }
    if (a.nes) {
      const r = nightEating(a.nes);
      if (r.flagged) out.push({ titleRU: "Еда сдвинута на вечер и ночь", messageRU: r.messageRU });
    }
    return out;
  }, [food]);

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
        <p className="mb-1">{step.titleRU}</p>
        <p className="small muted m-0">{step.whyRU}</p>
        {step.need > 1 && step.done < step.need && (
          <p className="small muted mt-2">Уже есть: {step.done} из {step.need}.</p>
        )}
      </section>

      {/*
        * Сон и еда у тебя — ради этой карточки приложение и просит отмечать и ночи, и еду.
        * Полосы одного цвета: зелёный и оранжевый выносили бы приговор «хорошо / плохо»,
        * а это наблюдение. Подписи стоят прямо у полос, поэтому цвет ничего не кодирует.
        */}
      {food && (
        <section className="card">
          <h3 className="card-h">Сон и еда у тебя</h3>
          {link.ready ? (
            <>
              {([["После обычной ночи", link.good], ["После плохой ночи", link.rough]] as const).map(([ru, g]) => (
                <div key={ru} className="link-bar">
                  <div className="link-bar-head small">
                    <span>{ru}</span>
                    <b>{g.followed} из {g.total} дней по плану</b>
                  </div>
                  <div className="link-track" role="img" aria-label={`${ru}: ${g.followed} из ${g.total} дней по плану`}>
                    <div className="link-fill" style={{ width: `${(g.followed / g.total) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="small muted mt-2">
                Это наблюдение, а не вывод о причинах: в плохие дни могло совпасть и что-то ещё.
                Плохая ночь — оценка 1–2 или сна на час меньше цели.
              </p>
            </>
          ) : (
            <p className="small muted m-0">
              Покажет, держится ли план после плохой ночи так же, как после обычной. Нужно хотя бы
              по 3 дня с отметками еды после обычных и после плохих ночей — сейчас {link.good} и {link.rough}.
            </p>
          )}
        </section>
      )}

      {exp && (
        <section className="card">
          <h3 className="card-h">Твой реальный расход</h3>
          {exp.r.status === "wait" && (
            <p className="small m-0">
              Пока считаем по формуле: ≈ {exp.formulaTdee} ккал в день. Через {exp.r.daysLeft} дн.
              посчитаем по твоим данным — для этого взвешивайся 4 раза в неделю и чаще, утром,
              и отмечай все приёмы дня.
            </p>
          )}
          {exp.r.status === "data" && (
            <p className="small m-0">
              Для расчёта по данным не хватает записей за последние 4 недели: взвешиваний
              {" "}{exp.r.weighIns} из {exp.r.weighInsNeed}, недель, где записано 5+ дней, — {exp.r.weeksLogged} из {exp.r.weeks}.
              Незаписанный день не считается нулём — его просто пропускаем. Пока норма по формуле: ≈ {exp.formulaTdee} ккал.
            </p>
          )}
          {exp.r.status === "uncertain" && (
            <p className="small m-0">
              ≈ {exp.r.tdee} ккал в день, но разброс ±{exp.r.ci} — слишком широкий, чтобы менять норму.
              Чаще взвешивайся — точность вырастет.
            </p>
          )}
          {exp.r.status === "ready" && (
            <>
              <div className="exp-figure"><b>≈ {exp.r.tdee}</b><span>ккал в день · ±{exp.r.ci}</span></div>
              <p className="small">
                За 4 недели вес снижался на {exp.r.lossPerWeek} кг в неделю, план рассчитан на {exp.tempo}.
                {exp.r.step === 0 && " Норма совпадает с реальным расходом — менять ничего не надо."}
              </p>
              {exp.r.step !== 0 && exp.r.nextChangeInDays > 0 && (
                <p className="small muted">Следующую поправку можно будет принять через {exp.r.nextChangeInDays} дн. — норму не меняют чаще раза в 2 недели.</p>
              )}
              {exp.r.step !== 0 && exp.r.nextChangeInDays === 0 && !expHidden && onAdjustKcal && (
                <div className="btn-row">
                  <button className="chip on" onClick={() => { tap(); onAdjustKcal(exp.r.status === "ready" ? exp.r.step : 0); }}>
                    {exp.r.step < 0 ? `Убрать ${-exp.r.step} ккал` : `Добавить ${exp.r.step} ккал`}
                  </button>
                  <button className="linkbtn" onClick={() => { writeLS("edimispim.expHidden", today); setExpHiddenAt(today); }}>не сейчас</button>
                </div>
              )}
            </>
          )}
          {food?.kcalAdjust ? (
            <p className="small muted mt-2">
              Норма уже поправлена на {food.kcalAdjust > 0 ? "+" : ""}{food.kcalAdjust} ккал.{" "}
              {onAdjustKcal && <button className="linkbtn small" onClick={() => onAdjustKcal(0)}>сбросить</button>}
            </p>
          ) : null}
          <p className="small muted mt-2">
            Это расчёт по твоим записям и весу, а не замер. Тренировки уже учтены — они видны в весе.
            Читмилы и незаписанные дни в расчёт не входят. Норма не опустится ниже безопасного минимума.
          </p>
        </section>
      )}

      {prevMonth.recap && (
        <section className="card">
          <h3 className="card-h month-h">{prevMonth.name}</h3>
          <div className="stat-grid">
            <div><b>{prevMonth.recap.nights}</b><span>ночей отмечено</span></div>
            <div>
              <b>{prevMonth.recap.avgSleepMin != null
                ? `${Math.floor(prevMonth.recap.avgSleepMin / 60)} ч ${prevMonth.recap.avgSleepMin % 60} мин` : "—"}</b>
              <span>{prevMonth.recap.avgSleepMin != null ? "средний сон" : "сон: отбой не отмечался"}</span>
            </div>
            <div><b>{prevMonth.recap.followed} из {prevMonth.recap.marked}</b><span>дней еды по плану</span></div>
            <div>
              <b>{prevMonth.recap.weightFrom != null ? `${prevMonth.recap.weightFrom} → ${prevMonth.recap.weightTo}` : "—"}</b>
              <span>{prevMonth.recap.weightFrom != null ? "кг за месяц" : "вес не записывался"}</span>
            </div>
          </div>
        </section>
      )}

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

      {/* Скрининг стыка. Карточка появляется только при флаге: у кого всё чисто, тот
          про эти опросники больше не вспоминает. Формулировки ведут к врачу и никогда
          не ставят диагноз — приложение не медицинское и им не притворяется. */}
      {screening.map(s => (
        <section key={s.titleRU} className="card">
          <h3 className="card-h">{s.titleRU}</h3>
          <p className="small">{s.messageRU}</p>
          <p className="small muted">
            Это не диагноз, а повод показаться врачу. Данные никуда не отправлялись —
            ответы лежат только на твоём телефоне.
          </p>
        </section>
      ))}

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
          {/* Строку не прячем, даже когда ноль: цифра сама по себе непонятна, поэтому
              при нуле она прямо говорит, что с этим делать. Скрыть было бы проще, но
              тогда человек не поймёт, почему пусто и половина карточек не появляется. */}
          <span>
            Ночей отмечено: {insight.daysLogged}/7
            {insight.daysLogged === 0 && " — отметь утром, как спалось"}
          </span>
          {/* Регулярности здесь больше нет намеренно. Она стояла цифрой «N/100», а ниже
              на том же экране карточка «Ровность режима» показывала СВОЁ число из ста —
              и человеку оставалось гадать, какому верить. Ровность богаче: в ней и вердикт,
              и социальный джетлаг, поэтому счёт остался за ней одной. */}
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
          <p className="small mt-2">
            По плану еды прошло <b>{foodWeek.followed} из {foodWeek.marked}</b> отмеченных дней.
          </p>
        )}
        {foodWeek.cheats > 0 && (
          <p className="small muted mt-2">
            Читмилов за неделю: {foodWeek.cheats}. Они запланированы тобой и в счёт выше не входят.
          </p>
        )}
      </section>
      )}

      <section className="card">
        <h3 className="card-h">Вес</h3>
        {delta != null && (
          <p className="small mt-0">
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
        {/* Подтверждение записи. Раньше после нажатия «Записать» поле просто очищалось,
            график до второго замера не появляется — и человек не понимал, сохранилось ли
            вообще. Теперь последний замер виден всегда. */}
        {weightSeries.length > 0 && (
          <p className="small mt-2">
            Последний замер: <b>{weightSeries[weightSeries.length - 1]!.kg} кг</b>
            {weightSeries[weightSeries.length - 1]!.date === today
              ? " — сегодня"
              : `, ${weightSeries[weightSeries.length - 1]!.date.split("-").reverse().join(".")}`}
            {weightSeries.length === 1 && (
              <span className="muted"> · со второго замера появится линия</span>
            )}
          </p>
        )}
        {/* Раньше здесь стояло «раз в неделю». Для линии тренда этого хватает, но для расчёта
            реального расхода — нет: исследование требует от 4 взвешиваний в неделю. */}
        <p className="small muted">
          Взвешивайся утром, до еды. Одна цифра прыгает на полкило из-за воды и соли — смотри на линию.
          Раза в неделю хватит для линии; 4 раза в неделю и чаще — чтобы приложение посчитало твой реальный расход.
        </p>
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
