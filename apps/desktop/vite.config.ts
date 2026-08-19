import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// พอร์ตคงที่ 5173 เพื่อให้ Tauri devUrl ตรงกัน
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  // เวอร์ชันมาจาก package.json ที่เดียว — status bar จะได้ไม่โกหกหลัง bump version
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
