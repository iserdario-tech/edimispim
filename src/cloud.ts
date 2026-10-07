import { WORDS } from "./cloudWords.js";

/**
 * Копия в облаке по коду из четырёх слов.
 *
 * Код живёт только на телефоне. Из него выводятся две вещи: адрес копии на сервере
 * (SHA-256 — по нему код не восстановить) и ключ шифрования (PBKDF2 → AES-GCM). На сервер
 * уходят адрес и зашифрованные данные — прочитать их без кода не может никто, включая нас.
 * Потерял код — копию не открыть: это цена того, что её не открыть и чужим.
 */

const SET = new Set(WORDS);
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
// кусками: String.fromCharCode(...весь массив) падает на сотнях килобайт (предел числа аргументов)
const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function makeCode(): string {
  const r = crypto.getRandomValues(new Uint16Array(4));
  return [...r].map(n => WORDS[n % WORDS.length]).join("-");
}

/** «  Лиса, река ГРОМ — сыр » → «лиса-река-гром-сыр»: код набирают как попало. */
export const normCode = (s: string): string =>
  s.toLowerCase().replace(/ё/g, "е").split(/[^а-я]+/).filter(Boolean).join("-");

export const isCode = (s: string): boolean => {
  const w = normCode(s).split("-");
  return w.length === 4 && w.every(x => SET.has(x));
};

/** Адрес на сервере. `ns` разводит копию и пару: один и тот же код дал бы один адрес. */
export async function idOf(code: string, ns = "edimispim-id:"): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(ns + normCode(code))));
}

/** Отпечаток текста — чтобы не слать копию, которая не изменилась. */
export const fingerprint = async (text: string): Promise<string> =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));

// ponytail: соль постоянная — код и так уникален на человека; 300 тыс. итераций ≈ полсекунды на iPhone
async function keyOf(code: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(normCode(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("edimispim-backup"), iterations: 300_000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Данные → base64(iv | шифротекст). */
export async function encrypt(code: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(code), enc.encode(text)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}

/** Чужой код или испорченная копия — исключение (AES-GCM проверяет целостность). */
export async function decrypt(code: string, blob: string): Promise<string> {
  const all = unb64(blob);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await keyOf(code), all.slice(12));
  return new TextDecoder().decode(pt);
}
