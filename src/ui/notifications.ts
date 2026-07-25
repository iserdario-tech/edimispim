import type { Profile, DayMode, DayToggles } from "../index.js";

export interface PushDay { date: string; mode: DayMode; toggles: DayToggles; crunchUntilHM?: string }

// Публичный VAPID-ключ (пара к приватному JWK на Worker — см. app/.vapid.json)
const VAPID_PUBLIC = "BPedDaxa5IPF3-WSZ-EyAats5dXnGuJMaLapSRCmElsllWNGFk7NcMyS-z-MEzM5iNtJMtEIxhTEUFqJL81fgo4";
// URL задеплоенного Worker (Cloudflare). Используется и пушами, и коучем.
export const BACKEND_URL = "https://pospat-push.pospat.workers.dev";

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
export async function syncPushContext(profile: Profile, day?: PushDay): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    // getRegistration, а не ready: ready висит вечно, если service worker не зарегистрирован
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return; // напоминания не включены — синхронизировать нечего
    await fetch(BACKEND_URL + "/subscribe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: sub, profile, tzOffsetMin: -new Date().getTimezoneOffset(), ...(day ? { day } : {}) }),
    });
  } catch { /* не критично: в следующий раз досинхронизируется */ }
}

export async function enableNotifications(profile: Profile, day?: PushDay): Promise<string> {
  if (iosNeedsInstall())
    return "На айфоне напоминания включаются только из приложения на экране «Домой». В Safari нажми «Поделиться» (квадрат со стрелкой) → «На экран „Домой“», потом открой pospat с иконки и снова нажми эту кнопку.";
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
    await fetch(BACKEND_URL + "/subscribe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: sub, profile, tzOffsetMin: -new Date().getTimezoneOffset(), ...(day ? { day } : {}) }),
    });
    return "Готово! Напоминания включены.";
  } catch {
    return "Не получилось включить напоминания. Попробуй ещё раз (на айфоне — открой приложение с иконки на «Домой»).";
  }
}
