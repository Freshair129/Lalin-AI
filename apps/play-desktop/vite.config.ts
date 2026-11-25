import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    // Cargo writes and locks files under src-tauri/target while it builds;
    // watching them crashes Vite on Windows with EBUSY.
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
