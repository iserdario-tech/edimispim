/**
 * «Напиши, что съел»: прикидка калорий и белка по словам человека.
 *
 * Своя еда была дырой в учёте: «своё» считалось по плановой порции, а то, что съедено
 * вне плана, не попадало никуда. Точность здесь грубая — модель прикидывает по типичным
 * порциям, ±30% это норма, — поэтому приложение везде показывает результат со знаком «≈».
 */
import { groqText, GROQ_MODELS } from "./llm.js";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const PROMPT = `Ты считаешь калории еды по описанию на русском. Человек пишет, что съел.
Оцени по ТИПИЧНОЙ порции, если размер не указан. Ответь ТОЛЬКО JSON без пояснений:
{"items":[{"name":"шаурма","kcal":560,"protein":28}],"note":"одна фраза: из чего оценка"}
Правила: kcal и protein — целые числа на весь указанный объём; напитки тоже считай;
если это не еда или описание пустое — {"items":[],"note":"не похоже на еду"}.`;

export interface Estimate { kcal: number; protein: number; labelRU: string }

/**
 * Разбор ответа модели. Модель иногда оборачивает JSON в текст или ```json — берём
 * первый объект; числа проверяем на здравый смысл, чтобы опечатка модели не записала
 * человеку 50 000 ккал.
 */
export function parseEstimate(raw: string): Estimate | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: unknown;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  const items = (obj as { items?: unknown })?.items;
  if (!Array.isArray(items) || !items.length) return null;
  const ok = items.filter((i): i is { name: string; kcal: number; protein?: number } =>
    !!i && typeof i.name === "string" && Number.isFinite(i.kcal) && i.kcal >= 0 && i.kcal <= 3000);
  if (!ok.length) return null;
  const kcal = Math.round(ok.reduce((s, i) => s + i.kcal, 0));
  const protein = Math.round(ok.reduce((s, i) => s + (Number.isFinite(i.protein) && i.protein! >= 0 && i.protein! <= 200 ? i.protein! : 0), 0));
  if (kcal > 5000) return null;
  return { kcal, protein, labelRU: ok.map(i => `${i.name} ≈ ${Math.round(i.kcal)}`).join(", ") };
}

export async function estimateFood(ai: Ai, text: string, groqKey?: string): Promise<Estimate | null> {
  const messages = [{ role: "system" as const, content: PROMPT }, { role: "user" as const, content: text }];
  // Groq первым (модели по очереди), Cloudflare запасным — как у коуча
  for (const model of groqKey ? GROQ_MODELS : []) {
    try { return parseEstimate(await groqText(groqKey!, model, messages, 300, 0.1)); }
    catch (e) { console.log("groq estimate failed", model, String(e).slice(0, 160)); }
  }
  const res = (await ai.run(MODEL as keyof AiModels, {
    messages,
    max_tokens: 300,
    temperature: 0.1,
  } as never)) as { response?: unknown; choices?: { message?: { content?: string } }[] };
  const raw = typeof res.response === "string" ? res.response
    : res.response && typeof res.response === "object" ? JSON.stringify(res.response)
    : res.choices?.[0]?.message?.content ?? "";
  return parseEstimate(raw);
}
