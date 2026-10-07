/**
 * Второй провайдер — Groq (OpenAI-совместимый API, бесплатный тариф с отдельными дневными лимитами).
 *
 * Бесплатная нейросеть Cloudflare даёт 10 000 нейронов в день — при промпте коуча в 6 тыс. токенов
 * это ≈40–60 вопросов на всех. Groq идёт первым (быстрее и лимит больше), Cloudflare — запасной:
 * упал или исчерпан один — отвечает другой, и «коуч недоступен» человек видит только когда легли оба.
 */
export interface ChatMsg { role: "system" | "user" | "assistant"; content: string }

const URL = "https://api.groq.com/openai/v1/chat/completions";
/** Модель Groq: открытая OpenAI, хорошо держит русский; reasoning «low» — чтобы отвечала быстро. */
export const GROQ_MODEL = "openai/gpt-oss-120b";

function body(messages: ChatMsg[], maxTokens: number, temperature: number, stream: boolean): string {
  return JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature, stream, reasoning_effort: "low" });
}

/** Поток SSE: формат `data: {"choices":[{"delta":{"content":"…"}}]}` — приложение его уже понимает. */
export async function groqStream(key: string, messages: ChatMsg[], maxTokens: number, temperature: number): Promise<ReadableStream> {
  const res = await fetch(URL, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body(messages, maxTokens, temperature, true) });
  if (!res.ok || !res.body) throw new Error(`groq ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`);
  return res.body;
}

/** Один ответ целиком — для оценки еды (нужен JSON, не поток). */
export async function groqText(key: string, messages: ChatMsg[], maxTokens: number, temperature: number): Promise<string> {
  const res = await fetch(URL, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body(messages, maxTokens, temperature, false) });
  if (!res.ok) throw new Error(`groq ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}
