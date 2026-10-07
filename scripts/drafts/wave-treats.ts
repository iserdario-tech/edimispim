import type { Draft } from "../add-recipes";

/**
 * Покупное сладкое (волна 43): то, что не готовят, а покупают и съедают порцией.
 * Раньше лежало в каталоге отдельным списком без состава — в меню и покупки не попадало.
 * Порции под слот сладкого (~150–200 ккал): одна вещь из магазина плюс фрукт — сытнее и с клетчаткой.
 */
export const DRAFT: Draft[] = [
  { id: "t1", name: "Тёмный шоколад и яблоко", type: "dessert", cuisine: "universal", src: "", servings: 1,
    cookware: [], allergens: [], difficulty: 1, time: 1,
    ings: [["тёмный шоколад 70%", 20, "г", "бакалея"], ["яблоко", 150, "г", "овощи/фрукты"]],
    steps: ["Отломи 3–4 дольки шоколада, яблоко нарежь дольками."] },
  { id: "t2", name: "Греческий йогурт с ягодами и мёдом", type: "dessert", cuisine: "universal", src: "", servings: 1,
    cookware: [], allergens: ["milk"], difficulty: 1, time: 2,
    ings: [["греческий йогурт", 170, "г", "молочное"], ["ягоды замороженные", 80, "г", "овощи/фрукты"], ["мёд", 10, "г", "бакалея"]],
    steps: ["Выложи йогурт в миску, сверху ягоды и мёд."] },
  { id: "t3", name: "Протеиновый батончик", type: "dessert", cuisine: "universal", src: "", servings: 1,
    cookware: [], allergens: ["milk", "soy"], difficulty: 1, time: 1,
    ings: [["протеиновый батончик", 50, "г", "бакалея"]],
    steps: ["Один батончик. Бери тот, где белка 15 г и больше, без сахарной глазури."] },
  { id: "t4", name: "Зефир и груша", type: "dessert", cuisine: "universal", src: "", servings: 1,
    cookware: [], allergens: ["egg"], difficulty: 1, time: 1,
    ings: [["зефир", 30, "г", "бакалея"], ["груша", 150, "г", "овощи/фрукты"]],
    steps: ["Одна зефирка (половинка большой) и спелая груша."] },
  { id: "t5", name: "Мармелад и мандарины", type: "dessert", cuisine: "universal", src: "", servings: 1,
    cookware: [], allergens: [], difficulty: 1, time: 1,
    ings: [["мармелад", 30, "г", "бакалея"], ["мандарин", 150, "г", "овощи/фрукты"]],
    steps: ["Горсть мармелада — штук 5–6 — и два мандарина."] },
  { id: "t6", name: "Финики с грецкими орехами", type: "dessert", cuisine: "universal", src: "", servings: 1,
    cookware: [], allergens: ["nuts"], difficulty: 1, time: 1,
    ings: [["финики", 30, "г", "бакалея"], ["грецкие орехи", 15, "г", "орехи"]],
    steps: ["3–4 финика и 3–4 половинки грецкого ореха — сладко и сытно."] },
  { id: "t7", name: "Пломбир с ягодами", type: "dessert", cuisine: "universal", src: "", servings: 1,
    cookware: [], allergens: ["milk"], difficulty: 1, time: 1,
    ings: [["пломбир", 60, "г", "молочное"], ["ягоды замороженные", 80, "г", "овощи/фрукты"]],
    steps: ["Два шарика пломбира в пиалу, сверху ягоды."] },
];
