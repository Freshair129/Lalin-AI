import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// พอร์ตคงที่ 5173 เพื่อให้ Tauri devUrl ตรงกัน
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
});
