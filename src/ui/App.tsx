import React, { useEffect, useRef, useState } from "react";
import type { Profile, ScreenerResult, DayLog } from "../index.js";
import { Onboarding } from "./Onboarding.js";
import { Today } from "./Today.js";
import { Food } from "./Food.js";
import { Progress } from "./Progress.js";
import { Profile as ProfileScreen } from "./Profile.js";
import { FoodSetup } from "./FoodSetup.js";
import { Coach } from "./Coach.js";
import { Nav, type Tab } from "./Nav.js";
import { useSwipeBack } from "./useSwipeBack.js";
import { ScreenHeader } from "./ScreenHeader.js";
import { loadState, saveState, exportAll, importAll, type FoodSettings, type StoredState } from "./storage.js";
import { syncPushContext } from "./notifications.js";
import { migrateAll } from "../migrate.js";
import { localDateISO } from "../today-date.js";
import { toggleMark, type MealMark } from "../food/eaten.js";
import type { Slot } from "../food/types.js";

/**
 * Данные из pospat и oheedet лежат на том же origin — подхватываем их, а не просим вводить заново.
 *
 * Здесь была самая дорогая потеря во всём приложении: из перенесённых суток забирались
 * ТОЛЬКО замеры веса, а ночи сна выбрасывались. При этом человеку честно писали
 * «Перенесено ночей сна: 24» — то есть приложение сообщало о переносе, которого не делало.
 * Ради этих ночей вся миграция и затевалась: без них не считается ни ровность режима,
 * ни разбор плато, ни «почему сегодня так».
 *
 * Заодно возвращён скрининг питания из oheedet: на нём стоят guardrails безопасности
 * (мягкий дефицит при красных флагах), и без него они не срабатывали никогда.
 */
function pickUpOldApps(): {
  food?: FoodSettings;
  weights: { date: string; kg: number }[];
  history: DayLog[];
  notesRU: string[];
} {
  if (typeof localStorage === "undefined") return { weights: [], history: [], notesRU: [] };
  const m = migrateAll(localStorage);
  const weights = m.days.flatMap(d =>
    typeof d.body?.weightKg === "number" ? [{ date: d.date, kg: d.body.weightKg }] : []);
  const history: DayLog[] = m.days.flatMap(d => d.sleep ? [{
    date: d.date,
    wokeHM: d.sleep.wokeHM,
    quality: d.sleep.quality,
    ...(d.sleep.bedHM ? { bedHM: d.sleep.bedHM } : {}),
    ...(d.sleep.alcohol ? { hadAlcohol: true } : {}),
  }] : []);
  const food: FoodSettings | undefined = m.foodProfile
    ? {
        profile: m.foodProfile, constraints: m.constraints ?? {}, mealCount: 4,
        ...(m.screen ? { screen: m.screen } : {}),
      }
    : undefined;
  return { food, weights, history, notesRU: m.notesRU };
}

