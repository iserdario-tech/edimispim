import React from "react";
import { Sheet } from "../ui/Sheet.js";
import { Coach } from "../ui/Coach.js";
import { coachContext } from "../ui/useAppState.js";
import type { StoredState } from "../ui/storage.js";

const SCREEN_RU = { day: "«Сутки» — лента дня", eat: "«Еда» — меню и покупки", me: "«Я» — вес, сон, настройки" } as const;

/**
 * Коуч — шторкой с контекстом экрана, а не отдельной вкладкой: вопрос рождается там,
 * где человек сейчас («чем заменить ужин» — на «Еде»), и коуч должен это знать.
 */
export function AskSheet({ state, screen, onClose }: { state: StoredState; screen: keyof typeof SCREEN_RU; onClose: () => void }) {
  return (
    <Sheet title="Вопрос коучу" onClose={onClose}>
      <Coach contextRU={`${coachContext(state)}\nЧеловек сейчас смотрит экран ${SCREEN_RU[screen]}.`} />
    </Sheet>
  );
}
