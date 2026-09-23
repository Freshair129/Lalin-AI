// Client สำหรับ GET /status ของ lalin voice worker status gateway
// ที่มาของสัญญา: apps/api/app/voice_worker/status_gateway.py -> status_view()
//
// ตั้งใจให้ไม่ผูกกับเฟรมเวิร์กใด ๆ (ไม่ import React) เพื่อให้ dashboard ตัวไหนก็ใช้ได้
// และ **ไม่มี token อยู่ในไฟล์นี้**: เบราว์เซอร์ต้องยิงผ่าน proxy ฝั่งเซิร์ฟเวอร์ที่เติม
// Authorization ให้ (ดู vite-proxy.snippet.ts) — token ที่ฝังในโค้ดหน้าเว็บคือ token ที่หลุดแล้ว

/** ค่าที่ gateway ส่งมาเมื่ออ่าน worker ได้สำเร็จ (HTTP 200) */
export type VoiceWorkerStatus = {
  ready: boolean;
  /** เหตุผลที่ยังไม่พร้อม เช่น engine ตายหรือกำลังอุ่นเครื่อง; null เมื่อพร้อม */
  reason: string | null;
  runtime_id: string | null;
  /** เปลี่ยนทุกครั้งที่ engine เริ่มใหม่ — ใช้ตรวจว่า worker restart ไปหรือเปล่า */
  runtime_epoch: string | null;
  kind: "asr" | "tts" | string | null;
  profile_id: string | null;
  profile_revision: string | null;
  engine: string | null;
  engine_version: string | null;
  /** true = ไม่ใช่โมเดลจริง เป็น stub ที่ติดป้ายไว้ ห้ามเอาผลไปใช้งานจริง */
  labeled_stub: boolean;
  device: { configured: string | null; effective: string | null } | null;
  /** warm-up เสร็จหรือยัง — งานแรกหลังบูตจะช้าถ้ายัง */
  warm: boolean | null;
  vram_bytes_reserved: number | null;
  engine_alive: boolean;
  heartbeat_age_seconds: number | null;
  draining: boolean;
  /** D18: ไม่ null แปลว่า worker ล็อกตัวเองหลังโดน OOM kill ซ้ำ และจะไม่กลับมาเอง */
  oom_lockout: Record<string, unknown> | null;
  capacity: { in_use?: number; max_concurrency?: number } | null;
  observed_at: string | null;
};

/** ผลลัพธ์ที่ panel เอาไปแสดงได้ตรง ๆ โดยไม่ต้อง try/catch เอง */
export type VoiceWorkerProbe =
  | { state: "ok"; status: VoiceWorkerStatus; fetchedAt: string }
  | { state: "worker-unreachable"; detail: string; fetchedAt: string }
  | { state: "worker-error"; detail: string; fetchedAt: string }
  | { state: "gateway-unreachable"; detail: string; fetchedAt: string };

/**
 * แยก "ติดต่อ gateway ไม่ได้" ออกจาก "gateway ตอบแต่ worker ล่ม" ให้ชัด
 * เพราะสองอย่างนี้ต้องไปแก้คนละที่: อย่างแรกคือเครือข่าย/proxy อย่างหลังคือตัว worker
 */
export async function probeVoiceWorker(
  url = "/api/voice-worker/status",
  init: RequestInit = {},
): Promise<VoiceWorkerProbe> {
  const fetchedAt = new Date().toISOString();
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init.headers } });
  } catch (error) {
    return { state: "gateway-unreachable", detail: String(error), fetchedAt };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // gateway ตอบไม่ใช่ JSON = มีอะไรอยู่ระหว่างทาง (proxy ผิด, หน้า login, ฯลฯ)
    return { state: "gateway-unreachable", detail: `HTTP ${response.status} ไม่ใช่ JSON`, fetchedAt };
  }

  if (response.ok) return { state: "ok", status: body as VoiceWorkerStatus, fetchedAt };

  const reason = (body as { reason?: string } | null)?.reason;
  if (response.status === 503 && reason === "worker_unreachable") {
    return { state: "worker-unreachable", detail: "gateway อ่าน socket ของ worker ไม่ได้", fetchedAt };
  }
  if (response.status === 502 && reason === "worker_error") {
    return { state: "worker-error", detail: `worker ตอบผิดปกติ (${JSON.stringify(body)})`, fetchedAt };
  }
  if (response.status === 401) {
    // ไม่ควรเกิดถ้า proxy เติม token ให้ถูก — ถ้าเกิดแปลว่า proxy ไม่ได้เติมหรือ token หมดอายุ/ถูกเปลี่ยน
    return { state: "gateway-unreachable", detail: "401: proxy ไม่ได้แนบ token ของ gateway", fetchedAt };
  }
  return { state: "gateway-unreachable", detail: `HTTP ${response.status}`, fetchedAt };
}

/** ป้ายสถานะแบบสั้นสำหรับหัวการ์ด — เรียงตามความร้ายแรง ไม่ใช่ตามลำดับฟิลด์ */
export function summarize(probe: VoiceWorkerProbe): { tone: "ok" | "warn" | "down"; label: string } {
  if (probe.state === "gateway-unreachable") return { tone: "down", label: "ติดต่อไม่ได้" };
  if (probe.state === "worker-unreachable") return { tone: "down", label: "worker ล่ม" };
  if (probe.state === "worker-error") return { tone: "down", label: "worker ผิดปกติ" };

  const s = probe.status;
  if (s.oom_lockout) return { tone: "down", label: "ล็อกเพราะ OOM (ต้องแก้ด้วยมือ)" };
  if (!s.engine_alive) return { tone: "down", label: "engine ตาย" };
  if (s.draining) return { tone: "warn", label: "กำลังปิดรับงาน" };
  if (!s.ready) return { tone: "warn", label: s.reason ? `ไม่พร้อม: ${s.reason}` : "ไม่พร้อม" };
  if (s.labeled_stub) return { tone: "warn", label: "พร้อม (แต่เป็น stub)" };
  if (!s.warm) return { tone: "warn", label: "พร้อม (ยังไม่อุ่น)" };
  return { tone: "ok", label: "พร้อมรับงาน" };
}
