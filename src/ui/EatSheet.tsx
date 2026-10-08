import { useState } from "react";
import { Sheet } from "./Sheet.js";
import { BACKEND_URL } from "./notifications.js";
import { tap } from "./haptics.js";
import { deviceId } from "./localStore.js";
import type { WrittenFood } from "../food/eaten.js";

/**
 * «Что ты съел?» — пишешь словами, коуч прикидывает калории и белок.
 *
 * Точного подсчёта тут не бывает: модель берёт типичную порцию, ±30% — норма. Поэтому
 * результат сначала показывается, и только по кнопке записывается: человек видит, из чего
 * сложилась цифра, и может переписать «кусок пиццы» на «два куска».
 */
export function EatSheet({ title, onClose, onSave, recent = [] }: {
  title: string;
  onClose: () => void;
  onSave: (food: WrittenFood) => void;
  /** Своя еда за прошлые дни — повторить одним нажатием. */
  recent?: WrittenFood[];
}) {
  const [mode, setMode] = useState<"words" | "label">("words");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // фото тарелки: ужимается до 768 px прямо на телефоне — снимок с камеры весит 3–5 МБ, а модели хватает 100–200 КБ
  const [photo, setPhoto] = useState<string | null>(null);
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try { setPhoto(await shrink(file)); setResult(null); setErr(""); }
    catch { setErr("Не получилось открыть фото. Попробуй другое."); }
  };
  // с этикетки: вес и КБЖУ — на 100 г (так пишут на упаковках) или на всё
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("");
  const [per, setPer] = useState<"100" | "all">("100");
  const [nums, setNums] = useState({ kcal: "", protein: "", fat: "", carbs: "" });
  const num = (s: string) => Number(s.replace(",", ".")) || 0;
  const factor = per === "100" ? num(grams) / 100 : 1;
  const label = {
    kcal: Math.round(num(nums.kcal) * factor), protein: Math.round(num(nums.protein) * factor),
    fat: Math.round(num(nums.fat) * factor), carbs: Math.round(num(nums.carbs) * factor),
  };
  const labelOk = !!name.trim() && label.kcal > 0 && (per === "all" || num(grams) > 0);
  const saveLabel = () => {
    tap();
    onSave({
      text: `${name.trim()}${num(grams) > 0 ? ` ${num(grams)} г` : ""}`, kcal: label.kcal, protein: label.protein, exact: true,
      ...(nums.fat ? { fat: label.fat } : {}), ...(nums.carbs ? { carbs: label.carbs } : {}),
    });
    onClose();
  };
  const [result, setResult] = useState<{ kcal: number; protein: number; labelRU: string } | null>(null);
  const [err, setErr] = useState("");

  const estimate = async () => {
    const q = text.trim();
    if ((!q && !photo) || busy) return;
    tap(); setBusy(true); setErr(""); setResult(null);
    try {
      const res = await fetch(BACKEND_URL + "/estimate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: q, ...(photo ? { image: photo } : {}), deviceId: deviceId() }),
      });
      const data = await res.json().catch(() => ({}));
      // старый воркер без /estimate отвечает 200 и не JSON — это тоже «недоступно», а не «≈ undefined»
      if (!res.ok || !Number.isFinite(data?.kcal)) setErr(data?.error ?? "Оценка сейчас недоступна. Попробуй позже.");
      else setResult(data);
    } catch {
      setErr("Нет связи — проверь интернет и попробуй ещё раз.");
    } finally { setBusy(false); }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="seg" role="group" aria-label="Как записать">
        <button className={mode === "words" ? "seg-item on" : "seg-item"} aria-pressed={mode === "words"} onClick={() => setMode("words")}>Словами</button>
        <button className={mode === "label" ? "seg-item on" : "seg-item"} aria-pressed={mode === "label"} onClick={() => setMode("label")}>С этикетки</button>
      </div>
      {mode === "label" && (
        <>
          <p className="small muted">Как на упаковке: вес и цифры на 100 г или на всю порцию. Запишется точно, без прикидки.</p>
          <label className="fld">Что это
            <input type="text" value={name} maxLength={60} autoFocus onChange={e => setName(e.target.value)} placeholder="творожок, суп из кулинарии" />
          </label>
          <label className="fld">Вес, г
            <input type="text" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} placeholder="170" />
          </label>
          <div className="seg" role="group" aria-label="Цифры указаны">
            <button className={per === "100" ? "seg-item on" : "seg-item"} aria-pressed={per === "100"} onClick={() => setPer("100")}>на 100 г</button>
            <button className={per === "all" ? "seg-item on" : "seg-item"} aria-pressed={per === "all"} onClick={() => setPer("all")}>на всю порцию</button>
          </div>
          <div className="eat-grid">
            {([["kcal", "Ккал"], ["protein", "Белки, г"], ["fat", "Жиры, г"], ["carbs", "Углеводы, г"]] as const).map(([k, ru]) => (
              <label key={k} className="fld">{ru}
                <input type="text" inputMode="decimal" value={nums[k]} onChange={e => setNums({ ...nums, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          {labelOk && (
            <div className="eat-result">
              <b>{label.kcal} ккал · белок {label.protein} г{nums.fat ? ` · жиры ${label.fat} г` : ""}{nums.carbs ? ` · углеводы ${label.carbs} г` : ""}</b>
              {per === "100" && <p className="small muted">На {num(grams)} г по цифрам на 100 г.</p>}
            </div>
          )}
          <button className="s-btn food" disabled={!labelOk} onClick={saveLabel}>Записать</button>
        </>
      )}
      {mode === "words" && (<>
      <p className="small muted mt-0">
        Сфотографируй тарелку или напиши как есть: «гречка с котлетой», «два куска пиццы и чай». Коуч прикинет
        калории и белок. Фото и текст уходят только для оценки и нигде не хранятся.
      </p>
      {recent.length > 0 && !photo && !result && (
        <div className="eat-recent">
          <span className="small muted">Как в прошлые дни:</span>
          <div className="s-chips-row">
            {recent.map((f, k) => (
              <button key={k} className="s-pill" onClick={() => { tap(); onSave(f); onClose(); }}>
                {f.text} · {f.kcal} ккал
              </button>
            ))}
          </div>
        </div>
      )}
      {photo
        ? <div className="eat-photo-wrap">
            <img className="eat-photo" src={photo} alt="Фото еды" />
            <button className="linkbtn" onClick={() => { setPhoto(null); setResult(null); }}>убрать фото</button>
          </div>
        : <label className="s-btn ghost eat-camera">
            Сфотографировать
            <input type="file" accept="image/*" capture="environment" hidden
              onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </label>}
      <textarea className="eat-text" rows={photo ? 2 : 3} value={text} maxLength={300} autoFocus={!photo}
        onChange={e => { setText(e.target.value); setResult(null); }}
        placeholder={photo ? "Что не видно на фото: соус, добавка, размер" : "Что съел?"} aria-label="Что съел" />
      {!result && (
        <button className="s-btn food" disabled={busy || (!text.trim() && !photo)} onClick={estimate}>
          {busy ? "Считаю…" : photo ? "Оценить по фото" : "Оценить"}
        </button>
      )}
      {err && <p className="small note-warn">{err}</p>}
      {result && (
        <div className="eat-result">
          <b>≈ {result.kcal} ккал · белок {result.protein} г</b>
          <p className="small muted">{result.labelRU}. Это прикидка{photo ? " по фото" : ""} — точность около ±30%.</p>
          <div className="btn-row">
            <button className="s-btn food" onClick={() => { tap(); onSave({ text: text.trim() || result.labelRU, kcal: result.kcal, protein: result.protein }); onClose(); }}>
              Записать
            </button>
            <button className="linkbtn" onClick={() => setResult(null)}>поправить</button>
          </div>
        </div>
      )}
      </>)}
    </Sheet>
  );
}

/**
 * Ужать снимок до 768 px по длинной стороне и отдать JPEG data-URL.
 * `createImageBitmap` с `imageOrientation` сам поворачивает по EXIF — снимок с телефона в кадре не ляжет набок.
 */
async function shrink(file: File, max = 768): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.7);
}
