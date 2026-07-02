/**
 * MicRecorder — บันทึกเสียงจากไมโครโฟน (getUserMedia + MediaRecorder)
 * ใช้ hook `useMicRecorder()` เพื่อ start/stop แล้วอัปโหลดไฟล์ที่ได้ขึ้น backend
 * (WP 3.1 — บันทึกเสียงเข้าแทร็กในไทม์ไลน์)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { files } from "../api";

export interface MicRecordResult {
  filename: string;
  url: string;
  blob: Blob;
}

export function useMicRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0); // วินาที
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // กำลังอัปโหลด

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startingRef = useRef(false); // กันกดเริ่มซ้ำระหว่างรอ getUserMedia (async gap)
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef(0);
  const startedAtRef = useRef(0);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* */ } });
    streamRef.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    cancelAnimationFrame(timerRef.current);
  }, []);

  // เริ่มบันทึก — ขอสิทธิ์ไมค์ + สร้าง MediaRecorder
  const start = useCallback(async () => {
    setError(null);
    if (recorderRef.current || startingRef.current) return; // กำลังบันทึก/กำลังเริ่มอยู่แล้ว
    startingRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      startingRef.current = false;
      setError("ไม่สามารถเข้าถึงไมโครโฟนได้ — กรุณาอนุญาตสิทธิ์การใช้งานไมค์ในเบราว์เซอร์");
      return;
    }
    if (!startingRef.current) {
      // ถูกยกเลิก/unmount ระหว่างรอ getUserMedia — หยุด track ที่เพิ่งได้มา ไม่ให้ไมค์ค้าง
      stream.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* */ } });
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream);
    } catch {
      startingRef.current = false;
      setError("เบราว์เซอร์นี้ไม่รองรับการบันทึกเสียง (MediaRecorder)");
      cleanupStream();
      return;
    }
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
    rec.start();
    startingRef.current = false;
    startedAtRef.current = performance.now();
    setElapsed(0);
    setRecording(true);

    const tick = () => {
      setElapsed((performance.now() - startedAtRef.current) / 1000);
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
  }, [cleanupStream]);

  // หยุดบันทึก → คืน Blob แล้วอัปโหลดขึ้น backend เป็น filename/url
  const stop = useCallback(async (): Promise<MicRecordResult | null> => {
    const rec = recorderRef.current;
    if (!rec) return null;
    stopTimer();
    setRecording(false);
    const mimeType = rec.mimeType || "audio/webm";
    const blob: Blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeType }));
      try { rec.stop(); } catch { resolve(new Blob(chunksRef.current, { type: mimeType })); }
    });
    recorderRef.current = null;
    cleanupStream();

    if (!blob.size) { setError("ไม่ได้บันทึกเสียง (ไฟล์ว่างเปล่า)"); return null; }

    setBusy(true);
    try {
      const ext = mimeType.includes("wav") ? "wav" : "webm";
      const file = new File([blob], `mic_${Date.now()}.${ext}`, { type: mimeType });
      const res = await files.upload(file);
      const url = files.inputUrl(res.filename);
      return { filename: res.filename, url, blob };
    } catch {
      setError("อัปโหลดเสียงที่บันทึกไม่สำเร็จ");
      return null;
    } finally {
      setBusy(false);
    }
  }, [cleanupStream, stopTimer]);

  // ยกเลิกกลางคัน (ไม่อัปโหลด) — ใช้ตอน unmount หรือผู้ใช้กด cancel
  const cancel = useCallback(() => {
    startingRef.current = false; // ยกเลิก start ที่กำลังรอ getUserMedia (ถ้ามี)
    const rec = recorderRef.current;
    if (rec) { try { rec.stop(); } catch { /* */ } }
    recorderRef.current = null;
    stopTimer();
    cleanupStream();
    setRecording(false);
    setElapsed(0);
  }, [cleanupStream, stopTimer]);

  useEffect(() => () => { stopTimer(); cancelAnimationFrame(timerRef.current); cancel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { recording, elapsed, error, busy, start, stop, cancel };
}

// ── ตัวแสดงสถานะบันทึกเสียง (indicator + เวลา) — inline styles เท่านั้น ──
export function MicRecordIndicator({ recording, elapsed }: { recording: boolean; elapsed: number }) {
  if (!recording) return null;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 12, background: "rgba(255,64,64,0.14)", color: "#ff5050", fontFamily: "monospace", fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff3030", animation: "gmusic-rec-blink 1s infinite" }} />
      กำลังบันทึก {fmt(elapsed)}
      <style>{`@keyframes gmusic-rec-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
    </span>
  );
}
