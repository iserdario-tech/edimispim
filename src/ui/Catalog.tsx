import React, { useMemo, useState } from "react";
import type { Recipe, MealType } from "../food/types.js";
import { MealIngredients } from "./Grocery.js";
import { IconChevron } from "./Icons.js";
import treatsJson from "../food/data/treats.json";

/**
 * Покупное сладкое: то, что не готовят, а покупают.
 *
 * Файл лежал в проекте с первой волны и не показывался нигде. А случай он закрывает
 * живой: вечером хочется сладкого, а печь творожное печенье сил нет. Отдельный фильтр,
 * потому что это не рецепты — у них нет ни состава, ни шагов, только честная порция
 * и калории, которые вписываются в дневную норму.
 */
interface Treat { name: string; portion: string; kcal: number; note: string }
const TREATS = treatsJson as Treat[];

/**
 * Каталог: все блюда, какие есть в приложении.
 *
 * Зачем он нужен. Рецептов больше трёх сотен, а человек видит из них семь дней меню —
 * остальные для него просто не существуют. Оценить блюдо можно было только тогда, когда
 * планировщик сам его предложит: чтобы сказать «вот это я люблю», приходилось ждать.
 *
 * Здесь набор открыт целиком: поиск по названию и по продукту («творог», «курица»),
 * фильтр по приёму, оценка сразу. Палец вверх и вниз — те же, что в меню, и работают
 * они на то же самое: «нравится» ставится чаще, «не нравится» исчезает из меню совсем.
 */

type Filter = MealType | "all" | "treats";

const TYPES: { id: Filter; ru: string }[] = [
  { id: "all", ru: "Все" },
  { id: "breakfast", ru: "Завтраки" },
  { id: "lunch", ru: "Обеды" },
  { id: "dinner", ru: "Ужины" },
  { id: "snack", ru: "Перекусы" },
  { id: "dessert", ru: "Сладкое" },
  { id: "treats", ru: "Без готовки" },
];

/** Сколько блюд показываем сразу. Три сотни строк разом телефон рисует заметно дольше. */
const PAGE = 24;

/**
 * Поиск по набору: по названию И по составу.
 *
 * Состав важнее названия: «творог» должен находить сырники и запеканку, где слова
 * «творог» в названии нет вовсе. Вынесено из компонента, чтобы проверять тестом —
 * на телефоне кириллицу в поле не ввести.
 */
export function searchRecipes(recipes: Recipe[], query: string, type: MealType | "all"): Recipe[] {
  const q = query.trim().toLowerCase();
  return recipes
    .filter(r => type === "all" || r.meal_type === type)
    .filter(r => {
      if (!q) return true;
      const hay = [r.name, ...(r.ingredients ?? []).map(i => i.name)].join(" ").toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function Catalog({ recipes, ratings, onRate }: {
  recipes: Recipe[];
  ratings?: Record<string, 1 | -1>;
  onRate?: (id: string, value: 1 | -1) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [openDish, setOpenDish] = useState<string | null>(null);

  const found = useMemo(
    () => (type === "treats" ? [] : searchRecipes(recipes, query, type)),
    [recipes, query, type],
  );
  const treats = useMemo(() => {
    if (type !== "treats") return [];
    const q = query.trim().toLowerCase();
    return TREATS.filter(t => !q || (t.name + " " + t.note).toLowerCase().includes(q));
  }, [type, query]);

  const reset = (next: () => void) => { next(); setShown(PAGE); setOpenDish(null); };

  return (
    <section className="card wide">
      <div className="menu-head">
        <h3 className="card-h" style={{ margin: 0 }}>Все блюда</h3>
        <button className="linkbtn small" onClick={() => setOpen(!open)}>
          {open ? "свернуть" : `${recipes.length} в наборе`}
        </button>
      </div>

      {open && (
        <div className="reveal">
          <p className="small muted">
            Весь набор целиком. Отметь пальцем вверх то, что любишь, — такие блюда планировщик
            ставит чаще; палец вниз убирает блюдо из меню совсем.
          </p>

          {/* type="search" даёт на iOS крестик очистки и клавиатуру с кнопкой «Найти» */}
          <input className="catalog-search" type="search" inputMode="search"
            value={query} placeholder="Название или продукт: творог, курица…"
            aria-label="Поиск по блюдам"
            onChange={e => reset(() => setQuery(e.target.value))} />

          <div className="chips">
            {TYPES.map(t => (
              <button key={t.id} className={type === t.id ? "chip on" : "chip"}
                onClick={() => reset(() => setType(t.id))}>{t.ru}</button>
            ))}
          </div>

          <p className="small muted" style={{ marginTop: 0 }}>
            {type === "treats"
              ? "Когда готовить нет сил: покупное сладкое с честной порцией. Одна штука вписывается в норму дня, пачка — нет."
              : found.length === 0
                ? "Ничего не нашлось. Попробуй другое слово — ищется и по составу."
                : `Найдено: ${found.length}`}
          </p>

          {type === "treats" && (
            <ul className="day-meals">
              {treats.map(t => (
                <li key={t.name} className="meal-row catalog-row">
                  <span className="meal-main">
                    <b>{t.name}</b>
                    <span className="small muted meal-meta">{t.portion} · {t.kcal} ккал</span>
                    <span className="small muted">{t.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ul className="day-meals">
            {found.slice(0, shown).map(r => {
              const rating = ratings?.[r.id];
              return (
                <li key={r.id} className="meal-row catalog-row">
                  <span className="meal-main">
                    <button className="meal-name" aria-expanded={openDish === r.id}
                      onClick={() => setOpenDish(openDish === r.id ? null : r.id)}>
                      {r.name}
                      <span className="chev"><IconChevron open={openDish === r.id} /></span>
                    </button>
                    <span className="small muted meal-meta">
                      {Math.round(r.kcal)} ккал · белок {Math.round(r.protein_g)} г
                      {r.time_min ? ` · ${r.time_min} мин` : ""}
                      {/* Оценка видна прямо в списке: иначе, чтобы вспомнить своё решение,
                          пришлось бы раскрывать каждое блюдо по очереди. */}
                      {rating === 1 && <span className="tag"> · нравится</span>}
                      {rating === -1 && <span className="tag"> · скрыто</span>}
                    </span>
                  </span>
                  {openDish === r.id && (
                    <MealIngredients meal={{ recipe: r, servings: 1, timeMin: 0, slot: r.meal_type }}
                      rating={rating} onRate={onRate} />
                  )}
                </li>
              );
            })}
          </ul>

          {found.length > shown && (
            <button className="linkbtn small" onClick={() => setShown(shown + PAGE)}>
              показать ещё {Math.min(PAGE, found.length - shown)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
