#!/usr/bin/env python3
"""
Фотографии блюд для приложения.

Точных снимков к нашим рецептам не существует, поэтому берём фото ПО ТИПУ блюда:
курица-гриль выглядит как курица-гриль, суп — как суп. Это честнее генерации:
на картинке настоящая еда, снятая настоящим человеком.

Источник — Викисклад: свободные лицензии и прямые ссылки без ключей. Автор и лицензия
сохраняются рядом с файлом и показываются в приложении: CC BY требует указания авторства,
и это ровно тот случай, когда «сделать по-честному» ничего не стоит.
"""
import json, os, subprocess, sys, urllib.parse, urllib.request

OUT = os.path.expanduser("~/Desktop/edimispim/app/.worktrees/lab/public/food")
META = os.path.expanduser("~/Desktop/edimispim/app/.worktrees/lab/src/food/data/photos.json")
UA = "edimispim/1.0 (personal app; mmmikeshinoda@gmail.com)"

# архетип → поисковый запрос на Викискладе
KINDS = {
    "chicken":    "roast chicken breast plate food",
    "beef":       "beef stew plate food",
    "pork":       "pork chop plate food",
    "turkey":     "turkey meat dish plate",
    "fish":       "fried fish fillet plate",
    "seafood":    "shrimp dish plate food",
    "eggs":       "omelette plate breakfast",
    "cottage":    "syrniki",
    "porridge":   "oatmeal bowl breakfast",
    "pancakes":   "pancakes plate breakfast",
    "pasta":      "pasta bolognese plate",
    "rice":       "pilaf rice meat dish",
    "buckwheat":  "buckwheat porridge dish",
    "soup":       "vegetable soup bowl",
    "borscht":    "borscht soup bowl",
    "salad":      "vegetable salad bowl fresh",
    "sandwich":   "sandwich plate lunch",
    "burger":     "hamburger plate",
    "pizza":      "pizza margherita whole",
    "taco":       "tacos plate mexican food",
    "beans":      "chili con carne bowl",
    "potato":     "roasted potatoes dish",
    "vegetables": "roasted vegetables dish",
    "smoothie":   "smoothie glass fruit",
    "dessert":    "chocolate dessert plate",
    "fruit":      "apple fruit fresh",
    "nuts":       "nuts bowl snack",
    "hummus":     "hummus bowl chickpea",
    "cheese":     "cheese plate appetizer",
    "wrap":       "burrito wrap plate",
    "stirfry":    "stir fry noodles wok",
    # волна 37: конкретнее — чтобы йогурт-боул не показывал торт, а голубцы — пасту
    "shakshuka":  "shakshuka pan eggs tomato",
    "frenchtoast": "french toast berries plate",
    "muffins":    "muffins",
    "dumplings":  "pelmeni dumplings plate",
    "vareniki":   "vareniki",
    "cabbagerolls": "cabbage rolls golubtsy",
    "meatballs":  "meatballs tomato sauce plate",
    "cutlets":    "kotleta",
    "curry":      "curry rice bowl",
    "stew":       "meat stew pot vegetables",
    "roast":      "roast pork potatoes dish",
    "wings":      "chicken wings",
    "goulash":    "goulash stew",
    "salmon":     "salmon steak dish",
    "whitefish":  "cod fillet",
    "chia":       "chia pudding glass",
    "icecream":   "ice cream scoops bowl",
    "cheesecake": "cheesecake",
    "bakedapple": "baked apples",
    "energyballs": "energy balls",
    "overnightoats": "overnight oats",
    "bowl":       "quinoa salad bowl",
    "noodles":    "udon noodles bowl",
    "plov":       "plov",
    "risotto":    "mushroom risotto",
    "lasagna":    "lasagna slice plate",
    "avotoast":   "avocado toast plate",
    "creamsoup":  "pumpkin cream soup",
    "lentilsoup": "lentil soup bowl",
    "coldsoup":   "okroshka cold soup",
    "falafel":    "falafel plate",
    "stuffedpeppers": "stuffed bell peppers",
    "fritters":   "zucchini fritters plate",
    "draniki":    "potato pancakes draniki",
    "poke":       "poke bowl salmon",
    "tofu":       "tofu dish plate",
    "casserole":  "cottage cheese casserole",
    "mousse":     "chocolate mousse",
    # йогурт и творог с ягодами берут этот снимок: отдельные с Викисклада не нашлись приличные
    "granola":    "granola with yogurt",
    "kasha":      "millet porridge bowl",
    "bruschetta": "bruschetta tomato",
    "quesadilla": "quesadilla plate",
    "lavash":     "lavash roll",
    "mushrooms":  "sauteed mushrooms",
}

# «вид=номер»: если первый снимок не подошёл по виду, берём следующий кандидат
import sys as _sys
SKIP = dict(a.split("=") for a in _sys.argv[1:] if "=" in a)
FORCE = {a for a in _sys.argv[1:] if "=" not in a}

def search(q, limit=6):
    url = ("https://commons.wikimedia.org/w/api.php?action=query&format=json"
           "&generator=search&gsrnamespace=6&gsrlimit=%d&gsrsearch=%s"
           "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800"
           % (limit, urllib.parse.quote("filetype:bitmap " + q)))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    return list((data.get("query", {}).get("pages") or {}).values())

def pick(pages):
    """Свободнее — лучше: общественное достояние и CC0 идут раньше CC BY."""
    def rank(p):
        lic = p["imageinfo"][0].get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        low = lic.lower()
        if "public domain" in low or "cc0" in low: return 0
        if "cc by-sa" in low: return 2
        if "cc by" in low: return 1
        return 3
    return sorted(pages, key=rank)

os.makedirs(OUT, exist_ok=True)
# дописываем к собранному, а не собираем заново: проверенные глазами снимки не трогаем
meta = json.load(open(META, encoding="utf-8")) if os.path.exists(META) else {}
for kind, query in KINDS.items():
    dest = os.path.join(OUT, f"{kind}.jpg")
    if kind in meta and kind not in FORCE and kind not in SKIP:
        continue
    try:
        cands = pick(search(query, limit=10))[int(SKIP.get(kind, 0)):]
        for page in cands:
            ii = page["imageinfo"][0]
            ex = ii.get("extmetadata", {})
            lic = ex.get("LicenseShortName", {}).get("value", "?")
            if "fair use" in lic.lower() or "non-free" in lic.lower():
                continue
            req = urllib.request.Request(ii["thumburl"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                f.write(r.read())
            # 400 px по ширине с обрезкой в 4:3 — карточке больше не нужно
            subprocess.run(["sips", "-Z", "560", dest], capture_output=True)
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "60", dest,
                            "--out", dest], capture_output=True)
            author = ex.get("Artist", {}).get("value", "")
            import re
            author = re.sub("<[^>]+>", "", author).strip()[:80]
            meta[kind] = {
                "file": f"{kind}.jpg",
                "author": author or "неизвестен",
                "license": lic,
                "source": ii.get("descriptionurl", ""),
            }
            print(f"{kind:11} {lic:22} {os.path.getsize(dest)//1024:4} КБ  {author[:40]}")
            break
        else:
            print(f"{kind:11} НЕ НАЙДЕНО")
    except Exception as e:
        print(f"{kind:11} ОШИБКА: {e}")

with open(META, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f"\nсобрано: {len(meta)} из {len(KINDS)}")
