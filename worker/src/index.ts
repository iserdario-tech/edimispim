import { buildPushHTTPRequest } from "@pushforge/builder";
import type { Profile, DayMode, DayToggles } from "../../src/index.js";
import { planDay, parseHM } from "../../src/index.js";
import { dueWindows, checkinDue } from "../../src/push.js";
import { coachStream, type CoachTurn } from "./coach.js";

interface Env {
  SUBS: KVNamespace;
  VAPID_PRIVATE: string;  // приватный VAPID-ключ (JWK-строка), секрет
  AI: Ai;                 // бесплатная ИИ Cloudflare для коуча (биндинг из wrangler.toml)
}

const COACH_DAILY_LIMIT = 40; // эндпоинт публичный — без лимита любой выест бесплатную квоту ИИ за день
// ponytail: счётчик в KV по IP; KV не строго консистентен, для потолка запросов этого хватает.
async function overCoachLimit(env: Env, ip: string): Promise<boolean> {
  const key = `rl:${ip}:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.SUBS.get(key)) ?? 0);
  if (used >= COACH_DAILY_LIMIT) return true;
  await env.SUBS.put(key, String(used + 1), { expirationTtl: 172800 });
  return false;
}
interface StoredSub {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  profile: Profile;
  tzOffsetMin: number;
  // контекст дня из приложения: чтобы пуши шли по тому же плану, что человек видит на экране
  day?: { date: string; mode: DayMode; toggles: DayToggles; crunchUntilHM?: string };
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
      }));
      if (existing) return new Response("ok", { headers: CORS }); // тихая синхронизация — без приветствия
      // приветственный пуш — мгновенное подтверждение, что доставка работает (только при первой подписке)
      try {
        const { endpoint, headers: h, body: pb } = await buildPushHTTPRequest({
          privateJWK: JSON.parse(env.VAPID_PRIVATE),
          subscription: body.subscription!,
          message: {
            payload: { title: "pospat", body: "Напоминания включены ✅" },
            adminContact: "mailto:pospat@pospat.app",
            options: { ttl: 600, urgency: "high" },
          },
        });
        await fetch(endpoint, { method: "POST", headers: h, body: pb });
      } catch (_) { /* не критично */ }
      return new Response("ok", { headers: CORS });
    }

    if (req.method === "POST" && url.pathname === "/coach") {
      const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
      if (await overCoachLimit(env, ip))
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

    return new Response("pospat push", { headers: CORS });
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
      // Что шлём в это окно: шаги плана + утренняя отметка «как спалось?»
      const outgoing: { kind: string; title: string; body: string; data?: { url: string } }[] =
        dueWindows(plan.windows, minOfDay, 5).map((w) => ({ kind: w.kind, title: w.title, body: w.detail }));
      if (checkinDue(minOfDay, parseHM(s.profile.anchorWakeHM)))
        outgoing.push({ kind: "checkin", title: "Как спалось?", body: "Отметь подъём — план на день подстроится под тебя.", data: { url: "/pospat/#mark" } });

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
