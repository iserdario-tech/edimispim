/**
 * Второй провайдер — Groq (OpenAI-совместимый API, бесплатный тариф с отдельными лимитами).
 *
 * Бесплатная нейросеть Cloudflare даёт 10 000 нейронов в день — ≈100 вопросов на всех. Groq идёт первым,
 * Cloudflare — запасной: упал или исчерпан один — отвечает другой, и «коуч недоступен» человек видит
 * только когда легли все.
 *
 * Лимит Groq — 8 000 токенов В МИНУТУ на каждую модель (промпт коуча ≈3 300): одна модель — это два
 * вопроса в минуту. Поэтому моделей три, по очереди: у каждой свой минутный лимит.
 */
export interface ChatMsg { role: "system" | "user" | "assistant"; content: string }

const URL = "https://api.groq.com/openai/v1/chat/completions";
/** По порядку: сильнейшая первой; остальные подхватывают, когда у первой кончился минутный лимит. */
export const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] as const;

/** Ответ Groq не 2xx: статус нужен, чтобы отличить «подожди минуту» (429) от «сломалось». */
export class GroqError extends Error {
  constructor(readonly status: number, detail: string) { super(`groq ${status} ${detail}`); }
}

function body(model: string, messages: ChatMsg[], maxTokens: number, temperature: number, stream: boolean): string {
  return JSON.stringify({
    model, messages, max_tokens: maxTokens, temperature, stream,
    // у открытых моделей OpenAI «рассуждение» отдельно от ответа; low — чтобы отвечала быстро
    ...(model.startsWith("openai/") ? { reasoning_effort: "low" } : {}),
  });
}

async function call(key: string, model: string, messages: ChatMsg[], maxTokens: number, temperature: number, stream: boolean): Promise<Response> {
  const res = await fetch(URL, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body(model, messages, maxTokens, temperature, stream) });
  if (!res.ok || !res.body) throw new GroqError(res.status, (await res.text().catch(() => "")).slice(0, 120));
  return res;
}

/** Поток SSE: формат `data: {"choices":[{"delta":{"content":"…"}}]}` — приложение его уже понимает. */
export async function groqStream(key: string, model: string, messages: ChatMsg[], maxTokens: number, temperature: number): Promise<ReadableStream> {
  return (await call(key, model, messages, maxTokens, temperature, true)).body!;
}

/** Один ответ целиком — для оценки еды (нужен JSON, не поток). */
export async function groqText(key: string, model: string, messages: ChatMsg[], maxTokens: number, temperature: number): Promise<string> {
  const j = (await (await call(key, model, messages, maxTokens, temperature, false)).json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}