export function App() {
  const [state, setState] = useState<StoredState | null>(() => loadState());
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState(false);
  const [editingFood, setEditingFood] = useState(false);
  // откуда пришли на вложенный экран — туда и вернём, а не на первый раздел
  const [returnTab, setReturnTab] = useState<Tab>("today");
  const [migrationNote, setMigrationNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state) return;
    const picked = pickUpOldApps();
    if (picked.weights.length || picked.food) setMigrationNote(picked.notesRU.join(" "));
  }, [state]);

  const overlay = editing || editingFood;
  const closeOverlay = () => { setEditing(false); setEditingFood(false); };

  const openOverlay = (which: "sleep" | "food") => {
    setReturnTab(tab);
    if (which === "sleep") setEditing(true); else setEditingFood(true);
    // отдельная запись в истории: системная «назад» и свайп закроют экран,
    // а не выбросят человека из приложения
    history.pushState({ overlay: which }, "");
  };

  useEffect(() => {
    const onPop = () => closeOverlay();
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const back = () => {
    closeOverlay();
    setTab(returnTab);
    if (history.state?.overlay) history.back();
  };

  const update = (next: StoredState) => { saveState(next); setState(next); };

  const saveLog = (log: DayLog) => {
    setState((prev) => {
      if (!prev) return prev;
      const history = [...prev.history.filter((h) => h.date !== log.date), log].slice(-180);
      const next = { ...prev, history };
      saveState(next);
      return next;
    });
  };

  /**
   * Отметка «съел» / «заменил своим». Хранится не больше 180 дней — ровно как история сна:
   * ряд нужен месяцами для разбора плато, но копить его вечно незачем.
   */
  const markMeal = (date: string, slot: Slot, mark: MealMark, planned: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const all = { ...(prev.eaten ?? {}) };
      all[date] = toggleMark(all[date], slot, mark, planned);
      const kept = Object.keys(all).sort().slice(-180);
      const eaten = Object.fromEntries(kept.map(d => [d, all[d]!]));
      const next = { ...prev, eaten };
      saveState(next);
      return next;
    });
  };

  /**
   * Оценка блюда. Повторное нажатие той же оценки снимает её: человек передумал —
   * это нормально, и запирать его в собственном «не люблю» навсегда незачем.
   *
   * Оценки не покидают устройство. Коллективный топ блюд, о котором шла речь, требует
   * отправки данных на сервер — это отдельное решение и отдельная явная галочка.
   */
  const rateDish = (id: string, value: 1 | -1) => {
    setState((prev) => {
      if (!prev) return prev;
      const ratings = { ...(prev.ratings ?? {}) };
      if (ratings[id] === value) delete ratings[id];
      else ratings[id] = value;
      const next = { ...prev, ratings };
      saveState(next);
      return next;
    });
  };

  /**
   * Объявить (или отменить) читмил. Хранится в истории, а не в контексте суток: день должен
   * остаться помеченным и назавтра, иначе статистика приверженности сочтёт его провалом —
   * то есть накажет ровно за то, что человек честно объявил заранее.
   */
  const setCheatDay = (date: string, on: boolean) => {
    setState((prev) => {
      if (!prev) return prev;
      const rest = (prev.cheatDays ?? []).filter(d => d !== date);
      const cheatDays = (on ? [...rest, date] : rest).sort().slice(-180);
      const next = { ...prev, cheatDays };
      saveState(next);
      return next;
    });
  };

  const addWeight = (kg: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const date = localDateISO();
      const weights = [...(prev.weights ?? []).filter(w => w.date !== date), { date, kg }]
        .sort((a, b) => a.date.localeCompare(b.date));
      const next = { ...prev, weights };
      saveState(next);
      return next;
    });
  };

  const backup = () => {
    const url = URL.createObjectURL(new Blob([exportAll()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `edim-spim-копия-${localDateISO()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const restore = async (file: File) => {
    const restored = importAll(await file.text());
    if (!restored) { alert("Не похоже на копию «edim & spim». Файл не подошёл."); return; }
    update(restored);
    void syncPushContext(restored.profile);
    alert("Данные восстановлены ✓");
  };

  // свайп от левого края закрывает вложенный экран — до кнопки в углу одной рукой не дотянуться

  useSwipeBack(!!state && (editing || editingFood), back);


  if (!state || editing) {
    return <>
      {state && <ScreenHeader title="Сон" onBack={back} />}
      <Onboarding initial={state?.profile} onRestore={() => fileRef.current?.click()}
        onDone={(profile: Profile, screener: ScreenerResult) => {
      const picked = state
        ? { food: state.food, weights: state.weights ?? [], history: state.history }
        : pickUpOldApps();
      const food = state?.food ?? picked.food;
      const weights = state?.weights ?? picked.weights;
      update({
        profile,
        history: state?.history ?? picked.history,   // ночи из pospat, а не пустой массив
        screener,
        ...(food ? { food } : {}),
        ...(weights.length ? { weights } : {}),
      });
      setEditing(false);
      setTab(returnTab);
      void syncPushContext(profile);
    }} />
      {/* Поле выбора файла нужно и здесь: основное живёт в ветке с готовым состоянием,
          а «Загрузить копию» на онбординге как раз для тех, у кого состояния ещё нет. */}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
    </>;
  }

  if (editingFood) {
    return <>
      <ScreenHeader title="Еда" onBack={back} />
      <FoodSetup initial={state.food} onCancel={back}
        onDone={(food) => { update({ ...state, food }); closeOverlay(); setTab(returnTab); }} />
    </>;
  }

  return (
    <>
      {migrationNote && tab === "today" && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <p className="muted small">📦 {migrationNote}</p>
        </div>
      )}

      {tab === "today" && (
        <Today
          profile={state.profile} history={state.history} screener={state.screener}
          onLog={saveLog} food={state.food} weights={state.weights}
          eaten={state.eaten} ratings={state.ratings} cheatDays={state.cheatDays}
          onMarkMeal={markMeal} onCheatDay={setCheatDay}
          onSetupFood={() => openOverlay("food")}
        />
      )}
      {tab === "food" && (
        <Food
          profile={state.profile} food={state.food}
          ratings={state.ratings} onRate={rateDish}
          onSetupFood={() => openOverlay("food")}
        />
      )}
      {tab === "progress" && (
        <Progress
          profile={state.profile} history={state.history} food={state.food}
          weights={state.weights} eaten={state.eaten} cheatDays={state.cheatDays}
          onAddWeight={addWeight}
        />
      )}
      {tab === "coach" && (
        <main className="wrap chat-screen">
          {/* Заголовок такой же, как на остальных вкладках: раздел без Large Title
              выпадал из системы и читался как чужой экран внутри приложения. */}
          <h1 className="page-title">
            Вопрос
            <span className="page-sub">отвечает по научной базе, видит твои дела и не заменяет врача</span>
          </h1>
          <Coach contextRU={coachContext(state)} />
        </main>
      )}
      {tab === "profile" && (
        <ProfileScreen
          food={state.food} screener={state.screener}
          ratings={state.ratings} onRate={rateDish}
          onEditSleep={() => openOverlay("sleep")}
          onEditFood={() => openOverlay("food")}
          onBackup={backup} onRestore={restore}
        />
      )}

      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      {/* Смена вкладки показывает раздел с начала. Без этого страница удерживала прежнюю
          прокрутку: с середины «Еды» человек попадал в середину «Итогов» и видел не заголовок,
          а обрывок карточки. Разделы независимы — общей позиции у них быть не может. */}
      <Nav tab={tab} onChange={(t) => { setTab(t); window.scrollTo({ top: 0 }); }} />
    </>
  );
}

/** Короткая сводка «как дела сейчас» — чтобы коуч отвечал про этого человека, а не вообще. */
function coachContext(state: StoredState): string {
  const last = state.history[state.history.length - 1];
  const weights = state.weights ?? [];
  return [
    // Просьба про стиль идёт в контексте, потому что сам промпт живёт на Worker'е,
    // а он пока задеплоен старой версии — так подробные ответы работают уже сейчас.
    "СТИЛЬ ОТВЕТА: отвечай развёрнуто — 4–8 предложений. Сначала объясни причину простыми словами, потом дай 2–4 конкретных шага. Не ограничивайся одной фразой.",
    "Приложение объединяет сон и питание: можешь отвечать и про еду, и про режим дня.",
    `Обычный подъём: ${state.profile.anchorWakeHM}. Цель сна: ${(state.profile.targetSleepMin / 60).toFixed(1)} ч.`,
    last ? `Последняя отмеченная ночь ${last.date}: подъём ${last.wokeHM}, качество ${last.quality}/5${last.hadAlcohol ? ", был алкоголь" : ""}.` : "Ночи пока не отмечались.",
    state.food ? `Питание настроено: ${state.food.mealCount} приёма в день.` : "Питание пока не настроено.",
    weights.length >= 2
      ? `Вес: с ${weights[0]!.kg} до ${weights[weights.length - 1]!.kg} кг за ${weights.length} замеров.`
      : "",
    state.screener?.flagged
      ? `ВАЖНО, анкета показала признаки, требующие врача: ${state.screener.messagesRU.join(" ")}`
      : "",
  ].filter(Boolean).join("\n");
}
