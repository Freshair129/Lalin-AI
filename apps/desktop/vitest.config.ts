import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// ตั้งค่า Vitest แยกจาก vite.config.ts (dev server) — ใช้ jsdom สำหรับ renderHook/DOM APIs
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
