/**
 * Сегодняшняя дата ПО МЕСТНОМУ времени.
 *
 * Почему не `new Date().toISOString().slice(0, 10)`: этот срез даёт дату по UTC.
 * Для человека в UTC+3, открывшего приложение в 01:30 ночи, он вернёт вчерашнее число —
 * отметка о сне уедет во вчерашний день, а план на «сегодня» построится по позавчерашней ночи.
 *
 * Для приложения о недосыпающих это не редкий угол: за полночь его и открывают.
 * В отрицательных поясах (Америка) та же ошибка зеркальна — вечером наступает «завтра».
 */
export function localDateISO(d: Date = new Date()): string {
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Минуты от полуночи по местному времени — для отметки «этот шаг уже прошёл». */
export const localMinutes = (d: Date = new Date()): number => d.getHours() * 60 + d.getMinutes();

/**
 * Дата через n суток от указанной. Считается в UTC-полдне, а не сложением 86400 секунд:
 * при переходе на летнее время сутки бывают 23 и 25 часов, и наивный сдвиг промахивается днём.
 */
export function plusDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

