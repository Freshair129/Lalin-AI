// วางบล็อก server.proxy นี้ลงใน vite.config.ts ของ GoVibe (หรือ dashboard ตัวอื่นที่ใช้ Vite)
//
// ทำไมต้อง proxy ไม่ยิงตรงจากเบราว์เซอร์:
//   1) /metrics และ /status ของ gateway ต้องมี bearer token — token ที่ส่งจากโค้ดหน้าเว็บคือ token
//      ที่ใครเปิด devtools ก็อ่านได้ เท่ากับหลุด
//   2) gateway ไม่ได้ตั้ง CORS ไว้ (ตั้งใจ) เบราว์เซอร์จึงยิงข้ามโดเมนไม่ได้อยู่แล้ว
//   proxy ทำให้ token อยู่แต่ใน process ของ dev server และหน้าเว็บเห็นแค่ path ของตัวเอง
//
// ตั้งค่าก่อนรัน (อย่าเขียน token ลงไฟล์ที่อยู่ใน git):
//   $env:LALIN_STATUS_GATEWAY_URL   = "http://100.76.19.65:9109"
//   $env:LALIN_STATUS_GATEWAY_TOKEN = "<token ของ gateway>"
//
// production ที่ serve ไฟล์ static ไม่มี dev server ให้ proxy — ต้องมี backend เล็ก ๆ
// ทำหน้าที่เดียวกันนี้ (ดู tools/dashboard/README.md)

import { defineConfig } from "vite";

const gatewayUrl = process.env.LALIN_STATUS_GATEWAY_URL ?? "http://127.0.0.1:9109";
const gatewayToken = process.env.LALIN_STATUS_GATEWAY_TOKEN ?? "";

export default defineConfig({
  server: {
    proxy: {
      "/api/voice-worker": {
        target: gatewayUrl,
        changeOrigin: true,
        // /api/voice-worker/status -> /status, /api/voice-worker/metrics -> /metrics
        rewrite: (path: string) => path.replace(/^\/api\/voice-worker/, ""),
        // ไม่ประกาศชนิดของ proxy เอง ปล่อยให้ Vite เป็นคนกำหนด (ชนิดต่างกันไปตามเวอร์ชันของ vite)
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq: { setHeader(key: string, value: string): void }) => {
            // ถ้าไม่ได้ตั้ง token ปล่อยให้ gateway ตอบ 401 ไปตรง ๆ จะได้รู้ตัวทันที
            // ดีกว่าแอบส่ง header ว่างแล้วไปงงทีหลังว่าทำไมไม่มีข้อมูล
            if (gatewayToken) proxyReq.setHeader("authorization", `Bearer ${gatewayToken}`);
          });
        },
      },
    },
  },
});
