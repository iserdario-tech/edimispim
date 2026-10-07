import { useEffect, useMemo, useState } from "react";
import { Sheet } from "../ui/Sheet.js";
import { WeightChart } from "../ui/Charts.js";
import { toDayRecords } from "../ui/dayRecords.js";
import { expenditure } from "../expenditure.js";
import { useExp, paceRU } from "./useExp.js";
import { DEFAULT_PACE, PACES_RU, PACE_SPAN_RU, type RampPace } from "../food/rampin.js";
import { Ico } from "./Ico.js";
import { shareText, shareNoteRU } from "../ui/share.js";
import type { IcoName } from "./icons.js";
import { targetsFor } from "../ui/storage.js";
import { targetsForToday } from "../food/index.js";
import { plateau } from "../plateau.js";
import { anchor, type AnchorResult } from "../anchor.js";
import { sleepFoodLink, monthRecap } from "../sleep-food.js";
import { weekStory } from "../weekStory.js";
import { plusDaysISO, localDateISO } from "../today-date.js";
import { readTheme, applyTheme, type ThemeChoice } from "../ui/theme.js";
import { PHOTOS } from "../food/photos.js";
import { tap } from "../ui/haptics.js";
import { cloudUpload, readCloud, type CloudInfo } from "../ui/cloudSync.js";
import { CodeRestore } from "./CodeRestore.js";
import { createPair, joinPair, leavePair, type PairInfo } from "../ui/pairSync.js";
import { enableNotifications, readPushPrefs, writePushPrefs, syncPushContext, pushSubscribed, readPushSyncAt } from "../ui/notifications.js";
import type { PushPrefs } from "../push.js";
import type { Profile } from "../index.js";
import type { AppModel } from "./Shell.js";
import type { DayModel } from "./useDay.js";

const DNI: Record<string, string> = { one: "день", few: "дня", many: "дней", other: "дня" };
const RU_PLURAL = new Intl.PluralRules("ru");
/** 1 день, 2 дня, 5 дней */
const dni = (n: number) => DNI[RU_PLURAL.select(n)]!;

type MeSheet = null | "weight" | "sleep" | "stories" | "pair" | "backup" | "notif" | "theme" | "about";

