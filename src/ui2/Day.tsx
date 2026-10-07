import React, { useState } from "react";
import type { Slot } from "../food/types.js";
import type { MealMark, OwnSize } from "../food/eaten.js";
import { fmtHM } from "../time.js";
import { Sheet } from "../ui/Sheet.js";
import { MealIngredients } from "../ui/Grocery.js";
import { SwipeRow } from "../ui/SwipeRow.js";
import { EatSheet } from "../ui/EatSheet.js";
import { tap } from "../ui/haptics.js";
import type { TimelineRow } from "../ui/mealRows.js";
import type { DayModel } from "./useDay.js";
import type { AppModel } from "./Shell.js";
import type { Yesterday } from "../effects.js";
import { todayFoodDay } from "../ui/todayPlan.js";
import { expectedBedMin } from "../food/index.js";
import { parseHM } from "../index.js";
import { plusDaysISO } from "../today-date.js";
import { photoFor, photoUrl } from "../food/photos.js";
import { backupDue, daysSince } from "../ui/dataSafety.js";
import { readCloud } from "../ui/cloudSync.js";
import { readLS, writeLS } from "../ui/localStore.js";
import { Ico, EmojiIco } from "./Ico.js";
import { useExp, paceRU } from "./useExp.js";

const FACES = [[1, "confounded-circle", "плохо"], [2, "sad-circle", "так себе"], [3, "expressionless-circle", "норм"], [4, "smile-circle", "хорошо"], [5, "emoji-funny-circle", "отлично"]] as const;
const YESTERDAY: [keyof Yesterday, string][] = [["lateDinner", "Ужин позже 21:00"], ["lateCaffeine", "Кофе после 14:00"], ["alcohol", "Алкоголь"]];
const SIZES = [["light", "лёгкое"], ["usual", "как в плане"], ["big", "плотное"]] as const;

const dateLabel = (d: Date) => d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
const until = (min: number) => {
  if (min <= 0) return "сейчас";
  const h = Math.floor(min / 60), m = min % 60;
  // неразрывные пробелы: «через 31 мин» не рвётся на две строки, «мин» не повисает одно
  return `через\u00a0${h ? `${h}\u00a0ч\u00a0${String(m).padStart(2, "0")}` : `${m}\u00a0мин`}`;
};
const SLOT_RU: Record<string, string> = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", dessert: "Сладкое", snack: "Перекус" };

/**
 * «Сутки» 2.0: слово дня, одна строка «что дальше» и лента суток на фоне неба.
 *
 * Здесь нет ни одного абзаца-пояснения: «почему» живёт в шторке за «i», подробности
 * строки — в шторке по тапу. Строка ленты — время, тарелка или значок, название и одна
 * строка подробностей. До первого действия — не больше сорока слов (критерий спеки).
 */
const KCAL_SKIP = "edimispim.kcalSkip";

