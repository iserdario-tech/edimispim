import { readTheme, applyTheme, type ThemeChoice } from "./theme.js";
import React, { useRef } from "react";
import type { ScreenerResult } from "../index.js";
import type { FoodSettings } from "./storage.js";
import type { Recipe } from "../food/types.js";
import recipesJson from "../food/data/recipes.json";

const RECIPES = recipesJson as Recipe[];

/**
 * «Я» — всё, что настраивается один раз и потом не мешает: профили, копии, справка.
 * Вынесено с главного экрана, чтобы каждый день человек видел только сегодняшний день.
 */
export function Profile({ food, screener, ratings, onRate, onEditSleep, onEditFood, onBackup, onRestore }: {
  food?: FoodSettings;
  screener?: ScreenerResult | null;
  ratings?: Record<string, 1 | -1>;
  onRate?: (id: string, value: 1 | -1) => void;
  onEditSleep: () => void;
  onEditFood: () => void;
  onBackup: () => void;
  onRestore: (f: File) => void;
}) {
  const [theme, setTheme] = React.useState<ThemeChoice>(() => readTheme());
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Скрытые блюда. Без этого списка «палец вниз» был ловушкой: блюдо исчезало из меню,
   * а вместе с ним исчезала и кнопка, которой оценку можно было снять. Промахнулся —
   * потерял рецепт навсегда. Отменять свои решения человек должен иметь право всегда.
   */
  const hidden = Object.entries(ratings ?? {})
    .filter(([, v]) => v === -1)
    .map(([id]) => ({ id, name: RECIPES.find(r => r.id === id)?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return (
    <main className="wrap">
      {/* Подзаголовок есть у всех четырёх остальных разделов; без него «Я» из одной буквы
          выглядело обрубком, а не заголовком экрана. */}
      <h1 className="page-title">
        Я
        <span className="page-sub">настройки, оформление и копия данных</span>
      </h1>

      <section className="card">
        <h3 className="card-h">Настройки</h3>
        <button className="row-btn" onClick={onEditSleep}>
          <span>Сон</span>
          <span className="small muted">подъём, отбой, кофеин, здоровье →</span>
        </button>
        <button className="row-btn" onClick={onEditFood}>
          <span>Еда</span>
          <span className="small muted">
            {food ? `${food.mealCount} приёма в день, аллергии, бюджет →` : "не заполнено →"}
          </span>
        </button>
      </section>

      {hidden.length > 0 && onRate && (
        <section className="card">
          <h3 className="card-h">Скрытые блюда</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            Эти блюда больше не появляются в меню. Промахнулся или передумал — верни обратно.
          </p>
          <ul className="fridge-list">
            {hidden.map(h => (
              <li key={h.id}>
                <span className="fridge-name">{h.name}</span>
                <span />
                <button className="linkbtn small" onClick={() => onRate(h.id, -1)}>вернуть</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3 className="card-h">Оформление</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          По умолчанию — как в системе: днём светлое, ночью тёмное.
        </p>
        <div className="seg" role="group" aria-label="Тема оформления">
          {([["auto", "Системная"], ["light", "Светлая"], ["dark", "Тёмная"]] as const).map(([v, ru]) => (
            <button key={v} className={theme === v ? "seg-item on" : "seg-item"}
              aria-pressed={theme === v}
              onClick={() => { setTheme(v); applyTheme(v); }}>{ru}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">Копия данных</h3>
        <p className="small muted">
          Всё хранится только на твоём телефоне. Очистишь браузер — данные пропадут,
          если нет копии. Аккаунтов и облака нет.
        </p>
        <div className="btn-row">
          <button className="chip" onClick={onBackup}>Сохранить</button>
          <button className="chip" onClick={() => fileRef.current?.click()}>Загрузить</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onRestore(f); e.target.value = ""; }} />
        </div>
      </section>

      {screener?.flagged && (
        <section className="card flagbox">
          <h3 className="card-h">Стоит показаться врачу</h3>
          <ul>{screener.messagesRU.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </section>
      )}

      <section className="card">
        <h3 className="card-h">Как лучше спать</h3>
        <div className="tips-body small">
          <p><b>Спальня:</b> темно, прохладно ~18–19&nbsp;°C, тихо, проветри перед сном.</p>
          <p><b>Вечер:</b> приглуши свет за 1–2 часа до сна, тёплый душ, телефон вне кровати.</p>
          <p><b>Алкоголь:</b> «бокал на ночь» рушит вторую половину сна — крадёт глубокий и REM-сон, поэтому наутро разбитость.</p>
          <p><b>Плохая ночь:</b> относись как к долгу сна — вода, утренний свет, короткий сон днём. Без позднего кофе, иначе испортишь и следующую ночь.</p>
          <p><b>Не спится больше 20 минут:</b> встань, побудь в тусклом свете, вернись, когда потянет в сон. Если так неделями — к врачу.</p>
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">Честно о том, что это приложение может</h3>
        <div className="tips-body small">
          <p>Вес снижает только дефицит энергии. Сон, режим и состав еды — рычаги, которые
            делают этот дефицит переносимым, а не отдельная магия.</p>
          <p><b>Сон не сжигает калории.</b> Он меняет аппетит, самоконтроль и то, из чего
            состоит потерянный вес: на недосыпе больше уходит мышц и меньше жира.</p>
          <p>Кофеин маскирует недосып, а не заменяет его.</p>
          <p>Оценка готовности — по твоим отметкам, а не измерение. Это не медицинское
            приложение: при тревожных признаках нужен врач, а не приложение.</p>
        </div>
      </section>
    </main>
  );
}
