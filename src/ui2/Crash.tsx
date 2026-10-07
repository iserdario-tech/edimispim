import React from "react";
import { downloadBackup } from "../ui/dataSafety.js";

/**
 * Белый экран — худшее, что может случиться на телефоне: непонятно, живы ли данные.
 * Ошибка отрисовки ловится здесь; данные на месте (они пишутся на диск при каждом действии),
 * а человек видит, что делать: перезагрузить, а если не помогло — сначала сохранить копию.
 */
export class Crash extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <main className="s-screen">
        <h1 className="s-title">Что-то сломалось</h1>
        <p className="s-sub">Данные целы: они сохраняются при каждом действии. Перезагрузи приложение — обычно этого хватает.</p>
        <button className="s-btn food s-wide" onClick={() => location.reload()}>Перезагрузить</button>
        <button className="s-btn ghost s-wide" onClick={() => downloadBackup()}>Сохранить копию данных</button>
        <p className="s-small s-mt">Если повторяется — пришли этот текст: {this.state.error}</p>
      </main>
    );
  }
}
