import { makeCode, normCode, isCode, idOf, encrypt, decrypt } from "../cloud.js";
import { exportAll, importAll, type StoredState } from "./storage.js";
import { readLS, writeLS } from "./localStore.js";
import { BACKEND_URL } from "./notifications.js";
import { localDateISO } from "../today-date.js";

/**
 * Копия в облаке: сама уходит на сервер (при открытии и сворачивании, не чаще раза в 3 часа),
 * восстанавливается по коду.
 * Код создаётся при первой отправке и живёт в памяти телефона (и в копии файлом).
 */
const KEY = "edimispim.cloud";
export interface CloudInfo { code: string; at?: string; ts?: number; noted?: boolean }

export const readCloud = (): CloudInfo | null => readLS<CloudInfo | null>(KEY, null);
const writeCloud = (c: CloudInfo) => writeLS(KEY, c);

/** Человек записал код — карточку «Запиши код» больше не показываем. */
export const markCodeNoted = () => { const c = readCloud(); if (c) writeCloud({ ...c, noted: true }); };

/**
 * Отправить копию. Без `force` — не чаще раза в 3 часа: KV на бесплатном тарифе даёт
 * тысячу записей в сутки на всех. Зовётся при открытии и при сворачивании, так что
 * потерять можно максимум несколько часов. Возвращает свежую информацию или null,
 * если не вышло (нет сети — ничего страшного, попробуем в следующий раз).
 */
const EVERY_MS = 3 * 3600_000;
// одна отправка за раз: две параллельные (открытие + сворачивание) придумали бы два разных кода
let inflight: Promise<CloudInfo | null> | null = null;
export function cloudUpload(force = false): Promise<CloudInfo | null> {
  inflight ??= upload(force).finally(() => { inflight = null; });
  return inflight;
}
async function upload(force: boolean): Promise<CloudInfo | null> {
  const cur = readCloud() ?? { code: makeCode() };
  if (!force && cur.ts && Date.now() - cur.ts < EVERY_MS) return cur;
  try {
    const res = await fetch(BACKEND_URL + "/backup", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: await idOf(cur.code), data: await encrypt(cur.code, exportAll()) }),
    });
    // только «ok» от /backup: старый сервер на неизвестный адрес тоже отвечал 200
    if (!res.ok || (await res.text()) !== "ok") { if (!readCloud()) writeCloud(cur); return null; }
    const next = { ...cur, at: localDateISO(), ts: Date.now() };
    writeCloud(next);
    return next;
  } catch {
    if (!readCloud()) writeCloud(cur);   // код показываем сразу, даже если сеть подвела
    return null;
  }
}

export type RestoreResult = StoredState | "bad-code" | "not-found" | "wrong-code" | "limit" | "offline";

/** Вернуть всё по коду. Код становится кодом этого телефона — дальше копии идут туда же. */
export async function cloudRestore(input: string): Promise<RestoreResult> {
  if (!isCode(input)) return "bad-code";
  const code = normCode(input);
  let res: Response;
  try {
    res = await fetch(BACKEND_URL + "/restore", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: await idOf(code) }),
    });
  } catch { return "offline"; }
  if (res.status === 404) return "not-found";
  if (res.status === 429) return "limit";
  if (!res.ok) return "offline";
  let text: string;
  try { text = await decrypt(code, await res.text()); } catch { return "wrong-code"; }
  const state = importAll(text);
  if (!state) return "wrong-code";
  writeCloud({ code, at: localDateISO(), ts: Date.now(), noted: true });
  return state;
}

export const RESTORE_RU: Record<Exclude<RestoreResult, StoredState>, string> = {
  "bad-code": "Это не код: нужно четыре слова, например «лиса-река-гром-сыр».",
  "not-found": "Копии с таким кодом нет. Проверь слова.",
  "wrong-code": "Копия есть, но не открылась. Проверь слова.",
  "limit": "Слишком много попыток за день. Попробуй завтра.",
  "offline": "Нет связи с сервером. Проверь интернет и попробуй ещё раз.",
};
