#!/usr/bin/env python3
"""
Значки приложения — Solar Bold Duotone (480 Design, CC BY 4.0) → src/ui2/icons.ts.

Чтобы добавить значок: допиши имя (без «-bold-duotone») в NAMES и запусти
  python3 scripts/gen-icons.py
Набор берётся с jsDelivr (@iconify-json/solar), новая зависимость в проект не нужна.

Второй тон (слой с opacity) переставляется ПЕРВЫМ, чтобы рисоваться снизу: приложение красит
его сплошным розовым, и у 12 значков он иначе закрывал рисунок (лицо «плохо» пропадало целиком).
"""
import json, os, re, urllib.request, xml.etree.ElementTree as ET

NAMES = [
    "sun-2", "cup-hot", "bolt", "moon-sleep", "walking", "bath", "moon", "bed", "chef-hat", "plate", "donut", "leaf",
    "sad-circle", "confounded-circle", "expressionless-circle", "smile-circle", "emoji-funny-circle",
    "scale", "chart-2", "alarm", "users-group-rounded", "cloud-download", "bell", "palette", "question-circle", "info-circle",
    "check-circle", "check", "pen", "close", "refresh", "arrow-right", "magnifer", "like", "dislike", "upload-square", "add-circle",
    "chat-round-dots", "share", "history", "alt-arrow-down",
]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "../src/ui2/icons.ts")
CACHE = "/tmp/solar-icons.json"

if not os.path.exists(CACHE):
    req = urllib.request.Request("https://cdn.jsdelivr.net/npm/@iconify-json/solar/icons.json", headers={"User-Agent": "Mozilla/5.0"})
    open(CACHE, "wb").write(urllib.request.urlopen(req, timeout=120).read())
icons = json.load(open(CACHE))["icons"]

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
def under_first(body: str) -> str:
    root = ET.fromstring(f'<svg xmlns="{NS}">{body}</svg>')
    for g in root.iter():
        kids = list(g)
        under = [k for k in kids if k.get("opacity")]
        if under and len(under) < len(kids):
            for k in kids: g.remove(k)
            for k in under + [k for k in kids if not k.get("opacity")]: g.append(k)
    out = ET.tostring(root, encoding="unicode")
    return re.sub(r"^<svg[^>]*>|</svg>$", "", out).replace(f' xmlns="{NS}"', "")

lines = ["/**",
         " * Значки — Solar Bold Duotone (480 Design, CC BY 4.0: https://creativecommons.org/licenses/by/4.0/),",
         " * выбор Сердара 2026-10-07. Сгенерировано scripts/gen-icons.py — не править руками.",
         " * Второй тон (слой с opacity) красится отдельно (.ico в sky.css) и всегда рисуется снизу.",
         " */",
         "export const ICONS = {"]
for n in NAMES:
    lines.append(f'  "{n}": {json.dumps(under_first(icons[n + "-bold-duotone"]["body"]), ensure_ascii=False)},')
lines += ["} as const;", "", "export type IcoName = keyof typeof ICONS;", ""]
open(OUT, "w").write("\n".join(lines))
print(f"{len(NAMES)} значков → {os.path.relpath(OUT)}")
