import { useEffect } from "react";

/**
 * Высота экранной клавиатуры в CSS-переменной `--kb`.
 *
 * Закреплённая внизу панель ввода на iOS не знает, что клавиатура закрыла нижнюю часть
 * экрана: `position: fixed` считается от layout viewport, который при её появлении не
 * меняется, — и поле уезжает под клавиатуру. `visualViewport` знает настоящую видимую
 * область, из разницы и получается высота клавиатуры.
 *
 * Где API нет (старые браузеры), переменная остаётся нулём и всё работает как раньше.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    /*
     * Порог в 120 px обязателен. Разница между `innerHeight` и видимой областью бывает
     * и без всякой клавиатуры: в Safari при прокрутке сворачивается адресная строка, и
     * панель ввода уезжала с экрана на ровном месте. Клавиатура же занимает минимум
     * четверть экрана — ниже порога это точно не она.
     */
    const apply = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      // `Number.isFinite` здесь не перестраховка: одно негодное значение — и переменная
      // становится «NaNpx», а с ней ломается всё правило, в которое она подставлена
      const kb = Number.isFinite(hidden) && hidden > 120 ? Math.round(hidden) : 0;
      document.documentElement.style.setProperty("--kb", `${kb}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.documentElement.style.removeProperty("--kb");
    };
  }, []);
}