/** Понедельник недели даты (ISO). */
export const mondayOf = (iso: string): string => {
  const dow = (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;
  return plusDaysISO(iso, -dow);
};
const weekLabel = (monday: string) => {
  const a = new Date(monday + "T12:00:00"), b = new Date(plusDaysISO(monday, 6) + "T12:00:00");
  const f = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return `${f(a)} – ${f(b)}`;
};

/**
 * «Я» 2.0: кто ты и как идут дела — и всё, что раньше было вкладкой «Итоги».
 *
 * Вместо семи карточек подряд — три цифры наверху и список разделов. Подробности
 * (вес и расход, сон и режим, истории недель) открываются шторками: на них заходят
 * раз в неделю, а не каждое утро, поэтому им не место на главном пути.
 */
export function Me({ app, day, cloud, onCloud, pair, onPair, onSettings, onStory, onRestore, onTour }: {
  app: AppModel; day: DayModel;
  cloud: CloudInfo | null; onCloud: (c: CloudInfo | null) => void;
  pair: PairInfo | null; onPair: (p: PairInfo | null) => void;
  onSettings: (which: "sleep" | "food") => void;
  onStory: (monday: string) => void;
  onRestore: () => void;
  onTour: () => void;
}) {
  const state = app.state!;
  const a = app.actions;
  const [sheet, setSheet] = useState<MeSheet>(null);
  const records = useMemo(() => toDayRecords(state.history, state.weights ?? [], state.eaten ?? {}, state.cheatDays ?? []),
    [state.history, state.weights, state.eaten, state.cheatDays]);
  const first = [...state.history.map(h => h.date), ...Object.keys(state.eaten ?? {})].sort()[0];
  const daysWith = first ? Math.round((Date.parse(day.today) - Date.parse(first)) / 86_400_000) + 1 : 0;
  const lastKg = state.weights?.at(-1)?.kg;

  const exp = useExp(state, day.today);
  const tdee = exp ? (exp.r.status === "ready" || exp.r.status === "uncertain" ? exp.r.tdee : exp.formula) : null;

  const ROWS: [MeSheet | "sleep-settings" | "food-settings" | "tour", IcoName, string, string][] = [
    ["weight", "scale", "Вес и калории", lastKg ? `${lastKg} кг · трата ${exp?.r.status === "ready" ? "по твоим данным" : "по формуле"}` : "записать первый вес"],
    ["sleep", "moon-sleep", "Как ты спишь", "во сколько ложишься, сон и еда"],
    ["stories", "chart-2", "Итоги недель", "каждый понедельник — новый"],
    ["sleep-settings", "alarm", "Настройки сна", `подъём ${state.profile.anchorWakeHM}`],
    ["food-settings", "chef-hat", "Настройки еды", state.food ? `${state.food.mealCount} приёма · ${state.food.household && state.food.household > 1 ? `на ${state.food.household}` : "на себя"}` : "не настроено"],
    ["pair", "users-group-rounded", "Готовим вдвоём", pair ? (pair.otherKcal ? `партнёр ≈${pair.otherKcal} ккал/день` : "ждём партнёра") : "общее меню, порции свои"],
    ["backup", "cloud-download", "Копия данных", cloud?.at ? `в облаке · ${cloud.at.split("-").reverse().slice(0, 2).join(".")}` : app.backupAt ? `файлом · ${app.backupAt.split("-").reverse().slice(0, 2).join(".")}` : "ещё не делал"],
    ["notif", "bell", "Напоминания", notifOn() ? "заранее: еда, кофе, сон" : "выключены"],
    ["theme", "palette", "Оформление", { auto: "как в системе", light: "светлое", dark: "тёмное" }[readTheme()]],
    ["tour", "question-circle", "Как устроено приложение", "кнопки и экраны за минуту"],
    ["about", "info-circle", "О приложении", "наука и фото"],
  ];

  return (
    <main className="s-screen">
      <h1 className="s-title">Я</h1>
      <p className="s-sub">{daysWith ? `${daysWith}\u00a0${dni(daysWith)} с приложением` : "первый день"}{day.streak ? ` · отмечаешь ${day.streak}\u00a0${dni(day.streak)} подряд` : ""}</p>

      <div className="s-stats">
        {/* две плитки, а не три: в трети ширины «тратишь ккал/день» не помещалось в строку,
            а без «тратишь» число путали с планом еды */}
        <div className="s-card s-stat"><b>{lastKg ?? "—"} → {state.food?.profile.goalWeightKg ?? "—"}</b><span>кг: сейчас → цель</span></div>
        <div className="s-card s-stat"><b>{tdee ? `≈${tdee.toLocaleString("ru-RU")}` : "—"}</b><span>тратишь ккал/день</span></div>
      </div>

      <div className="s-card s-list">
        {ROWS.map(([id, ico, title, sub]) => (
          <button key={title} className="s-list-row" onClick={() => {
            tap();
            if (id === "sleep-settings") onSettings("sleep");
            else if (id === "food-settings") onSettings("food");
            else if (id === "tour") onTour();
            else setSheet(id);
          }}>
            <span className="s-list-ico"><Ico name={ico} /></span>
            <span className="s-what"><b>{title}</b><span>{sub}</span></span>
            <span className="s-list-go" aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      {sheet === "weight" && <WeightSheet app={app} exp={exp} records={records} onClose={() => setSheet(null)} />}
      {sheet === "sleep" && <SleepSheet app={app} day={day} records={records} onClose={() => setSheet(null)} />}
      {sheet === "stories" && (
        <Sheet title="Итоги недель" onClose={() => setSheet(null)}>
          {(() => {
            const weeks = Array.from({ length: 10 }, (_, i) => plusDaysISO(mondayOf(day.today), -7 * (i + 1)))
              .filter(m => weekStory(records, m, state.profile.targetSleepMin));
            return weeks.length ? (
              <div className="s-options">
                {weeks.map(m => (
                  <button key={m} className="s-option s-option-text" onClick={() => { setSheet(null); onStory(m); }}>
                    <span className="s-what"><b>{weekLabel(m)}</b><span>сон, еда, вес и что заметили</span></span>
                  </button>
                ))}
              </div>
            ) : <p className="s-muted">Первая история появится в понедельник — когда за неделю наберётся хотя бы четыре дня отметок.</p>;
          })()}
        </Sheet>
      )}
      {sheet === "backup" && (
        <Sheet title="Копия данных" onClose={() => setSheet(null)}>
          <h3 className="s-why-h">В облаке</h3>
          {cloud ? <>
            <p className="s-code">{cloud.code}</p>
            <p className="s-muted">Копия сама уходит в облако зашифрованной — открыть её можно только этим кодом. {cloud.at ? `Последняя: ${cloud.at.split("-").reverse().join(".")}.` : "Первая ещё не ушла — нет связи."}</p>
            <div className="s-sheet-actions">
              <button className="s-btn ghost" onClick={() => { tap(); void navigator.clipboard?.writeText(cloud.code); }}>Скопировать</button>
              <button className="s-btn ghost" onClick={async () => { tap(); onCloud(await cloudUpload(true) ?? cloud); }}>Отправить</button>
            </div>
          </> : <p className="s-muted">Код появится, как только уйдёт первая копия.</p>}
          <h3 className="s-why-h">На другом телефоне</h3>
          <p className="s-small">Введи код — данные этого телефона заменятся копией.</p>
          <CodeRestore confirm onDone={s => { app.update(s); onCloud(readCloud()); setSheet(null); }} />
          <h3 className="s-why-h">Файлом</h3>
          <div className="s-sheet-actions">
            <button className="s-btn ghost" onClick={() => { tap(); a.backup(); }}>Сохранить</button>
            <button className="s-btn ghost" onClick={onRestore}>Загрузить</button>
          </div>
          {app.backupAt && <p className="s-small">Последняя копия файлом — {app.backupAt.split("-").reverse().join(".")}</p>}
        </Sheet>
      )}
      {sheet === "theme" && <ThemeSheet onClose={() => setSheet(null)} />}
      {sheet === "pair" && <PairSheet pair={pair} onPair={onPair} onClose={() => setSheet(null)} />}
      {sheet === "notif" && <NotifSheet profile={state.profile} onClose={() => setSheet(null)} />}
      {sheet === "about" && (
        <Sheet title="О приложении" onClose={() => setSheet(null)}>
          <p>edim & spim строит день от сна: ужин за три часа до отбоя, после плохой ночи — те же калории, но день проще.</p>
          <p className="s-muted">Честная рамка: сон не сжигает калории — он меняет аппетит и самоконтроль. Кофеин маскирует недосып, а не заменяет его. Оценки помечены «≈», личные сопоставления — наблюдения, а не выводы. Это не медицинское приложение.</p>
          <h3 className="s-why-h">Значки</h3>
          <p className="s-small">Solar — <a href="https://www.figma.com/community/file/1166831539721848736" target="_blank" rel="noopener noreferrer">480 Design</a>, лицензия CC BY 4.0.</p>
          <h3 className="s-why-h">Фотографии блюд</h3>
          <p className="s-small">Снимки подобраны по типу блюда с Викисклада, свободные лицензии.</p>
          <ul className="s-credits">
            {Object.entries(PHOTOS).map(([k, p]) => (
              <li key={k}><a href={p.source} target="_blank" rel="noopener noreferrer">{p.author}</a> · {p.license}</li>
            ))}
          </ul>
        </Sheet>
      )}
    </main>
  );
}

function WeightSheet({ app, exp, records, onClose }: {
  app: AppModel; exp: { formula: number; tempo: number; r: ReturnType<typeof expenditure> } | null;
  records: ReturnType<typeof toDayRecords>; onClose: () => void;
}) {
  const state = app.state!;
  const [kg, setKg] = useState("");
  const weights = state.weights ?? [];
  const plat = plateau(records, state.profile.targetSleepMin, state.food?.startISO);
  const delta = weights.length >= 2 ? Math.round((weights.at(-1)!.kg - weights[0]!.kg) * 10) / 10 : null;
  const r = exp?.r;
  const f = state.food;
  const ramp = f ? targetsForToday(targetsFor(f), f.startISO, localDateISO(), f.pace).ramp : null;
  return (
    <Sheet title="Вес и калории" onClose={onClose}>
      <form className="s-inline" onSubmit={e => { e.preventDefault(); const v = +kg.replace(",", "."); if (v >= 30 && v <= 300) { tap(); app.actions.addWeight(v); setKg(""); } }}>
        <input type="text" inputMode="decimal" value={kg} placeholder={weights.at(-1) ? String(weights.at(-1)!.kg) : "кг"} onChange={e => setKg(e.target.value)} aria-label="Вес, кг" />
        <button className="s-btn food" type="submit" disabled={!kg}>Записать</button>
      </form>
      {weights.length >= 2 && <WeightChart weights={weights} goal={state.food?.profile.goalWeightKg} />}
      {delta !== null && <p className="s-muted">С первого замера: {delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(delta).toLocaleString("ru-RU")} кг. Одна цифра прыгает на полкило — смотри на линию.</p>}
      {ramp?.active && <p className="s-muted">{ramp.labelRU}. Потом меню остаётся на цели.</p>}

      {r && (
        <>
          <h3 className="s-why-h">Сколько ты тратишь на самом деле</h3>
          {r.status === "wait" && <p className="s-muted">Пока по формуле: ≈ {exp!.formula} ккал. Через {r.daysLeft} дн. посчитаю по твоим данным — взвешивайся 4 раза в неделю и отмечай все приёмы.</p>}
          {/* только то, чего не хватает: «взвешиваний 27 из 16» читалось как ошибка */}
          {r.status === "data" && <p className="s-muted">Не хватает записей за 4 недели: {[
            r.weighIns < r.weighInsNeed ? `взвешиваний ${r.weighIns} из ${r.weighInsNeed}` : "",
            r.weeksLogged < r.weeks ? `недель, где записано 5+ дней, — ${r.weeksLogged} из ${r.weeks}` : "",
          ].filter(Boolean).join("; ")}. Пока по формуле: ≈ {exp!.formula} ккал.</p>}
          {r.status === "uncertain" && <p className="s-muted">≈ {r.tdee} ккал, но разброс ±{r.ci} — рано менять норму. Чаще взвешивайся.</p>}
          {r.status === "ready" && (
            <>
              <p className="s-big">≈ {r.tdee} <span className="s-small">ккал в день · ±{r.ci}</span></p>
              <p className="s-muted">Вес {paceRU(r.lossPerWeek)} в неделю. План — минус {exp!.tempo.toLocaleString("ru-RU")}.{r.step === 0 ? " Норма совпадает с расходом." : ""}</p>
              {r.step !== 0 && r.nextChangeInDays > 0 && <p className="s-small">Следующая поправка — через {r.nextChangeInDays} дн.</p>}
              {r.step !== 0 && r.nextChangeInDays === 0 && (
                <button className="s-btn food" onClick={() => { tap(); app.actions.adjustKcal(r.step); }}>
                  {r.step < 0 ? `Убрать ${-r.step} ккал` : `Добавить ${r.step} ккал`}
                </button>
              )}
            </>
          )}
          {state.food?.kcalAdjust ? <p className="s-small">Норма поправлена на {state.food.kcalAdjust > 0 ? "+" : ""}{state.food.kcalAdjust} ккал · <button className="s-link" onClick={() => app.actions.adjustKcal(0)}>сбросить</button></p> : null}
          <p className="s-small">Расчёт по твоим записям и весу, а не замер. Тренировки уже учтены — они видны в весе.</p>
        </>
      )}
      {plat.cause !== "no_data" && plat.cause !== "not_plateau" && (
        <>
          <h3 className="s-why-h">Вес стоит {plat.weeks} нед.</h3>
          <p className="s-muted">{plat.messageRU}</p>
        </>
      )}
      <FreshStart app={app} />
    </Sheet>
  );
}

/**
 * «Начинаю с сегодня»: для того, кто настроил приложение заранее, а пользоваться всерьёз
 * начинает сейчас. Без этого вход в дефицит считался бы с даты настройки (давно прошёл),
 * а расчёт трат — по случайным старым записям.
 */
function FreshStart({ app }: { app: AppModel }) {
  const state = app.state!;
  const [open, setOpen] = useState(false);
  const [kg, setKg] = useState(String(state.weights?.at(-1)?.kg ?? state.food?.profile.weightKg ?? ""));
  const [pace, setPace] = useState<RampPace>(DEFAULT_PACE);
  const food = state.food;
  if (!food) return null;
  // начал сегодня — показываем итог, а не кнопку: иначе казалось, что нажатие просто сворачивает форму
  if (food.startISO === localDateISO()) {
    const span = PACE_SPAN_RU[food.pace ?? DEFAULT_PACE];
    return (
      <p className="s-done-note"><Ico name="check-circle" /> Старт — сегодня, {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}.
        {" "}{span ? `Вход в дефицит — ${span}.` : "Сразу калории для цели."}</p>
    );
  }
  if (!open) return <button className="s-btn ghost s-wide" onClick={() => { tap(); setOpen(true); }}>Начинаю с сегодня</button>;
  const v = +kg.replace(",", ".");
  return (
    <>
      <h3 className="s-why-h">Начать с сегодня</h3>
      <p className="s-muted">Вход в дефицит начнётся заново, траты будут считаться по записям с этого дня. Старые записи останутся.</p>
      <p className="s-small">Вес сейчас, кг</p>
      <div className="s-inline">
        <input type="text" inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} aria-label="Вес сейчас, кг" placeholder="кг" />
      </div>
      <p className="s-small">Как войти в дефицит</p>
      <div className="s-seg" role="group" aria-label="Как войти в дефицит">
        {PACES_RU.map(([p, ru]) => (
          <button key={p} className={pace === p ? "on" : ""} aria-pressed={pace === p} onClick={() => setPace(p)}>{ru}</button>
        ))}
      </div>
      <div className="s-sheet-actions s-mt">
        <button className="s-btn food" disabled={!(v >= 30 && v <= 300)}
          onClick={() => { tap(); app.actions.freshStart(v, pace); setOpen(false); }}>Начать</button>
        <button className="s-btn ghost" onClick={() => { tap(); setOpen(false); }}>Отмена</button>
      </div>
    </>
  );
}

function SleepSheet({ app, day, records, onClose }: { app: AppModel; day: DayModel; records: ReturnType<typeof toDayRecords>; onClose: () => void }) {
  const state = app.state!;
  const t = state.profile.targetSleepMin;
  const anc = anchor(records, t);
  const link = sleepFoodLink(records.filter(r => r.date >= plusDaysISO(day.today, -60)), t);
  const d = new Date(day.today + "T12:00:00Z"); d.setUTCDate(0);
  const ym = d.toISOString().slice(0, 7);
  const recap = monthRecap(records, ym);
  return (
    <Sheet title="Как ты спишь" onClose={onClose}>
      <h3 className="s-why-h">Ложишься в одно время?</h3>
      <p className="s-muted">{regularRU(anc)}</p>

      {state.food && (
        <>
          <h3 className="s-why-h">Сон и еда у тебя</h3>
          {link.ready ? (
            ([["После обычной ночи", link.good], ["После плохой ночи", link.rough]] as const).map(([ru, g]) => (
              <div key={ru} className="s-bar s-bar-wide">
                <span>{ru}</span>
                <span className="s-bar-track"><span style={{ width: `${(g.followed / g.total) * 100}%` }} /></span>
                <span className="s-small">{g.followed} из {g.total}</span>
              </div>
            ))
          ) : <p className="s-muted">Нужно хотя бы по 3 дня отметок еды после обычных и после плохих ночей — сейчас {link.good} и {link.rough}.</p>}
          {link.ready && <p className="s-small">Дни по плану. Это наблюдение, а не вывод о причинах.</p>}
        </>
      )}

      <h3 className="s-why-h">Что заметили у тебя</h3>
      {day.effects.some(e => e.ready)
        ? <ul className="s-why-list">{day.effects.filter(e => e.ready).map(e => <li key={e.factor}>{e.textRU}</li>)}</ul>
        : <p className="s-muted">Отвечай утром на «Что было вчера?» — после 5 «да» и 5 «нет» здесь появится, как ужин, кофе и алкоголь влияют на твой сон.</p>}

      {recap && (
        <>
          <h3 className="s-why-h">{d.toLocaleDateString("ru-RU", { month: "long", timeZone: "UTC" })}</h3>
          <p className="s-muted">
            {recap.nights} ночей отмечено{recap.avgSleepMin != null ? ` · сон в среднем ${Math.floor(recap.avgSleepMin / 60)} ч ${recap.avgSleepMin % 60} мин` : ""}
            {` · ${recap.followed} из ${recap.marked} дней еды по плану`}
            {recap.weightFrom != null ? ` · ${recap.weightFrom} → ${recap.weightTo} кг` : ""}
          </p>
        </>
      )}
    </Sheet>
  );
}

/**
 * «Готовим вдвоём»: меню общее (его задаёт тот, кто создал пару), порции у каждого свои
 * по его калориям, покупки — на обоих, галочки «взял» видны обоим.
 */
function PairSheet({ pair, onPair, onClose }: { pair: PairInfo | null; onPair: (p: PairInfo | null) => void; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true); setNote("");
    const r = await joinPair(code);
    setBusy(false);
    if (typeof r === "string") setNote({ "bad-code": "Нужно четыре слова, например «лиса-река-гром-сыр».", "not-found": "Пары с таким кодом нет. Пусть партнёр откроет приложение и проверит код.", offline: "Нет связи. Попробуй ещё раз." }[r]);
    else onPair(r);
  };
  const [shareNote, setShareNote] = useState("");
  const send = async (c: string) => {
    tap();
    setShareNote(shareNoteRU(await shareText("Готовим вдвоём", `Давай вести одно меню в edim & spim. Открой «Я → Готовим вдвоём → Тебе прислали код» и введи: ${c}`)));
  };
  // два сценария — двумя явными блоками: «я начинаю» и «мне прислали код»; люди не понимали, что из этого их
  return (
    <Sheet title="Готовим вдвоём" onClose={onClose}>
      {!pair && <>
        <p className="s-muted">Одно меню на двоих: блюда общие, порции у каждого свои, список покупок — один на двоих.</p>
        <h3 className="s-why-h">Ты начинаешь</h3>
        <p className="s-small">Создай пару — появится код из четырёх слов. Отправь его тому, с кем готовишь.</p>
        <button className="s-btn food s-wide s-mt0" onClick={() => { tap(); onPair(createPair()); }}>Создать пару</button>
        <h3 className="s-why-h">Тебе прислали код</h3>
        <p className="s-small">Введи четыре слова из сообщения.</p>
        <div className="s-restore">
          <input type="text" value={code} placeholder="например: лиса-река-гром-сыр" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            aria-label="Код пары" onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void join(); }} />
          <button className="s-btn ghost" disabled={busy || !code.trim()} onClick={() => void join()}>{busy ? "…" : "Присоединиться"}</button>
          {note && <p className="s-small">{note}</p>}
        </div>
      </>}
      {pair && pair.role === "a" && !pair.otherKcal && <>
        <h3 className="s-why-h">Ждём партнёра</h3>
        <ol className="s-steps-text">
          <li>Отправь код партнёру.</li>
          <li>Он открывает edim & spim → «Я» → «Готовим вдвоём» → «Тебе прислали код» и вводит слова.</li>
          <li>Как только он войдёт, меню станет общим, а покупки посчитаются на двоих.</li>
        </ol>
        <p className="s-code">{pair.code}</p>
        <div className="s-sheet-actions">
          <button className="s-btn food" onClick={() => void send(pair.code)}>Отправить код</button>
          <button className="s-btn ghost" onClick={() => { tap(); void navigator.clipboard?.writeText(pair.code); setShareNote("Код скопирован."); }}>Скопировать</button>
        </div>
        {shareNote && <p className="s-small">{shareNote}</p>}
      </>}
      {pair && (pair.role === "b" || pair.otherKcal) && <>
        <h3 className="s-why-h">Вы в паре</h3>
        <p className="s-muted">
          {pair.role === "a" ? "Меню собирается по твоим «Настройкам еды»." : "Меню собирается по настройкам партнёра."} Блюдо, заменённое кнопкой <Ico name="refresh" />, меняется у обоих.
          {pair.otherKcal ? ` Партнёр ест ≈${pair.otherKcal} ккал в день — покупки посчитаны на обоих.` : ""}
        </p>
        {pair.role === "a" && <p className="s-small">Код пары: {pair.code}</p>}
      </>}
      {pair && <button className="s-btn ghost s-wide" onClick={() => { if (window.confirm("Выйти из пары? Меню снова станет только твоим.")) { leavePair(); onPair(null); } }}>Выйти из пары</button>}
    </Sheet>
  );
}

