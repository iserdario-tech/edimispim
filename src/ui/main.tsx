import React from "react";
import { createRoot } from "react-dom/client";
import { readTheme, applyTheme } from "./theme.js";
import { App } from "./App.js";
import "./ui.css";

// тема ставится до первой отрисовки, иначе экран мигнёт чужим фоном
applyTheme(readTheme());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
