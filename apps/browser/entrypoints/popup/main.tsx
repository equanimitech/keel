import React from "react";
import ReactDOM from "react-dom/client";
import { Popup } from "./Popup";
import "./style.css";

// keel theme on the document root (system-aware). Popup is keel-owned, so it
// carries keel's own light/dark via [data-keel-theme] (see ../../styles/tokens.css).
const media = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = (dark: boolean) =>
  document.documentElement.setAttribute(
    "data-keel-theme",
    dark ? "dark" : "light"
  );
applyTheme(media.matches);
media.addEventListener("change", (e) => applyTheme(e.matches));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
