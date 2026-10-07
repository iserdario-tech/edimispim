import { buildPushHTTPRequest } from "@pushforge/builder";
import type { Profile, DayMode, DayToggles } from "../../src/index.js";
import { planDay, parseHM } from "../../src/index.js";
import { planPushes, mealPushes, checkinDue, ALL_PUSHES, type PushMeal, type PushPrefs } from "../../src/push.js";
import { coachStream, type CoachTurn } from "./coach.js";
import { estimateFood } from "./estimate.js";

interface Env {
  SUBS: KVNamespace;
  VAPID_PRIVATE: string;  // приватный VAPID-ключ (JWK-строка), секрет
  AI: Ai;                 // бесплатная ИИ Cloudflare для коуча (биндинг из wrangler.toml)
}

const COACH_DAILY_LIMIT = 40; // эндпоинт публичный — без лимита любой выест бесплатную квоту ИИ за день
// ponytail: счётчик в KV по IP; KV не строго консистентен, для потолка запросов этого хватает.
async function overLimit(env: Env, prefix: string, ip: string, limit: number): Promise<boolean> {
  const key = `${prefix}:${ip}:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.SUBS.get(key)) ?? 0);
  if (used >= limit) return true;
  await env.SUBS.put(key, String(used + 1), { expirationTtl: 172800 });
  return false;
}
interface StoredSub {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  profile: Profile;
  tzOffsetMin: number;
  // контекст дня из приложения: чтобы пуши шли по тому же плану, что человек видит на экране
  day?: { date: string; mode: DayMode; toggles: DayToggles; crunchUntilHM?: string };
  // меню на сегодня и завтра (дата → приёмы): меню считается на телефоне, сервер его не знает
  meals?: Record<string, PushMeal[]>;
  // переключатели «Еда / Кофе и дневной сон / Сон» из «Я → Напоминания»
  prefs?: PushPrefs;
  // «что уже отправлено сегодня» лежит в отдельном ключе sent:<endpoint> — см. scheduled()
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const JSON_CORS: Record<string, string> = { ...CORS, "content-type": "application/json" };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/subscribe") {
      const body = (await req.json()) as Partial<StoredSub>;
      if (!body?.subscription?.endpoint)
        return new Response("bad request", { status: 400, headers: CORS });
      // приложение шлёт сюда же тихие обновления профиля/дня — тогда запись уже есть
      const existingRaw = await env.SUBS.get(body.subscription.endpoint);
      const existing = existingRaw ? (JSON.parse(existingRaw) as StoredSub) : null;
      await env.SUBS.put(body.subscription.endpoint, JSON.stringify({
        subscription: body.subscription,
        profile: body.profile,
        tzOffsetMin: body.tzOffsetMin ?? 0,
        ...(body.day ? { day: body.day } : existing?.day ? { day: existing.day } : {}),
        ...(body.meals ? { meals: body.meals } : existing?.meals ? { meals: existing.meals } : {}),
        ...(body.prefs ? { prefs: body.prefs } : existing?.prefs ? { prefs: existing.prefs } : {}),
      }));
      if (existing) return new Response("ok", { headers: CORS }); // тихая синхронизация — без приветствия
      // приветственный пуш — мгновенное подтверждение, что доставка работает (только при первой подписке)
      try {
        const { endpoint, headers: h, body: pb } = await buildPushHTTPRequest({
          privateJWK: JSON.parse(env.VAPID_PRIVATE),
          subscription: body.subscription!,
          message: {
            payload: { title: "edim & spim", body: "Напоминания включены ✅" },
            adminContact: "mailto:pospat@pospat.app",
            options: { ttl: 600, urgency: "high" },
          },
        });
        await fetch(endpoint, { method: "POST", headers: h, body: pb });
      } catch (_) { /* не критично */ }
      return new Response("ok", { headers: CORS });
    }

    /*
     * Копия в облаке. Приложение шлёт адрес копии (SHA-256 от кода — код сюда не приходит)
     * и данные, зашифрованные на телефоне. Здесь их не прочитать. Восстановление ограничено
     * 20 попытками в день с адреса — подобрать чужой код через сервер нельзя.
     */
    if (req.method === "POST" && (url.pathname === "/backup" || url.pathname === "/restore")) {
      const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
      const body = (await req.json().catch(() => ({}))) as { id?: unknown; data?: unknown };
      const id = typeof body.id === "string" && /^[0-9a-f]{64}$/.test(body.id) ? body.id : null;
      if (!id) return new Response("bad request", { status: 400, headers: CORS });
      if (url.pathname === "/backup") {
        const data = typeof body.data === "string" && body.data.length <= 2_000_000 && /^[A-Za-z0-9+/=]+$/.test(body.data) ? body.data : null;
        if (!data) return new Response("bad request", { status: 400, headers: CORS });
        if (await overLimit(env, "wb", ip, 30)) return new Response("limit", { status: 429, headers: CORS });
        await env.SUBS.put(`bk:${id}`, data, { expirationTtl: 400 * 86400 });  // копию трогают раз в день — живёт год с запасом
        return new Response("ok", { headers: CORS });
      }
      if (await overLimit(env, "rb", ip, 20)) return new Response("limit", { status: 429, headers: CORS });
      const data = await env.SUBS.get(`bk:${id}`);
      return data ? new Response(data, { headers: CORS }) : new Response("not found", { status: 404, headers: CORS });
    }

    if (req.method === "POST" && url.pathname === "/coach") {
      const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
      if (await overLimit(env, "rl", ip, COACH_DAILY_LIMIT))
        return new Response(JSON.stringify({ error: "На сегодня хватит вопросов — продолжим завтра." }), { status: 429, headers: JSON_CORS });
      const body = (await req.json()) as { messages?: CoachTurn[]; contextRU?: string };
      const messages = (body.messages ?? []).slice(-10); // держим короткий хвост: дешевле и достаточно
      if (!messages.length || messages.some((m) => !m.content?.trim()))
        return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: JSON_CORS });
      try {
        const stream = await coachStream({ ai: env.AI, messages, contextRU: body.contextRU ?? "Ничего не известно." });
        return new Response(stream, { headers: { ...CORS, "content-type": "text/event-stream" } });
      } catch (e) {
        console.error("coach error", String((e as any)?.message ?? e));
        return new Response(JSON.stringify({ error: "Коуч сейчас недоступен. Попробуй позже." }), { status: 502, headers: JSON_CORS });
      }
    }

    // «Напиши, что съел»: тот же дневной лимит, что у коуча — это тоже вызов модели
    if (req.method === "POST" && url.pathname === "/estimate") {
      // сначала проверяем запрос, потом тратим лимит: пустой запрос не должен съедать квоту
      const body = (await req.json().catch(() => ({}))) as { text?: unknown };
      const text = typeof body.text === "string" ? body.text.trim().slice(0, 300) : "";
      if (!text) return new Response(JSON.stringify({ error: "Напиши, что съел." }), { status: 400, headers: JSON_CORS });
      const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
      if (await overLimit(env, "rl", ip, COACH_DAILY_LIMIT))
        return new Response(JSON.stringify({ error: "На сегодня хватит — продолжим завтра." }), { status: 429, headers: JSON_CORS });
      try {
        const est = await estimateFood(env.AI, text);
        if (!est) return new Response(JSON.stringify({ error: "Не понял, что это за еда. Попробуй написать иначе." }), { status: 422, headers: JSON_CORS });
        return new Response(JSON.stringify(est), { headers: JSON_CORS });
      } catch (e) {
        console.error("estimate error", String((e as any)?.message ?? e));
        return new Response(JSON.stringify({ error: "Оценка сейчас недоступна. Попробуй позже." }), { status: 502, headers: JSON_CORS });
      }
    }

    return new Response("edim & spim push", { headers: CORS });
  },

  async scheduled(_evt: ScheduledController, env: Env): Promise<void> {
    const privateJWK = JSON.parse(env.VAPID_PRIVATE);
    const nowUtcMin = Math.floor(Date.now() / 60000);
    // В этом же KV лежат счётчики лимита коуча (rl:…) и отметки об отправке (sent:…).
    // Ключ подписки — всегда push-endpoint, то есть https://… Без фильтра крон падал бы
    // на первом же служебном ключе и не рассылал НИЧЕГО.
    const list = await env.SUBS.list({ prefix: "https://" });
    for (const k of list.keys) {
      const raw = await env.SUBS.get(k.name);
      if (!raw) continue;
      const s = JSON.parse(raw) as StoredSub;
      if (!s?.profile?.anchorWakeHM) continue; // битая/чужая запись — пропускаем, а не роняем рассылку
      const localMin = nowUtcMin + (s.tzOffsetMin ?? 0);
      const minOfDay = ((localMin % 1440) + 1440) % 1440;
      const localDate = new Date(localMin * 60000).toISOString().slice(0, 10);

      // контекст дня берём из приложения, если он за сегодня; иначе обычный день
      const d = s.day && s.day.date === localDate ? s.day : null;
      const plan = planDay({
        profile: s.profile,
        ctx: {
          date: localDate,
          mode: d?.mode ?? "normal",
          ...(d?.mode === "crunch" && d.crunchUntilHM ? { crunchUntilHM: d.crunchUntilHM } : {}),
          toggles: d?.toggles ?? {},
        },
        lastNight: { wokeHM: s.profile.anchorWakeHM, quality: 3 },
        history: [],
      });
      // Что шлём в это окно: шаги плана заранее, готовка еды, утренняя отметка «как спалось?».
      // Меню — только если приложение открывали недавно: дальше чем на завтра оно его не присылает.
      const prefs = s.prefs ?? ALL_PUSHES;
      const wakeMin = parseHM(s.profile.anchorWakeHM);
      const outgoing = [
        ...planPushes(plan.windows, minOfDay, 5, prefs),
        ...(prefs.food ? mealPushes(s.meals?.[localDate] ?? [], minOfDay, 5, wakeMin) : []),
      ];
      if (prefs.sleep && checkinDue(minOfDay, wakeMin))
        outgoing.push({ kind: "checkin", title: "Как спалось?", body: "Отметь подъём — план на день подстроится под тебя.", data: { url: "/edimispim/#night" } });

      // «что уже отправлено сегодня» держим отдельным ключом: эту запись пишет только крон,
      // а профиль/контекст дня — только /subscribe. Иначе два писателя затирали бы друг друга
      // (KV не сразу консистентен), и человек получал бы повторные пуши.
      const sentKey = `sent:${k.name}`;
      const prevRaw = await env.SUBS.get(sentKey);
      const prev = prevRaw ? (JSON.parse(prevRaw) as { date: string; kinds: string[] }) : null;
      const sent = prev && prev.date === localDate ? prev : { date: localDate, kinds: [] as string[] };
      let changed = false;
      for (const o of outgoing) {
        if (sent.kinds.includes(o.kind)) continue;
        try {
          const { endpoint, headers, body } = await buildPushHTTPRequest({
            privateJWK,
            subscription: s.subscription,
            message: {
              payload: { title: o.title, body: o.body, ...(o.data ? { data: o.data } : {}) },
              adminContact: "mailto:pospat@pospat.app",
              options: { ttl: 3600, urgency: "normal" },
            },
          });
          const res = await fetch(endpoint, { method: "POST", headers, body });
          if (res.status === 404 || res.status === 410) { await env.SUBS.delete(k.name); }
          else { sent.kinds.push(o.kind); changed = true; }
        } catch (_) { /* пропускаем сбойную отправку */ }
      }
      if (changed) await env.SUBS.put(sentKey, JSON.stringify(sent), { expirationTtl: 172800 });
    }
  },
};
