#!/usr/bin/env python3
"""
Готовая еда ВкусВилла — каталог для «дня без готовки».

Через открытый MCP магазина берутся карточки готовых блюд (салаты, супы, вторые, омлеты, каши,
творог, йогурты, фрукты, десерты), из каждой — вес упаковки и КБЖУ на 100 г с этикетки.
Клетчатки на этикетках нет — она прикидывается по типу блюда (см. FIBER) и в приложении
так и подписана: «≈, по типу блюда».

Выход: src/food/data/ready.json — список {id, xml_id, name, grams, kcal, protein, fat, carbs
(на 100 г), fiber (прикидка на 100 г), price, slot, kind, url}. Цены и ассортимент протухают —
дата в поле `date`; перезапуск — 5 минут при 60 запросах в минуту.

Запуск: python3 scripts/fetch-ready.py
"""
import json, os, re, time, urllib.request, datetime

MCP = "https://mcp001.vkusvill.ru/mcp"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../src/food/data/ready.json")
UA = "Mozilla/5.0 (edimispim; mmmikeshinoda@gmail.com)"

# запрос → (слоты, вид, страниц). Вид нужен для прикидки клетчатки и для разнообразия внутри дня.
QUERIES = [
    ("салат", ["lunch", "dinner"], "salad", 4), ("боул", ["lunch", "dinner"], "salad", 2), ("суп", ["lunch"], "soup", 3),
    ("омлет", ["breakfast"], "eggs", 2), ("каша", ["breakfast"], "porridge", 3), ("сырники", ["breakfast"], "cottage", 2),
    ("творог", ["breakfast", "snack"], "cottage", 3), ("творожок", ["snack", "dessert"], "cottage", 2),
    ("йогурт", ["snack", "breakfast"], "yogurt", 3), ("запеканка творожная", ["breakfast", "dessert"], "cottage", 1),
    ("курица запечённая", ["lunch", "dinner"], "meat", 3), ("индейка запечённая", ["lunch", "dinner"], "meat", 2),
    ("рыба запечённая", ["lunch", "dinner"], "fish", 2), ("котлеты", ["lunch", "dinner"], "meat", 3),
    ("тефтели", ["lunch", "dinner"], "meat", 1), ("плов", ["lunch", "dinner"], "grain", 1), ("гречка с", ["lunch", "dinner"], "grain", 2),
    ("рис с", ["lunch", "dinner"], "grain", 1), ("паста", ["lunch", "dinner"], "grain", 1), ("овощи на пару", ["dinner", "lunch"], "veg", 2),
    ("овощи запечённые", ["dinner", "lunch"], "veg", 2), ("сэндвич", ["breakfast", "lunch"], "sandwich", 1),
    ("хумус", ["snack"], "veg", 1), ("яблоко", ["snack"], "fruit", 1), ("банан", ["snack"], "fruit", 1), ("фрукты нарезка", ["snack", "dessert"], "fruit", 1),
    ("груша", ["snack"], "fruit", 1), ("мандарины", ["snack"], "fruit", 1), ("десерт", ["dessert"], "dessert", 2), ("пудинг", ["dessert", "snack"], "dessert", 1),
    ("мороженое", ["dessert"], "dessert", 1), ("зефир", ["dessert"], "dessert", 1), ("орехи", ["snack"], "nuts", 1), ("хлебцы", ["snack", "breakfast"], "bread", 1),
]
# свежее без этикетки: КБЖУ на 100 г из нашего справочника (ккал, белки, жиры, углеводы, клетчатка), граммов в штуке.
# У магазина карточка «Банан, шт» с весом — берём её; иначе весовой товар, цена за штуку считается от цены за кг.
FRESH = {
    "банан": ((89, 1.1, 0.3, 23, 2.6), 150, ["snack", "breakfast"], "fruit"), "яблоко": ((52, 0.3, 0.2, 14, 2.4), 150, ["snack", "breakfast"], "fruit"),
    "груша": ((57, 0.4, 0.1, 15, 3.1), 160, ["snack", "breakfast"], "fruit"), "мандарины": ((53, 0.8, 0.3, 13, 1.8), 160, ["snack", "breakfast"], "fruit"),
    "киви": ((61, 1.1, 0.5, 15, 3.0), 150, ["snack", "breakfast"], "fruit"), "апельсин": ((47, 0.9, 0.1, 12, 2.4), 180, ["snack", "breakfast"], "fruit"),
    "огурцы": ((15, 0.7, 0.1, 3.6, 0.5), 200, ["lunch", "dinner", "snack"], "veg"), "томаты": ((18, 0.9, 0.2, 3.9, 1.2), 200, ["lunch", "dinner", "snack"], "veg"),
    "морковь": ((41, 0.9, 0.2, 10, 2.8), 150, ["snack"], "veg"), "перец сладкий": ((26, 1, 0.3, 6, 2.1), 150, ["lunch", "dinner"], "veg"),
}
# клетчатка на 100 г по типу — этикетки её не пишут
FIBER = {"salad": 2.0, "soup": 1.2, "eggs": 0.8, "porridge": 1.8, "cottage": 0.3, "yogurt": 0.3, "meat": 0.8, "fish": 0.8,
         "grain": 1.8, "veg": 2.5, "sandwich": 1.5, "fruit": 2.2, "dessert": 0.8, "nuts": 7.0, "bread": 6.0}
