import { useState } from "react";
import type { Meal } from "../food/types.js";
import { shopById, searchUrl } from "../food/shops.js";
import type { BuyLine } from "../food/packaging.js";
import { isLiquid, mlOf } from "../food/nutrients.js";
import { photoFor, photoUrl } from "../food/photos.js";
import { tap } from "./haptics.js";
import { shareText, shareNoteRU } from "./share.js";
import { IconThumb } from "./Icons.js";

export const pantryKey = (name: string, unit: string): string => `${name.toLowerCase().trim()}|${unit}`;

/**
 * Количество так, как его называют у полки: полтора литра молока, а не 1500 мл.
 * Граммы выше килограмма тоже читаются хуже — «1.2 кг» понятнее «1200 г».
 */
export function amountRU(qty: number, unit: string): string {
  // «215.8 г» у полки не взвесить: округляем вверх, чтобы точно хватило
  if ((unit === "г" || unit === "мл") && qty >= 10) qty = Math.ceil(qty / (qty < 100 ? 5 : 10)) * (qty < 100 ? 5 : 10);
  if (unit === "мл" && qty >= 1000) return `${+(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)} л`;
  if (unit === "г" && qty >= 1000) return `${+(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)} кг`;
  return `${+qty.toFixed(1)} ${unit}`;
}

/**
 * Показывать ли остаток.
 *
 * «Мёд · останется 201.8 г» — правда, но бесполезная: мёд стоит в шкафу месяцами,
 * и напоминание о нём только зашумляет список. Остаток важен для скоропорта —
 * там это предупреждение «успей съесть» — и когда его заметно много.
 */
export const showsLeftover = (line: BuyLine): boolean =>
  line.leftover > 0 &&
  line.perishDays !== undefined && line.perishDays <= 14 &&
  line.leftover >= line.need * 0.25;

/**
 * Отделы магазина в порядке обхода зала.
 *
 * Список на семьдесят восемь позиций — это стена, по которой человек ходит кругами:
 * творог в начале, кефир в середине, сыр в конце. Порядок здесь бытовой, а не
 * алфавитный: сначала овощи и мясо (тележка внизу тяжёлым), потом молочное и яйца,
 * потом сухое, хлеб в конце — чтобы не смялся.
 */
export const AISLES: { id: string; ru: string; match: string[] }[] = [
  { id: "veg",    ru: "Овощи и фрукты", match: ["овощи/фрукты"] },
  { id: "meat",   ru: "Мясо и рыба",    match: ["мясо/рыба", "полуфабрикаты"] },
  { id: "dairy",  ru: "Молочное и яйца", match: ["молочное", "яйца"] },
  { id: "grain",  ru: "Крупы и бобовые", match: ["крупы", "бобовые"] },
  { id: "canned", ru: "Консервы и соусы", match: ["консервы", "соусы", "масла"] },
  { id: "misc",   ru: "Бакалея, орехи, специи", match: ["бакалея", "орехи", "орехи/семена", "специи"] },
  { id: "bread",  ru: "Хлеб", match: ["хлеб"] },
];
export const OTHER = { id: "other", ru: "Остальное" };

export const aisleOf = (category?: string): { id: string; ru: string } =>
  AISLES.find(a => a.match.includes(category ?? "")) ?? OTHER;

/** Ссылка на поиск товара в выбранном сервисе. */
export const itemLink = (name: string, shopId: string): string => searchUrl(shopById(shopId), name);


/**
 * Карточка блюда: состав и КАК ГОТОВИТЬ.
 *
 * Шаги были в oheedet и потерялись при переносе — без них меню бесполезно:
 * человек видит «Гочжан-свинина с кимчи», а что с ней делать, не написано.
 * Количества в составе умножены на размер порции, шаги — как в рецепте.
 */
