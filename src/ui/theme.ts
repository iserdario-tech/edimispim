/**
 * Тема: системная, светлая или тёмная.
 *
 * По умолчанию — системная: HIG прямо говорит следовать настройке устройства.
 * Ручной выбор нужен тем, у кого система всегда в одной теме, а приложение хочется
 * в другой; он пишется в localStorage и ставит data-theme на <html>, который
 * перекрывает медиазапрос prefers-color-scheme в tokens.css.
 */

export type ThemeChoice = "auto" | "light" | "dark";

const KEY = "edimispim.theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch { return "auto"; }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try { localStorage.setItem(KEY, choice); } catch { /* приватный режим */ }
}
