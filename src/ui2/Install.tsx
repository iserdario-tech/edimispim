import { Ico } from "./Ico.js";
/**
 * Первый экран на iPhone в Safari: «поставь на экран „Домой“».
 *
 * Без $99 Apple это единственный бесплатный способ дать друзьям приложение — и единственный
 * способ уберечь данные: Safari стирает хранилище сайта после недели простоя, а у установленного
 * приложения свой счётчик (webkit.org/blog/10218). Поэтому установка — первый шаг, а не совет в углу.
 */
export function Install({ onContinue, onRestore }: { onContinue: () => void; onRestore: () => void }) {
  return (
    <main className="s-screen s-install">
      <div className="s-app-icon" aria-hidden="true">e<span>&amp;</span>s</div>
      <h1 className="s-title s-center">edim &amp; spim</h1>
      <p className="s-sub s-center">Сон и еда — одни сутки</p>
      <section className="s-card">
        <h2 className="s-h2">Поставь на экран «Домой»</h2>
        <ol className="s-steps">
          <li><span><Ico name="upload-square" /></span>Нажми «Поделиться» в Safari</li>
          <li><span><Ico name="add-circle" /></span>Выбери «На экран Домой»</li>
          <li><span><Ico name="check-circle" /></span>Нажми «Добавить»</li>
        </ol>
        <p className="s-muted">Открывай с иконки — так Safari не сотрёт твои данные.</p>
      </section>
      <button className="s-btn s-wide" onClick={onContinue}>Продолжить в Safari</button>
      <button className="s-link s-center s-block" onClick={onRestore}>Есть копия данных? Загрузить</button>
    </main>
  );
}
