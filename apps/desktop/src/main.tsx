// @req NFR-04 — entry point ของ UI (mount React + theme)
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LalinPlayWindow } from "./components/LalinPlayWindow";
import "./styles.css";

const isPlaySurface = new URLSearchParams(window.location.search).get("surface") === "play";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPlaySurface ? <LalinPlayWindow /> : <App />}
  </React.StrictMode>
);
