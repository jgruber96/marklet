import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/preview.css";
import "./styles/print.css";
import App from "./App";
import { applyAccent, applyTheme, cachedAccent, cachedTheme } from "./lib/stores/settings";

applyTheme(cachedTheme());
applyAccent(cachedAccent());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