export function MealIngredients({ meal, rating, onRate, household = 1 }: {
  meal: Meal;
  rating?: 1 | -1;
  onRate?: (id: string, value: 1 | -1) => void;
  /** На сколько человек готовить: количество продуктов умножается, калории — нет. */
  household?: number;
}) {
  // жидкости показываем объёмом и здесь: «100 мл молока» привычнее, чем «103 г»
  const ings = (meal.recipe.ingredients ?? []).map(i => {
    const qty = i.qty * meal.servings * household;
    return isLiquid(i.name)
      ? { name: i.name, qty: +mlOf(i.name, qty, i.unit).toFixed(1), unit: "мл" }
      : { name: i.name, qty: +qty.toFixed(1), unit: i.unit };
  });

  const steps = meal.recipe.steps ?? [];
  const [shareNote, setShareNote] = useState("");
  if (!ings.length && !steps.length) return <div className="meal-ings small muted">Рецепт не указан.</div>;

  const photo = photoFor(meal.recipe);
  return (
    <div className="meal-ings">
      {/* Широкое фото сверху: карточка блюда — единственное место, где человек решает,
          будет он это готовить. Снимок подобран по типу блюда, автор указан в разделе «Я». */}
      <img className="dish-photo" src={photoUrl(photo)} alt={meal.recipe.name}
        loading="lazy" decoding="async" />
      {/* Оценка живёт здесь, а не в списке: решение «нравится» человек принимает,
          когда видит состав и шаги, а не когда просматривает названия. */}
      {onRate && (
        <div className="rate-row">
          <span className="small muted">Как тебе блюдо?</span>
          <button className={rating === 1 ? "rate-btn on" : "rate-btn"} aria-pressed={rating === 1}
            aria-label="Нравится" title="Нравится — будет чаще"
            onClick={() => { tap(); onRate(meal.recipe.id, 1); }}><IconThumb /></button>
          <button className={rating === -1 ? "rate-btn on down" : "rate-btn"} aria-pressed={rating === -1}
            aria-label="Не нравится" title="Не нравится — больше не предложу"
            onClick={() => { tap(); onRate(meal.recipe.id, -1); }}><IconThumb down /></button>
          {rating === 1 && <span className="small muted">буду ставить чаще — примерно в четырёх днях недели из семи</span>}
          {/* Про возврат говорим сразу: после скрытия блюдо исчезает из меню вместе
              с этими кнопками, и без подсказки человек не знает, где его искать. */}
          {rating === -1 && <span className="small muted">убрано из меню · вернуть можно в разделе «Я»</span>}
        </div>
      )}

      {ings.length > 0 && (
        <>
          <div className="small muted">
            {household > 1 ? (Number.isInteger(household) ? `Продукты на ${household} порции — твоя и ещё ${household - 1}` : "Продукты на двоих — твоя порция и партнёра") : "Продукты на эту порцию"}
          </div>
          <ul>
            {ings.map((i, k) => (
              <li key={k}>
                <span className="ing-name">{i.name}</span>
                <span className="small muted">{amountRU(i.qty, i.unit)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* про происхождение говорим всегда: тишина у «домашних» рецептов читалась как
          «этот тоже откуда-то взят», а половина набора написана для приложения */}
      <p className="small muted mt-3">
        {meal.recipe.source ? (
          <>
            Рецепт с <a href={meal.recipe.source} target="_blank" rel="noopener noreferrer">источника</a> —
            состав оттуда, калории пересчитаны приложением по справочнику продуктов.
          </>
        ) : (
          <>Рецепт составлен для приложения; калории посчитаны по справочнику продуктов.</>
        )}
      </p>

      {steps.length > 0 && (
        <>
          <div className="small muted mt-3">
            Как готовить{meal.recipe.time_min ? ` · ${meal.recipe.time_min} мин` : ""}
          </div>
          <ol className="recipe-steps small">
            {steps.map((st, k) => <li key={k}>{st}</li>)}
          </ol>
        </>
      )}
      <div className="share-row">
        <button className="linkbtn small" onClick={async () => {
          tap();
          const text = [
            meal.recipe.name,
            "",
            household > 1 ? (Number.isInteger(household) ? `Продукты на ${household} порции:` : "Продукты на двоих:") : "Продукты:",
            ...ings.map(i => `• ${i.name} — ${amountRU(i.qty, i.unit)}`),
            ...(steps.length ? ["", "Как готовить:", ...steps.map((st, k) => `${k + 1}. ${st}`)] : []),
          ].join("\n");
          setShareNote(shareNoteRU(await shareText(meal.recipe.name, text)));
        }}>Поделиться рецептом</button>
        {shareNote && <span className="small muted">{shareNote}</span>}
      </div>
    </div>
  );
}
