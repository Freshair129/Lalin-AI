# ต่อ dashboard เข้ากับ voice worker

ชุดไฟล์ใน `govibe/` เป็นชิ้นส่วนสำเร็จรูปสำหรับให้ **dashboard ที่มีอยู่แล้ว** (GoVibe Mission Control หรือตัวอื่น)
แสดงสถานะของ voice worker โดยไม่ต้องแก้ตัว worker และไม่ต้องรู้จัก Prometheus

ถ้าอยากได้กราฟย้อนหลังและระบบแจ้งเตือน ให้ใช้สแตก Prometheus + Grafana ที่ `docker/monitoring/` แทน
สองทางนี้ใช้ร่วมกันได้ เพราะ `/status` กับ `/metrics` เป็นคนละเส้นทางของ gateway ตัวเดียวกัน

## ทำไมเบราว์เซอร์ต้องยิงผ่าน proxy

`/status` และ `/metrics` ของ gateway ต้องมี bearer token

- **token ที่ส่งจากโค้ดหน้าเว็บ คือ token ที่หลุดแล้ว** ใครเปิด devtools ก็อ่านได้ และ token นี้ใช้อ่านสถานะของ
  worker ทุกเครื่องที่ใช้ token เดียวกัน
- gateway ไม่ได้ตั้ง CORS ไว้ (ตั้งใจ) เบราว์เซอร์จึงยิงข้ามโดเมนไม่ได้อยู่แล้ว

ทางออกมาตรฐานคือให้ **ฝั่งเซิร์ฟเวอร์ของ dashboard** เป็นคนถือ token แล้ว proxy ให้ หน้าเว็บเห็นแค่ path ของตัวเอง

```
เบราว์เซอร์ ──/api/voice-worker/status──▶ dev server หรือ backend ของ dashboard
                                           │ (เติม Authorization: Bearer …)
                                           ▼
                                      status gateway :9109 ──unix socket──▶ voice worker
```

## ไฟล์ในชุดนี้

| ไฟล์ | หน้าที่ |
|---|---|
| `govibe/vite-proxy.snippet.ts` | บล็อก `server.proxy` สำหรับ `vite.config.ts` — เติม token ให้ใน process ของ dev server |
| `govibe/voiceWorkerStatus.ts` | ชนิดข้อมูลของ `/status` + `probeVoiceWorker()` + `summarize()` ไม่ผูกกับเฟรมเวิร์ก |
| `govibe/VoiceWorkerPanel.tsx` | การ์ด React พร้อมใช้ ดึงซ้ำทุก 10 วินาที |
| `govibe/env.d.ts` | ประกาศ `process.env` เท่าที่ snippet ใช้ — **ไม่ต้องคัดลอก** ถ้าโปรเจกต์ปลายทางมี `@types/node` อยู่แล้ว |

## วิธีติดตั้งกับ GoVibe

1. คัดลอก `voiceWorkerStatus.ts` และ `VoiceWorkerPanel.tsx` ไปไว้ใน `src/` ของ GoVibe
2. รวมบล็อก `server.proxy` จาก `vite-proxy.snippet.ts` เข้ากับ `vite.config.ts` ที่มีอยู่ (อย่าเขียนทับทั้งไฟล์ —
   ของเดิมมี `plugins: [react()]` และ `server.port` อยู่)
3. วาง `<VoiceWorkerPanel />` ลงในหน้าที่ต้องการ
4. ตั้ง env ก่อนรัน dev server แล้ว restart (Vite อ่าน env ตอนโหลด config เท่านั้น)

```bash
export LALIN_STATUS_GATEWAY_URL=http://100.76.19.65:9109
export LALIN_STATUS_GATEWAY_TOKEN=<token ของ gateway>
```

ถ้าไม่ตั้ง `LALIN_STATUS_GATEWAY_TOKEN` proxy จะไม่แนบ header เลยและ gateway จะตอบ 401 ซึ่งการ์ดจะขึ้นว่า
"proxy ไม่ได้แนบ token ของ gateway" — ตั้งใจให้รู้ตัวทันที ดีกว่าเงียบแล้วไปงงทีหลัง

## production

dev server ของ Vite ไม่มีตอน serve ไฟล์ static ที่ build แล้ว ดังนั้น production ต้องมี backend เล็ก ๆ ทำงานแทน
คือรับ `/api/voice-worker/*` แล้วส่งต่อไป gateway พร้อมเติม header โดย token อ่านจาก env หรือไฟล์ที่ chmod 600
(nginx `proxy_set_header Authorization` ก็ได้เหมือนกัน) ตรรกะฝั่งหน้าเว็บไม่ต้องแก้อะไร เพราะยังเรียก path เดิม

## สิ่งที่หน้าจอนี้บอกได้และบอกไม่ได้

`/status` เป็นภาพ **ณ ตอนนี้** เท่านั้น ตอบได้ว่า "ตอนนี้พร้อมไหม ใช้ profile อะไร engine ยังอยู่ไหม"
ตอบไม่ได้ว่า "เมื่อวานล้มกี่ครั้ง" หรือ "ช้าลงตั้งแต่เมื่อไหร่" — คำถามย้อนหลังต้องใช้ Prometheus

ข้อมูลที่ส่งออกคัดมาเฉพาะฟิลด์ที่ปลอดภัย ไม่มีข้อความที่ถอดได้ ไม่มีข้อความ TTS ไม่มี attempt_id ไม่มี path ของไฟล์
(ดู `status_view()` ใน `apps/api/app/voice_worker/status_gateway.py`)

## ที่ตรวจแล้ว (2026-09-23)

- `tsc --noEmit` ผ่านทั้ง `voiceWorkerStatus.ts` และ `VoiceWorkerPanel.tsx`
- รัน Vite ด้วย `vite-proxy.snippet.ts` จริง แล้วเรียกผ่าน proxy ได้ทั้ง `/api/voice-worker/status` (JSON ของ worker
  ตัวจริง) และ `/api/voice-worker/metrics` (Prometheus text)
- เรนเดอร์ `<VoiceWorkerPanel />` ในเบราว์เซอร์จริง ขึ้นป้าย "พร้อมรับงาน" พร้อม profile/revision/engine/device ที่ถูกต้อง
- ทางที่ผิดพลาด: path ที่ไม่มีอยู่และ gateway ที่ปิดอยู่ ทั้งคู่ได้สถานะ `gateway-unreachable` และป้าย "ติดต่อไม่ได้"