const notifOn = () => typeof Notification !== "undefined" && Notification.permission === "granted";

const NOTIF_ROWS: [keyof PushPrefs, string, string][] = [
  ["food", "Еда", "«пора готовить» — за время готовки и\u00a0ещё 10\u00a0минут"],
  ["caffeine", "Кофе и дневной сон", "последний кофе — за 30\u00a0минут, сон — за\u00a015"],
  ["sleep", "Сон", "свет утром, «как спалось?», за час до\u00a0отбоя"],
];

const syncRU = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Напоминания приходят заранее — чтобы успеть дойти до кухни или допить кофе. */
function NotifSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [prefs, setPrefs] = useState(readPushPrefs);
  const [note, setNote] = useState("");
  // разрешение может быть, а подписки на телефоне — нет (переустановка): тогда напоминаний не будет,
  // хотя «Я» писало «включены». Показываем, что есть на самом деле, и когда сервер подтверждал.
  const [sub, setSub] = useState<boolean | null>(null);
  useEffect(() => { void pushSubscribed().then(setSub); }, [note]);
  const syncAt = readPushSyncAt();
  const toggle = (k: keyof PushPrefs) => {
    tap();
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next); writePushPrefs(next);
    void syncPushContext(profile, undefined, { prefs: next });
  };
  return (
    <Sheet title="Напоминания" onClose={onClose}>
      {(!notifOn() || sub === false) && (
        <button className="s-btn food s-wide" onClick={async () => setNote(await enableNotifications(profile))}>Включить напоминания</button>
      )}
      {note && <p className="s-small">{note}</p>}
      {notifOn() && sub !== null && (
        <p className="s-small">{sub
          ? `Подписка на этом телефоне есть${syncAt ? ` · сервер подтвердил ${syncRU(syncAt)}` : " · сервер ещё не подтверждал"}.`
          : "Разрешение есть, а подписки на этом телефоне нет — так бывает после переустановки. Нажми «Включить напоминания»."}</p>
      )}
      <div className="s-rows">
        {NOTIF_ROWS.map(([k, title, sub]) => (
          <div key={k} className="s-yn">
            <span className="s-what"><b>{title}</b><span>{sub}</span></span>
            <button className={prefs[k] ? "s-pill on" : "s-pill"} aria-pressed={prefs[k]} onClick={() => toggle(k)}>{prefs[k] ? "вкл" : "выкл"}</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function ThemeSheet({ onClose }: { onClose: () => void }) {
  const [t, setT] = useState<ThemeChoice>(readTheme());
  return (
    <Sheet title="Оформление" onClose={onClose}>
      <div className="s-chips">
        {([["auto", "Как в системе"], ["light", "Светлое"], ["dark", "Тёмное"]] as const).map(([v, ru]) => (
          <button key={v} className={t === v ? "s-pill on" : "s-pill"} onClick={() => {
            tap(); applyTheme(v); setT(v);
            // небо слушает это событие — тема меняется сразу, без перезагрузки
            window.dispatchEvent(new Event("storage"));
          }}>{ru}</button>
        ))}
      </div>
      <p className="s-small">Тёмное — глубокий синий: вечером не слепит глаза.</p>
    </Sheet>
  );
}

/**
 * «Ложишься в одно время?» — ответ словами, без «середины сна» и баллов из ста.
 * Ровность режима связана с самочувствием и весом не меньше длительности сна (X13),
 * но человеку нужен вывод, а не метрика.
 */
function regularRU(a: AnchorResult): string {
  if (a.score === null) return "Отметь ещё несколько ночей со временем отбоя — тогда станет видно.";
  const head = a.score >= 80 ? "Да — время сна почти не плавает."
    : a.score >= 60 ? "Почти: время сна гуляет примерно на час."
    : "Пока нет: время сна заметно скачет от ночи к ночи.";
  const jet = a.socialJetlagMin !== null && a.socialJetlagMin >= 60
    ? ` В выходные сдвигаешься на ${Math.round(a.socialJetlagMin / 30) / 2} ч — это как перелёт через часовой пояс каждые выходные.`
    : "";
  return head + jet;
}
