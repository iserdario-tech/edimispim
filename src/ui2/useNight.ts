import { useEffect, useState } from "react";
import { readTheme } from "../ui/theme.js";

/** Тёмная тема — выбранная вручную или системная. От неё зависит, всегда ли небо ночное. */
export function useDarkTheme(): boolean {
  const query = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const calc = () => { const t = readTheme(); return t === "dark" || (t === "auto" && !!query?.matches); };
  const [dark, setDark] = useState(calc);
  useEffect(() => {
    const on = () => setDark(calc());
    query?.addEventListener("change", on);
    window.addEventListener("storage", on);
    return () => { query?.removeEventListener("change", on); window.removeEventListener("storage", on); };
  }, []);
  return dark;
}
