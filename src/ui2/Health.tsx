import { healthFlags, type HealthFlag } from "../healthFlags.js";
import type { StoredState } from "../ui/storage.js";

/** Выводы анкет из состояния: общая проверка, апноэ и ночное питание (см. `healthFlags`). */
export const flagsOf = (state: StoredState): HealthFlag[] => healthFlags({
  screener: state.screener,
  ...(state.food?.screening ? { screening: state.food.screening } : {}),
  ...(state.food?.screen ? { screen: state.food.screen } : {}),
  ...(state.food?.profile ? { profile: state.food.profile } : {}),
});

/** Карточку на «Сутках» закрыли «Понятно»: подпись списка, который человек видел, и дата. */
export const HEALTH_SEEN_KEY = "edimispim.healthSeen";
export interface HealthSeen { sig: string; at: string }

/**
 * Список «что обсудить с врачом» — одинаковый в шторке с «Суток» и в «Я → Как ты спишь».
 * Без баллов и красного: что заметили, что это может значить и к кому идти.
 */
export function HealthList({ flags }: { flags: HealthFlag[] }) {
  return (
    <>
      {flags.map(f => (
        <section key={f.kind}>
          <p className="s-health-title">{f.titleRU}</p>
          <p className="s-muted">{f.messageRU}</p>
          <p className="s-small">{f.doctorRU}</p>
        </section>
      ))}
      <p className="s-small s-health-note">Это не диагноз: приложение видит только ответы в анкете. Поменять их можно в «Я → Настройки сна» (общая проверка) и «Я → Настройки еды» (храп и ночная еда).</p>
    </>
  );
}
