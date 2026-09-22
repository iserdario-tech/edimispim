/**
 * «Поделиться» через системное меню телефона — без серверов и аккаунтов.
 *
 * Рецепт и список покупок чаще всего нужны не тому, кто планирует, а тому, кто идёт
 * в магазин или стоит у плиты. На компьютере, где системного меню нет, текст просто
 * копируется — вставить его в чат можно одним движением.
 */
export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try { await navigator.share({ title, text }); return "shared"; }
    catch (e) { if ((e as Error)?.name === "AbortError") return "cancelled"; }
  }
  try { await navigator.clipboard.writeText(text); return "copied"; }
  catch { return "failed"; }
}

export const shareNoteRU = (r: Awaited<ReturnType<typeof shareText>>): string =>
  r === "copied" ? "Скопировано — вставь в чат" : r === "failed" ? "Не получилось — выдели текст вручную" : "";
