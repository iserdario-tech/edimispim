import { makeCode, normCode, isCode, idOf, encrypt, decrypt } from "../cloud.js";
import type { PairMenu } from "../pair.js";
import type { Pantry } from "../food/packaging.js";
import { readLS, writeLS } from "./localStore.js";
import { BACKEND_URL } from "./notifications.js";

/**
 * «Готовим вдвоём» на телефоне.
 *
 * Тот, кто создал пару, — «a»: его меню общее. Вошедший по коду — «b». Каждый публикует
 * свои калории (по ним партнёр считает покупки на двоих), «a» — меню на неделю,
 * оба — кладовку с галочками «взял». Всё шифруется кодом пары.
 */
const KEY = "edimispim.pair";
export interface PairInfo {
  code: string;
  role: "a" | "b";
  /** Меню пары (у «b»), калории партнёра, последние отправленные значения — чтобы не писать зря. */
  menu?: PairMenu;
  otherKcal?: number;
  sent?: Record<string, string>;
  pantryTs?: number;
}

export const readPair = (): PairInfo | null => readLS<PairInfo | null>(KEY, null);
const writePair = (p: PairInfo | null) => writeLS(KEY, p);

async function put(p: PairInfo, key: string, value: unknown): Promise<boolean> {
  const text = JSON.stringify(value);
  if (p.sent?.[key] === text) return true;   // не изменилось — запись в KV не тратим
  try {
    const res = await fetch(BACKEND_URL + "/pair/put", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: await idOf(p.code, "edimispim-pair:"), key, data: await encrypt(p.code, text) }),
    });
    if (!res.ok || (await res.text()) !== "ok") return false;
    const cur = readPair();
    if (cur && cur.code === p.code) writePair({ ...cur, sent: { ...(cur.sent ?? {}), [key]: text } });
    return true;
  } catch { return false; }
}

async function get<T>(code: string, key: string): Promise<T | null | "offline"> {
  try {
    const res = await fetch(BACKEND_URL + "/pair/get", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: await idOf(code, "edimispim-pair:"), key }),
    });
    if (res.status === 404) return null;
    if (!res.ok) return "offline";
    return JSON.parse(await decrypt(code, await res.text())) as T;
  } catch { return "offline"; }
}

/** Создать пару: код показываем, партнёр вводит его у себя. */
export function createPair(): PairInfo {
  const p: PairInfo = { code: makeCode(), role: "a" };
  writePair(p);
  return p;
}

/** Войти по коду партнёра. Пара существует, только если создатель уже отправил свои данные. */
export async function joinPair(input: string): Promise<PairInfo | "bad-code" | "not-found" | "offline"> {
  if (!isCode(input)) return "bad-code";
  const code = normCode(input);
  const a = await get<{ kcal: number }>(code, "m-a");
  if (a === "offline") return "offline";
  if (!a) return "not-found";
  const p: PairInfo = { code, role: "b", otherKcal: a.kcal };
  writePair(p);
  return p;
}

export const leavePair = () => writePair(null);

/**
 * Обмен с сервером: при открытии и возвращении в приложение. Своё — отправить,
 * чужое — забрать. Возвращает обновлённую пару (для перерисовки) или null без пары.
 */
export async function syncPair(own: { kcal: number; menu?: PairMenu; pantry: Pantry; setPantry: (p: Pantry) => void }): Promise<PairInfo | null> {
  let p = readPair();
  if (!p) return null;
  const other = p.role === "a" ? "m-b" : "m-a";
  await put(p, `m-${p.role}`, { kcal: own.kcal });
  if (p.role === "a" && own.menu) await put(p, "menu", own.menu);

  const [o, menu, pantry] = await Promise.all([
    get<{ kcal: number }>(p.code, other),
    p.role === "b" ? get<PairMenu>(p.code, "menu") : Promise.resolve(null),
    get<{ ts: number; pantry: Pantry }>(p.code, "pantry"),
  ]);
  p = readPair();
  if (!p) return null;
  const next: PairInfo = { ...p };
  if (o && o !== "offline") next.otherKcal = o.kcal;
  if (menu && menu !== "offline") next.menu = menu;
  // кладовка: побеждает более свежая отметка — с какого бы телефона её ни поставили
  if (pantry && pantry !== "offline" && pantry.ts > (p.pantryTs ?? 0)) {
    next.pantryTs = pantry.ts;
    own.setPantry(pantry.pantry);
  }
  writePair(next);
  return next;
}

/** Свежие галочки партнёра — пока открыт список покупок (вдвоём в магазине). */
export async function pullPantry(setPantry: (p: Pantry) => void): Promise<void> {
  const p = readPair();
  if (!p) return;
  const r = await get<{ ts: number; pantry: Pantry }>(p.code, "pantry");
  const cur = readPair();
  if (!r || r === "offline" || !cur || r.ts <= (cur.pantryTs ?? 0)) return;
  writePair({ ...cur, pantryTs: r.ts });
  setPantry(r.pantry);
}

/** Галочка «взял» / «дома есть» — сразу партнёру. */
export async function sharePantry(pantry: Pantry): Promise<void> {
  const p = readPair();
  if (!p) return;
  const ts = Date.now();
  writePair({ ...p, pantryTs: ts });
  await put(p, "pantry", { ts, pantry });
}