# не еда «здесь и сейчас»: сырое, замороженное, полуфабрикаты, напитки, корм
STOP = re.compile(r"заморож|зам\.|охлажд|сыр[оа]я|полуфабрикат|для варки|для жарки|для запекания|варить|фарш|тесто|напит|сок\b|нектар|корм|"
                  r"колбас|сосиск|сардельк|ветчин|паштет|карбонад|балык|буженин|нарезка|наггетс|"
                  r"для животных|набор|подарочн|микс для|смесь для|сухой завтрак|хлопья\b|мука|крупа\b|макароны\b|консерв|"
                  r"в собственном соку|соус\b|заправка|приправ|специ|ВЕС\b|весово", re.I)

def rpc(name, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(MCP, data=body, headers={"content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r: d = json.load(r)
    if "error" in d: raise RuntimeError(d["error"].get("message"))
    t = json.loads(d["result"]["content"][0]["text"])
    if not t.get("ok"): raise RuntimeError(t.get("error", {}).get("message", "vv error"))
    return t["data"]

NUM = r"([\d]+(?:[.,]\d+)?)"
def kbju(it):
    """КБЖУ на 100 г из свойств карточки; форматы разные: «белки 11.9 г, жиры …; 121 ккал» и «белки – 8,6 г; …»."""
    for p in it.get("properties") or []:
        if "ценност" not in (p.get("name") or "").lower(): continue
        v = (p.get("value") or "").replace("\xa0", " ")
        b = re.search(r"белк[иа][^\d]*" + NUM, v, re.I); z = re.search(r"жир[ыа][^\d]*" + NUM, v, re.I)
        u = re.search(r"углевод[ыа][^\d]*" + NUM, v, re.I); k = re.search(NUM + r"\s*ккал", v, re.I)
        if b and z and u and k:
            f = lambda m: float(m.group(1).replace(",", "."))
            return f(k), f(b), f(z), f(u)
    return None

def grams(it):
    w = it.get("weight") or {}
    if w.get("value"):
        return float(w["value"]) * (1000 if str(w.get("unit", "")).lower() in ("кг", "л") else 1)
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(кг|г|мл|л)\b", it["name"].replace("&nbsp;", " "), re.I)
    if m: return float(m.group(1).replace(",", ".")) * (1000 if m.group(2).lower() in ("кг", "л") else 1)
    return None

out, seen = [], set()
for q, slots, kind, pages in QUERIES:
    for page in range(1, pages + 1):
        try: data = rpc("vkusvill_products_search", {"q": q, "limit": 10, "page": page, "mode": "full"})
        except Exception as e: print(q, page, "ERR", e); break
        for it in data.get("items", []):
            if it["xml_id"] in seen: continue
            name = it["name"].replace("&nbsp;", " ").strip()
            if STOP.search(name): continue
            g = grams(it); n = kbju(it); p = (it.get("price") or {}).get("current")
            if not g or not n or not p or g < 40 or g > 1200: continue
            kcal, prot, fat, carbs = n
            if kcal <= 0 or kcal > 700: continue
            seen.add(it["xml_id"])
            out.append({"id": it["id"], "xml_id": it["xml_id"], "name": name, "grams": round(g), "kcal": kcal, "protein": prot, "fat": fat,
                        "carbs": carbs, "fiber": FIBER[kind], "price": p, "slots": slots, "kind": kind, "url": it.get("url", "")})
            if kind == "fruit": out.pop(); seen.discard(it["xml_id"])   # «фрукты» из поиска — конфеты и желе; свежее берём отдельно ниже
        time.sleep(1.1)
        if not data.get("meta", {}).get("has_more"): break
    print(f"{q:22} → всего {len(out)}", flush=True)
for q, ((kcal, prot, fat, carbs, fiber), piece, slots, kind) in FRESH.items():
    try: data = rpc("vkusvill_products_search", {"q": q, "limit": 10, "page": 1, "mode": "full"})
    except Exception as e: print(q, "ERR", e); continue
    st = q[:4]
    cards = [it for it in data.get("items", []) if st in it["name"].lower().replace("ё", "е")[:30] and not re.search(r"сушён|вялен|чипс|в шоколаде|сок|пюре|заморож|конфет|мини", it["name"], re.I)]
    pc = next((it for it in cards if it.get("unit") == "шт" and (it.get("weight") or {}).get("value")), None)
    kg = next((it for it in cards if it.get("unit") == "кг"), None)
    it = pc or kg
    if not it: print(q, "НЕ НАЙДЕНО"); time.sleep(1.1); continue
    g = round(float(it["weight"]["value"]) * 1000) if pc else piece
    price = it["price"]["current"] if pc else round(it["price"]["current"] * g / 1000)
    out.append({"id": it["id"], "xml_id": it["xml_id"], "name": it["name"].replace("&nbsp;", " ").strip(), "grams": g, "kcal": kcal, "protein": prot,
                "fat": fat, "carbs": carbs, "fiber": fiber, "price": price, "slots": slots, "kind": kind, "url": it.get("url", ""), **({} if pc else {"weighed": True})})
    print(f"{q:14} → {it['name'][:40]} {'шт' if pc else 'кг'} {g} г {price} ₽", flush=True)
    time.sleep(1.1)
json.dump({"date": datetime.date.today().isoformat(), "source": "ВкусВилл, Москва, КБЖУ с этикеток", "items": out},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nготовой еды: {len(out)} → {OUT}")
