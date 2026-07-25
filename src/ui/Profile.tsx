import React, { useRef } from "react";
import type { ScreenerResult } from "../index.js";
import type { FoodSettings } from "./storage.js";

/**
 * «Я» — всё, что настраивается один раз и потом не мешает: профили, копии, справка.
 * Вынесено с главного экрана, чтобы каждый день человек видел только сегодняшний день.
 */
export function Profile({ food, screener, onEditSleep, onEditFood, onBackup, onRestore }: {
  food?: FoodSettings;
  screener?: ScreenerResult | null;
  onEditSleep: () => void;
  onEditFood: () => void;
  onBackup: () => void;
  onRestore: (f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <main className="wrap">
      <h2>Я</h2>

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

      <section className="card">
        <h3 className="card-h">Копия данных</h3>
        <p className="small muted">
          Всё хранится только на твоём телефоне. Очистишь браузер — данные пропадут,
          если нет копии. Аккаунтов и облака нет.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="chip" onClick={onBackup}>Сохранить копию</button>
          <button className="chip" onClick={() => fileRef.current?.click()}>Загрузить копию</button>
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

      <details className="card">
        <summary className="card-h">Как лучше спать</summary>
        <div className="tips-body small">
          <p><b>Спальня:</b> темно, прохладно ~18–19&nbsp;°C, тихо, проветри перед сном.</p>
          <p><b>Вечер:</b> приглуши свет за 1–2 часа до сна, тёплый душ, телефон вне кровати.</p>
          <p><b>Алкоголь:</b> «бокал на ночь» рушит вторую половину сна — крадёт глубокий и REM-сон, поэтому наутро разбитость.</p>
          <p><b>Плохая ночь:</b> относись как к долгу сна — вода, утренний свет, короткий сон днём. Без позднего кофе, иначе испортишь и следующую ночь.</p>
          <p><b>Не спится больше 20 минут:</b> встань, побудь в тусклом свете, вернись, когда потянет в сон. Если так неделями — к врачу.</p>
        </div>
      </details>

      <details className="card">
        <summary className="card-h">Честно о том, что это приложение может</summary>
        <div className="tips-body small">
          <p>Вес снижает только дефицит энергии. Сон, режим и состав еды — рычаги, которые
            делают этот дефицит переносимым, а не отдельная магия.</p>
          <p><b>Сон не сжигает калории.</b> Он меняет аппетит, самоконтроль и то, из чего
            состоит потерянный вес: на недосыпе больше уходит мышц и меньше жира.</p>
          <p>Кофеин маскирует недосып, а не заменяет его.</p>
          <p>Оценка готовности — по твоим отметкам, а не измерение. Это не медицинское
            приложение: при тревожных признаках нужен врач, а не приложение.</p>
        </div>
      </details>
    </main>
  );
}
