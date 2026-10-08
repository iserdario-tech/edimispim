#!/usr/bin/env python3
"""
Рецепты ВкусВилла → черновик для add-recipes.

Шаг 1 — выгрузка: `python3 scripts/vv-recipes.py fetch <папка> чечевица нут фасоль …` — через MCP магазина
(`vkusvill_recipes`, все фильтры обязательны, нули и пустой массив) в <папка>/vv-recipes.json.
Шаг 2 — сопоставление: `python3 scripts/vv-recipes.py map <папка>` — названия продуктов магазина переводятся
в наши по таблице `scripts/vv-products-map.json` («нут конс.» → «нут консервированный», «-» — не продукт),
количества в граммы, считаются ккал/белок/клетчатка на порцию по nutrients.ts, список ранжируется по клетчатке
и пишется в <папка>/vv-good.json; несопоставленные названия печатаются — их дописывать в таблицу.
Шаг 3 — руками: выбрать блюда, переписать шаги своими словами в черновик scripts/drafts/wave-*.ts (пример — wave-t.ts).
Партия T (2026-10-08): из 221 выгруженного сопоставились 28, взято 15.
"""
import json, re, collections, sys, os, time, urllib.request

def fetch(folder, queries):
    MCP = "https://mcp001.vkusvill.ru/mcp"
    def rpc(name, args):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}).encode()
        req = urllib.request.Request(MCP, data=body, headers={"content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": "Mozilla/5.0 (edimispim)"})
        with urllib.request.urlopen(req, timeout=40) as r: d = json.load(r)
        return json.loads(d["result"]["content"][0]["text"])
    out = {}
    for q in queries:
        for page in (1, 2):
            t = rpc("vkusvill_recipes", {"q": q, "sort": "popularity", "page": page, "id_feature_filter": 0, "id_cooking_time_filter": 0,
                                         "id_cooking_method_filter": 0, "id_complexity_filter": 0, "id_category_filter": 0, "id_exclude_allergens_filter": []})
            for it in (t.get("data") or {}).get("items", []): out[it["id"]] = it
            time.sleep(1.2)
            if not (t.get("data") or {}).get("meta", {}).get("has_more"): break
    json.dump(list(out.values()), open(os.path.join(folder, "vv-recipes.json"), "w"), ensure_ascii=False)
    print("рецептов", len(out))

if len(sys.argv) > 1 and sys.argv[1] == "fetch":
    fetch(sys.argv[2], sys.argv[3:]); sys.exit()
if len(sys.argv) > 1 and sys.argv[1] == "map":
    sys.argv = [sys.argv[0], sys.argv[2]]
S = sys.argv[1] if len(sys.argv) > 1 else "."
rec = json.load(open(f"{S}/vv-recipes.json"))
nut = re.findall(r'^\s*"([^"]+)":\s*\[([\d.]+), ([\d.]+), ([\d.]+)\]', open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../src/food/nutrients.ts")).read(), re.M)
NUT = {n: (float(k), float(p), float(f)) for n, k, p, f in nut}
MAP = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "vv-products-map.json")))
IGN = re.compile(r"^(соль|перец чёрный|перец черный|перец молотый|вода|лавров|специ|приправ|смесь перц|чеснок суш|зелень суш|кипят|уксус|лёд|лед)", re.I)
def norm(n): return re.sub(r"\s*\(.*?\)", "", n.lower().strip())
PIECE = {"яйца": 60, "лук": 100, "красный лук": 80, "морковь": 80, "перец болгарский": 150, "кабачок": 300, "томаты": 120, "огурец": 120, "лимон": 60, "авокадо": 150, "картофель": 120, "яблоко": 150, "банан": 120, "баклажан": 300, "чеснок": 5, "апельсин": 180, "свёкла": 150}
def qty_g(q, name):
    q = q.replace(",", ".").strip()
    m = re.match(r"([\d.]+)\s*(г|мл|кг|л|шт|ст\. ?л|ч\. ?л|зуб|вет|щеп|пуч|стак)", q)
    if not m: return None
    v = float(m.group(1)); u = m.group(2).replace(" ", "")
    return {"г": v, "мл": v, "кг": v * 1000, "л": v * 1000, "шт": v * PIECE.get(name, 60), "ст.л": v * 15, "ч.л": v * 5, "зуб": v * 5, "вет": v * 5, "щеп": v, "пуч": v * 50, "стак": v * 200}.get(u)
good, unmapped = [], collections.Counter()
for r in rec:
    ct = (r.get("cooking_time") or {}).get("name") or ""; cx = (r.get("complexity") or {}).get("name") or ""
    if ct not in ("до 20 минут", "до 40 минут") or cx == "Профи": continue
    portions = r.get("portions") or 0
    if not portions: continue
    kcal = prot = fib = 0; ok = True; ings = []
    for ing in r.get("ingredients", []):
        n = norm(ing["name"]); q = ing.get("quantity") or ""
        if IGN.match(n) or "по вкусу" in q: continue
        p = MAP.get(n)
        if not p: unmapped[n] += 1; ok = False; continue
        if p == "-": continue
        g = qty_g(q, p)
        if g is None: ok = False; unmapped[f"{n} [{q}]"] += 1; continue
        k, pr, f = NUT[p]; kcal += k * g / 100; prot += pr * g / 100; fib += f * g / 100
        ings.append((p, g))
    if not ok: continue
    good.append({"id": r["id"], "name": r["name"], "url": r["url"], "portions": portions, "time": ct, "cx": cx,
                 "kcal": round(kcal / portions), "protein": round(prot / portions, 1), "fiber": round(fib / portions, 1), "ings": ings,
                 "steps": [s["text"] for s in r.get("steps", [])]})
good.sort(key=lambda x: -x["fiber"])
print("полностью сопоставлено", len(good), "из", len(rec))
for g in good[:45]: print(f'{g["id"]:8} {g["fiber"]:5.1f} клетч · {g["protein"]:5.1f} белок · {g["kcal"]:4} ккал · {g["time"]:12} · {g["name"][:58]}')
print("\nнесопоставленные (топ-50):", unmapped.most_common(50))
json.dump(good, open(f"{S}/vv-good.json", "w"), ensure_ascii=False, indent=1)
