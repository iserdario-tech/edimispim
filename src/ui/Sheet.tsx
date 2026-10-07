import React, { useEffect } from "react";
import { Ico } from "../ui2/Ico.js";
import { createPortal } from "react-dom";

/**
 * Шторка снизу — для деталей блюда.
 *
 * Зачем не раскрытие на месте: список меню раздвигался на пол-экрана, соседние дни
 * уезжали вниз, и человек терял место, куда смотрел. Шторка накрывает список, а при
 * закрытии он остаётся ровно там же.
 *
 * Через портал в body: fixed внутри карточки ловит любой transform у предка и уезжает
 * в конец страницы — на этом уже один раз обожглись с панелью чата.
 */
export function Sheet({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // пока шторка открыта, фон не листается: иначе палец скроллит список под ней
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}
        onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <strong>{title}</strong>
          <button className="sheet-close" onClick={onClose} aria-label="Закрыть"><Ico name="close" mono /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
