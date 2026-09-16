// @req NFR-04 — entry point ของ UI (mount React + theme)
import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const isPlaySurface = new URLSearchParams(window.location.search).get("surface") === "play";
// แยก module realm: Studio ต้องไม่ import store ที่สร้าง consumer audio engine
const Surface = lazy(() => isPlaySurface
  ? import("./components/LalinPlayWindow").then((module) => ({ default: module.LalinPlayWindow }))
  : import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p role="status">กำลังเปิดหน้าต่าง…</p>}><Surface /></Suspense>
  </React.StrictMode>
);
