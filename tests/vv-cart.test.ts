import { describe, it, expect } from "vitest";
import { pickCard, gramsInCard, appCartUrl } from "../src/ui/vvCart";
import { minutesIn } from "../src/ui/CookMode";
import { recentWritten, addExtra, setOwnText, toggleMark } from "../src/food/eaten";

const item = (xml_id: number, name: string, unit: string, current: number) => ({ xml_id, name, unit, price: { current } });

describe("корзина ВкусВилла: подбор карточки", () => {
  it("вес из названия, весовой — килограмм, коробка яиц без числа — десяток", () => {
    expect(gramsInCard("Творог 5%, 400&nbsp;г", "шт", "творог 5%")).toBe(400);
    expect(gramsInCard("Бананы", "кг", "банан")).toBe(1000);
    expect(gramsInCard("Яйцо куриное С1", "шт", "яйца")).toBe(600);
    expect(gramsInCard("Яйцо куриное С0, 20 шт", "шт", "яйца")).toBe(1200);
    expect(gramsInCard("Масло оливковое Extra Virgin", "шт", "масло оливковое")).toBeNull();
  });
  it("берёт самую дешёвую за 100 г и не берёт переработку", () => {
    const m = pickCard([
      item(1, "Бананы", "кг", 168), item(2, "Бананы мини", "кг", 394), item(3, "Банан в шоколаде, ВЕС", "кг", 2004),
    ], "банан");
    expect(m?.xml_id).toBe(1);
    expect(m?.weighed).toBe(true);
  });
  it("продукт должен стоять в первых двух словах: «дорадо в оливковом масле» — не масло", () => {
    expect(pickCard([item(1, "Дорадо в оливковом масле, 300 г", "шт", 500)], "масло оливковое")).toBeNull();
    expect(pickCard([item(2, "Масло оливковое Extra Virgin, 500 мл", "шт", 660)], "масло оливковое")?.grams).toBe(500);
  });
  it("«куриное филе» ищется как филе грудки цыпленка", () => {
    expect(pickCard([item(1, "Филе грудки цыпленка-бройлера", "кг", 656)], "куриное филе")?.xml_id).toBe(1);
  });
});

describe("ссылка на корзину для приложения магазина", () => {
  it("тот же номер корзины на пути /mobile, который у магазина отдан приложению", () => {
    expect(appCartUrl("https://vkusvill.ru/?share_basket=4031576198")).toBe("https://vkusvill.ru/mobile?share_basket=4031576198");
    expect(appCartUrl("https://vkusvill.ru/other")).toBe("https://vkusvill.ru/other");
  });
});

describe("режим готовки: таймер из текста шага", () => {
  it("минуты, диапазон по нижней границе, полчаса и час", () => {
    expect(minutesIn("Вари 20 минут на слабом огне")).toBe(20);
    expect(minutesIn("Обжарь 3–4 минуты")).toBe(3);
    expect(minutesIn("Туши полчаса")).toBe(30);
    expect(minutesIn("Оставь на час")).toBe(60);
    expect(minutesIn("Посыпь зеленью")).toBe(0);
    expect(minutesIn("Часть лука отложи")).toBe(0);
  });
});

describe("«как в прошлые дни»", () => {
  it("вчерашняя своя еда без повторов, свежее первым, сегодняшняя не считается", () => {
    const e1 = addExtra(undefined, { text: "шаурма", kcal: 560, protein: 28 }, 4);
    const e2 = setOwnText(toggleMark(undefined, "lunch", "own", 4), "lunch", { text: "Шаурма", kcal: 600, protein: 30 });
    const e3 = addExtra(undefined, { text: "творожок", kcal: 200, protein: 17, exact: true }, 4);
    const today = addExtra(undefined, { text: "сегодняшнее", kcal: 100, protein: 1 }, 4);
    const r = recentWritten({ "2026-10-05": e1, "2026-10-06": e2, "2026-10-07": e3, "2026-10-08": today }, "2026-10-08");
    expect(r.map(f => f.text)).toEqual(["творожок", "Шаурма"]);
  });
});
