import type { Profile, DayMode, DayToggles } from "../index.js";
import { ALL_PUSHES, type PushMeal, type PushPrefs } from "../push.js";
import { readLS, writeLS } from "./localStore.js";

export interface PushDay { date: string; mode: DayMode; toggles: DayToggles; crunchUntilHM?: string }
/** Что ещё знает сервер: меню на сегодня и завтра (дата → приёмы) и переключатели. */
export interface PushExtra { meals?: Record<string, PushMeal[]>; prefs?: PushPrefs }

/** Переключатели живут на устройстве: подписка на пуши — тоже у каждого устройства своя. */
const PREFS_KEY = "edimispim.pushPrefs";
export const readPushPrefs = (): PushPrefs => ({ ...ALL_PUSHES, ...readLS<Partial<PushPrefs>>(PREFS_KEY, {}) });
export const writePushPrefs = (p: PushPrefs): void => writeLS(PREFS_KEY, p);

/**
 * Человек включал напоминания. Переезжает в копии данных: после переустановки или на новом
 * телефоне подписки нет (она у устройства), и без этой метки приложение молча жило бы без пушей —
 * ровно так Сердар остался без напоминаний после переустановки ради нового значка.
 */
export const PUSH_WANTED_KEY = "edimispim.pushWanted";
export const pushWanted = (): boolean => readLS<boolean>(PUSH_WANTED_KEY, false);
/** Когда сервер последний раз подтвердил подписку (ISO) — чтобы на телефоне было видно, что всё дошло. */
const SYNC_KEY = "edimispim.pushSyncAt";
export const readPushSyncAt = (): string | null => readLS<string | null>(SYNC_KEY, null);

/** Есть ли подписка на этом устройстве. Разрешение может быть, а подписки — нет (переустановка). */
export async function pushSubscribed(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch { return false; }
}

// Публичный VAPID-ключ (пара к приватному JWK на Worker — см. app/.vapid.json)
const VAPID_PUBLIC = "BL2WzWdDc3_XRNF9Q7M9lJP-SHQA6WSKaMYb32kKb7gZMqf9WX1R8ZkmhTbMdApqEu7xYQEFXxa-DXuDMQBx894";
/**
 * Собственный Worker приложения (Cloudflare, бесплатный тариф).
 * Задеплоен 2026-08-05, своё хранилище подписок — отдельное от pospat,
 * чтобы напоминания приходили с нашими текстами и вели в это приложение.
 */
export const BACKEND_URL = "https://edimispim-push.pospat.workers.dev";

/** Свой сервер уведомлений есть — пуши работают. */
export const PUSH_READY = true;

const PUSH_UNAVAILABLE_RU =
  "Напоминания сейчас недоступны. Всё остальное работает и без них — " +
  "приложение считает план прямо на телефоне.";

export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// iOS разрешает web-push только из PWA, добавленного на экран «Домой». В обычном Safari
// подписка молча падает — поэтому ловим этот случай заранее и объясняем, что делать.
function iosNeedsInstall(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as any).standalone === true || matchMedia("(display-mode: standalone)").matches;
  return isIOS && !standalone;
}

// Тихо обновляет то, что Worker знает о человеке (профиль + контекст дня), если подписка уже есть.
// Без неё пуши продолжали бы идти по расписанию на момент подписки. Разрешений не просит.
export async function syncPushContext(profile: Profile, day?: PushDay, extra: PushExtra = {}): Promise<void> {
  if (!PUSH_READY) return;   // не отправляем контекст в чужой Worker
  try {
    if (!("serviceWorker" in navigator)) return;
    // getRegistration, а не ready: ready висит вечно, если service worker не зарегистрирован
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    // Разрешение дано, а подписки нет (сброс iOS, переустановка с сохранённым разрешением) —
    // подписываемся молча: окна с вопросом не будет, а сервер снова узнает, куда слать.
    // У Сердара было ровно так: «Я» писало «включены», а в хранилище сервера — ноль подписок.
    if (!sub && typeof Notification !== "undefined" && Notification.permission === "granted") {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource });
      writeLS(PUSH_WANTED_KEY, true);
    }
    if (!sub) return; // напоминания не включены — синхронизировать нечего
    const res = await fetch(BACKEND_URL + "/subscribe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: sub, profile, tzOffsetMin: -new Date().getTimezoneOffset(), ...(day ? { day } : {}), ...extra }),
    });
    if (res.ok) writeLS(SYNC_KEY, new Date().toISOString());
  } catch { /* не критично: в следующий раз досинхронизируется */ }
}

export async function enableNotifications(profile: Profile, day?: PushDay): Promise<string> {
  // Пока своего Worker'а нет, подписка ушла бы в базу pospat — лучше честно сказать,
  // чем просить разрешение на уведомления, которые придут не те и уведут не туда.
  if (!PUSH_READY) return PUSH_UNAVAILABLE_RU;
  if (iosNeedsInstall())
    return "На айфоне напоминания включаются только из приложения на экране «Домой». В Safari нажми «Поделиться» (квадрат со стрелкой) → «На экран Домой», потом открой «edim & spim» с иконки и снова нажми эту кнопку.";
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return "Уведомления не поддерживаются этим браузером.";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "Разрешение не выдано. Включить можно в настройках браузера/приложения.";
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
    const res = await fetch(BACKEND_URL + "/subscribe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: sub, profile, tzOffsetMin: -new Date().getTimezoneOffset(), ...(day ? { day } : {}), prefs: readPushPrefs() }),
    });
    // Разрешение от браузера ещё не значит, что подписка дошла до сервера: раньше при
    // упавшем сервере человек всё равно читал «Готово!» и ждал напоминаний, которых не будет.
    if (!res.ok) return "Разрешение выдано, но сервер напоминаний не ответил. Попробуй ещё раз чуть позже.";
    writeLS(PUSH_WANTED_KEY, true);
    writeLS(SYNC_KEY, new Date().toISOString());
    // сервер шлёт приветствие и возвращает код ответа Apple/Google: если доставка не прошла,
    // человек узнаёт сразу, а не через неделю тишины
    const j = (await res.json().catch(() => null)) as { welcome?: number } | null;
    const w = j?.welcome ?? 0;
    if (w && (w < 200 || w >= 300)) return `Подписка сохранена, но служба уведомлений не приняла пуш (код ${w}). Попробуй выключить и включить заново; если повторится — напиши автору этот код.`;
    return w ? "Готово! Сейчас придёт первое уведомление." : "Готово! Напоминания включены.";
  } catch {
    return "Не получилось включить напоминания. Попробуй ещё раз (на айфоне — открой приложение с иконки на «Домой»).";
  }
}