export function Day({ app, day, now, onWhy, story, code }: { app: AppModel; day: DayModel; now: Date; onWhy: () => void; story?: { label: string; open: () => void }; code?: { code: string; onNoted: () => void } }) {
  const state = app.state!;
  const a = app.actions;
  // вес идёт не по плану — предлагаем поправку сами, а не ждём, что человек найдёт её в «Я»
  const exp = useExp(state, day.today);
  const [kcalSkip, setKcalSkip] = useState(() => readLS<string | null>(KCAL_SKIP, null));
  const kcal = exp?.r.status === "ready" && exp.r.step !== 0 && exp.r.nextChangeInDays === 0
    && (!kcalSkip || daysSince(kcalSkip, day.today) >= 7) ? exp.r : null;
  const [recipe, setRecipe] = useState<NonNullable<TimelineRow["meal"]> | null>(null);
  const [info, setInfo] = useState<TimelineRow | null>(null);
  const [writing, setWriting] = useState<Slot | null>(null);
  // вчера / завтра — просмотр, без отметок: прошлое и план не правят свайпом случайно
  const [offset, setOffset] = useState(0);
  const eaten = day.eaten;
  const planned = day.foodDay?.day.meals.length ?? 0;
  const dayKcal = day.foodDay?.day.totals.kcal;

  const portionOf = (slot: Slot) => {
    const plan = day.foodDay?.day.meals.find(m => m.slot === slot)?.servings;
    const cur = day.balanced?.day.meals.find(m => m.slot === slot)?.servings;
    return plan && cur ? Math.round((cur / plan) * 100) / 100 : 1;
  };
  const mark = (slot: Slot, m: MealMark) => { tap(); a.markMeal(day.today, slot, m, planned, dayKcal, portionOf(slot)); };

  const next = day.nextIdx >= 0 ? day.rows[day.nextIdx] : undefined;
  const nextLine = next
    ? `${next.kind === "food" && next.slot ? SLOT_RU[next.slot] : next.title} в ${next.time} · ${until(next.startMin - day.nowMin)}`
    : "на сегодня всё";
  const unmarked = day.foodDay ? day.foodDay.day.meals.map(m => m.slot).filter(sl => !eaten?.marks[sl]) : [];
  const dinnerMin = day.foodDay?.day.meals.find(m => m.slot === "dinner")?.timeMin ?? 19 * 60;
  const daysWithData = new Set([...state.history.map(h => h.date), ...Object.keys(state.eaten ?? {})]).size;
  // Safari стирает данные сайта после недели простоя — раз в неделю зовём сохранить копию
  // облачная копия считается копией: файл просим, только если и облако давно не обновлялось
  const lastCopy = [app.backupAt, readCloud()?.at].filter((x): x is string => !!x).sort().at(-1) ?? null;
  const showBackup = backupDue(lastCopy, day.today, daysWithData);
  const yAns = state.yesterday?.[day.today] ?? {};
  const askYesterday = day.word.phase === "morning" && YESTERDAY.some(([k]) => yAns[k] === undefined);

  // строка «ночь»: прошлая ночь — первая точка суток, как в макете
  const nightRow = day.logged ? (
    <li className="s-row past">
      <div className="s-row-btn">
        <span className="s-time">{day.wokeHM}</span>
        <span className="s-plate sleep"><Ico name="moon" className="ico-plate" /></span>
        <span className="s-what">
          <b>{day.sleptMin !== undefined ? `Ночь ${Math.floor(day.sleptMin / 60)} ч ${String(day.sleptMin % 60).padStart(2, "0")}` : "Ночь отмечена"}</b>
          <span>{["", "спал очень плохо", "спал плохо", "спал нормально", "спал хорошо", "спал отлично"][day.quality]}</span>
        </span>
      </div>
    </li>
  ) : null;

  if (offset !== 0) return <OtherDay app={app} iso={plusDaysISO(day.today, offset)} offset={offset} onBack={() => setOffset(0)} />;

  return (
    <main className="s-screen">
      <div className="s-date-row">
        <button className="s-nav-day" aria-label="Вчера" onClick={() => { tap(); setOffset(-1); }}>‹ вчера</button>
        <span className="s-date">{dateLabel(now)}</span>
        <button className="s-nav-day" aria-label="Завтра" onClick={() => { tap(); setOffset(1); }}>завтра ›</button>
      </div>
      <div className="s-head">
        <h1 className="s-title">{day.word.word}</h1>
        <button className="s-i" aria-label="Почему так" onClick={onWhy}>i</button>
      </div>
      {day.word.sub && <p className="s-sub">{day.word.sub}</p>}
      {day.word.phase !== "morning" || day.logged ? <p className="s-next">{nextLine}</p> : null}

      {story && (
        <button className="s-story-card" onClick={() => { tap(); story.open(); }}>
          <span><b>Твоя неделя</b><span>{story.label} · сон, еда, вес</span></span>
          <Ico name="arrow-right" mono className="ico-go" />
        </button>
      )}

      {!day.logged && day.word.phase !== "evening" && (
        <section className="s-card">
          <h2 className="s-h2">Как спал?</h2>
          <div className="s-faces">
            {FACES.map(([q, face, ru]) => (
              <button key={q} className="s-face" onClick={() => { tap(); a.saveLog({ date: day.today, wokeHM: day.wokeHM, quality: q }); }}>
                <span className="s-face-emoji"><Ico name={face} /></span><span className="s-face-ru">{ru}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {askYesterday && (
        <section className="s-card">
          <h2 className="s-h2">Что было вчера?</h2>
          {YESTERDAY.map(([k, ru]) => (
            <div key={k} className="s-yn">
              <span>{ru}</span>
              <span className="s-yn-btns">
                {([[true, "да"], [false, "нет"]] as const).map(([v, label]) => (
                  <button key={label} className={yAns[k] === v ? "s-pill on" : "s-pill"} aria-pressed={yAns[k] === v}
                    onClick={() => { tap(); a.setYesterday(day.today, k, v); }}>{label}</button>
                ))}
              </span>
            </div>
          ))}
        </section>
      )}

      {kcal && (
        <section className="s-card">
          <h2 className="s-h2">{kcal.step > 0 ? "Вес уходит быстро" : kcal.lossPerWeek < -0.05 ? "Вес растёт" : kcal.lossPerWeek < 0.05 ? "Вес стоит" : "Вес уходит медленно"}</h2>
          <p className="s-muted">
            Последние недели вес {paceRU(kcal.lossPerWeek)} в неделю. План — минус {exp!.tempo.toLocaleString("ru-RU")}.
            {kcal.step > 0 ? " Так быстро вместе с жиром уходят мышцы." : ` По твоим записям ты тратишь ≈${kcal.tdee} ккал в день.`}
          </p>
          <div className="s-yn-btns">
            <button className="s-btn food" onClick={() => { tap(); a.adjustKcal(kcal.step); }}>
              {kcal.step < 0 ? `Убрать ${-kcal.step} ккал` : `Добавить ${kcal.step} ккал`}
            </button>
            <button className="s-btn ghost" onClick={() => { tap(); writeLS(KCAL_SKIP, day.today); setKcalSkip(day.today); }}>Позже</button>
          </div>
        </section>
      )}

      {code && (
        <section className="s-card">
          <h2 className="s-h2">Код для восстановления</h2>
          <p className="s-code">{code.code}</p>
          <p className="s-muted">Копия теперь сама уходит в облако. Поменяешь телефон или переустановишь — всё вернётся по этому коду. Сделай скриншот.</p>
          <div className="s-sheet-actions">
            <button className="s-btn ghost" onClick={() => { tap(); void navigator.clipboard?.writeText(code.code); }}>Скопировать</button>
            <button className="s-btn food" onClick={() => { tap(); code.onNoted(); }}>Записал</button>
          </div>
        </section>
      )}

      <ol className="s-timeline">
        {nightRow}
        {day.rows.map((r, i) => {
          const isFood = r.kind === "food" && r.slot && r.meal;
          const m = r.slot ? eaten?.marks[r.slot] : undefined;
          const past = r.startMin < day.nowMin - 15 && i !== day.nextIdx;
          const detail = isFood
            ? (m === "ate" ? "съел" : m === "own" ? "своё" : r.meal!.leftover ? "остатки вчерашнего ужина"
              : `${Math.round(r.meal!.recipe.kcal * r.meal!.servings)} ккал${r.meal!.recipe.time_min ? ` · ${r.meal!.recipe.time_min} мин` : ""}`)
            : r.short ?? r.detail;
          return (
            <React.Fragment key={i}>
              {i === day.nextIdx && (
                <li className="s-now" aria-label={`сейчас ${fmtHM(day.nowMin)}`}><span>сейчас · {fmtHM(day.nowMin)}</span></li>
              )}
              <li className={"s-row" + (past ? " past" : "") + (i === day.nextIdx ? " next" : "")}>
                <SwipeRow enabled={!!isFood} leftLabel="съел ✓" rightLabel="своё"
                  onLeft={() => r.slot && m !== "ate" && mark(r.slot, "ate")}
                  onRight={() => r.slot && m !== "own" && mark(r.slot, "own")}>
                  <button className="s-row-btn" onClick={() => (isFood ? setRecipe(r.meal!) : setInfo(r))}>
                    {/* «00:00 ночью»: «ночью» мелко под временем, а не второй крупной строкой */}
                    <span className="s-time">{r.time.replace(" ночью", "")}{r.time.endsWith(" ночью") && <small>ночью</small>}</span>
                    <span className={"s-plate" + (isFood ? "" : " sleep") + (i === day.nextIdx ? " big" : "")}>
                      {isFood && r.photo ? <img src={r.photo} alt="" loading="lazy" decoding="async" /> : <EmojiIco e={r.icon} className="ico-plate" />}
                      {m === "ate" && <i className="s-done"><Ico name="check" mono /></i>}
                    </span>
                    <span className="s-what">
                      <b>{r.title}</b>
                      <span>{detail}</span>
                    </span>
                  </button>
                </SwipeRow>
                {isFood && m === "own" && r.slot && (
                  <div className="s-own">
                    {SIZES.map(([sz, ru]) => {
                      const on = !eaten?.ownText?.[r.slot!] && (eaten?.sizes?.[r.slot!] ?? "usual") === sz;
                      return <button key={sz} className={on ? "s-pill on" : "s-pill"} onClick={() => { tap(); a.ownSize(day.today, r.slot!, sz as OwnSize); }}>{ru}</button>;
                    })}
                    <button className={eaten?.ownText?.[r.slot] ? "s-pill on" : "s-pill"} onClick={() => setWriting(r.slot!)}><Ico name="pen" /> написать, что ел</button>
                  </div>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>

      {eaten?.extras?.length ? (
        <section className="s-card">
          <h2 className="s-h2">Съел вне плана</h2>
          {eaten.extras.map((x, k) => (
            <div key={k} className="s-yn">
              <span>{x.text} · ≈{x.kcal} ккал</span>
              <button className="s-pill" aria-label={`Убрать «${x.text}»`} onClick={() => { tap(); a.extraRemove(day.today, k); }}>убрать</button>
            </div>
          ))}
        </section>
      ) : null}

      {/* вечером одна кнопка вместо пяти отметок; уже отмеченное не трогает */}
      {day.foodDay && unmarked.length > 0 && day.nowMin >= dinnerMin && (
        <button className="s-btn food s-wide" onClick={() => {
          tap();
          a.markAll(day.today, unmarked, planned, dayKcal, Object.fromEntries(unmarked.map(sl => [sl, portionOf(sl)])));
        }}><Ico name="check-circle" /> Весь день по плану</button>
      )}

      {showBackup && (
        <section className="s-card">
          <div className="s-yn">
            <span>{app.backupAt ? `Последняя копия — ${daysSince(app.backupAt, day.today)} дн. назад` : "Копии данных ещё нет"}</span>
            <button className="s-pill on" onClick={() => { tap(); a.backup(); }}>Сохранить</button>
          </div>
        </section>
      )}

      {day.word.phase === "evening" && day.fact && day.foodDay && (
        <section className="s-card">
          <h2 className="s-h2">Итог дня</h2>
          <p className="s-muted">
            {day.fact.marked} из {planned} приёмов · {day.fact.estimated ? "≈" : ""}{day.fact.kcal} из {day.foodDay.day.totals.kcal} ккал · белок {day.fact.protein} г
          </p>
        </section>
      )}

      {recipe && (
        <Sheet title={recipe.recipe.name} onClose={() => setRecipe(null)}>
          {recipe.slot && (
            <div className="s-sheet-actions">
              <button className={eaten?.marks[recipe.slot] === "ate" ? "s-btn food" : "s-btn"} onClick={() => { mark(recipe.slot, "ate"); setRecipe(null); }}>
                {eaten?.marks[recipe.slot] === "ate" ? <><Ico name="check" mono /> Съел</> : "Съел"}
              </button>
              <button className="s-btn ghost" onClick={() => { mark(recipe.slot, "own"); setRecipe(null); }}>Ел своё</button>
            </div>
          )}
          <MealIngredients meal={recipe} household={state.food?.household ?? 1}
            rating={state.ratings?.[recipe.recipe.id]} onRate={a.rateDish} />
        </Sheet>
      )}
      {info && (
        <Sheet title={info.title} onClose={() => setInfo(null)}>
          <p>{info.detail}</p>
          {info.why && <p className="s-muted">{info.why}</p>}
        </Sheet>
      )}
      {writing && (
        <EatSheet title="Что ты съел вместо плана?" onClose={() => setWriting(null)}
          onSave={food => a.ownWritten(day.today, writing, food)} />
      )}
    </main>
  );
}

/**
 * Вчера и завтра: что было съедено и что запланировано. Только просмотр — завтрашнее
 * меню из того же календарного плана, что и вкладка «Еда», вчерашнее — с отметками.
 */
function OtherDay({ app, iso, offset, onBack }: { app: AppModel; iso: string; offset: number; onBack: () => void }) {
  const state = app.state!;
  const [recipe, setRecipe] = useState<NonNullable<TimelineRow["meal"]> | null>(null);
  const log = state.history.find(h => h.date === iso);
  const fd = state.food ? todayFoodDay({
    food: state.food, today: iso, wokeHM: log?.wokeHM ?? state.profile.anchorWakeHM,
    bedMin: expectedBedMin(parseHM(state.profile.anchorWakeHM), state.profile.targetSleepMin),
    ratings: state.ratings, swaps: state.swaps, menu: state.menu, noCookDays: state.noCookDays,
    night: { targetSleepMin: state.profile.targetSleepMin, ...(log ? { quality: log.quality } : {}) },
  }) : null;
  const marks = state.eaten?.[iso]?.marks ?? {};
  const d = new Date(iso + "T12:00:00");
  return (
    <main className="s-screen">
      <div className="s-date-row">
        <button className="s-nav-day" onClick={onBack}>‹ сегодня</button>
        <span className="s-date">{d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</span>
        <span />
      </div>
      <h1 className="s-title">{offset < 0 ? "Вчера" : "Завтра"}</h1>
      <p className="s-sub">
        {offset < 0
          ? (log ? `ночь: ${["", "очень плохо", "плохо", "нормально", "хорошо", "отлично"][log.quality]} · отмечено ${Object.keys(marks).length} из ${fd?.day.meals.length ?? 0}` : "ночь не отмечалась")
          : `план на ${fd?.day.totals.kcal ?? 0} ккал`}
      </p>
      <ol className="s-timeline">
        {fd?.day.meals.map(m => (
          <li key={m.slot} className="s-row">
            <button className="s-row-btn" onClick={() => setRecipe(m)}>
              <span className="s-time">{fmtHM(m.timeMin)}</span>
              <span className="s-plate"><img src={photoUrl(photoFor(m.recipe))} alt="" loading="lazy" decoding="async" />
                {marks[m.slot] === "ate" && <i className="s-done"><Ico name="check" mono /></i>}</span>
              <span className="s-what"><b>{m.recipe.name}</b>
                <span>{marks[m.slot] === "own" ? "ел своё" : `${Math.round(m.recipe.kcal * m.servings)} ккал${m.leftover ? " · остатки ужина" : ""}`}</span></span>
            </button>
          </li>
        ))}
      </ol>
      {recipe && (
        <Sheet title={recipe.recipe.name} onClose={() => setRecipe(null)}>
          <MealIngredients meal={recipe} household={state.food?.household ?? 1} />
        </Sheet>
      )}
    </main>
  );
}
