import { ICONS, type IcoName } from "./icons.js";

/**
 * Значок из набора Solar. Двухцветный (синий + розовый) — для значков со смыслом;
 * `mono` — служебные (закрыть, стрелка, поиск): один цвет текста, второй тон полупрозрачный.
 */
export function Ico({ name, mono = false, className = "" }: { name: IcoName; mono?: boolean; className?: string }) {
  return (
    <svg className={"ico" + (mono ? " mono" : "") + (className ? " " + className : "")} viewBox="0 0 24 24"
      aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

/**
 * Эмодзи из данных дня → значок. Сами данные эмодзи не меняют: по ним ищется отбой
 * и последний кофе (useDay), а показывается — значок.
 */
const EMOJI: Record<string, IcoName> = {
  "☀️": "sun-2", "☀": "sun-2", "☕": "cup-hot", "⚡": "bolt", "😴": "moon-sleep", "☕😴": "cup-hot",
  "🚶": "walking", "🚿": "bath", "🌙": "moon", "🛌": "bed",
  "🍳": "chef-hat", "🍲": "plate", "🍽️": "plate", "🍽": "plate", "🍫": "donut", "🥜": "leaf", "🍴": "plate",
};
export const iconOf = (emoji: string | undefined): IcoName | undefined => (emoji ? EMOJI[emoji] : undefined);

/** Эмодзи из данных: значок, если есть, иначе — как было. */
export const EmojiIco = ({ e, className = "" }: { e: string; className?: string }) => {
  const n = iconOf(e);
  return n ? <Ico name={n} className={className} /> : <>{e}</>;
};
