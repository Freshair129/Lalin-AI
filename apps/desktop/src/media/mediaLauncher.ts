import { invoke } from "@tauri-apps/api/core";
import type {
  MediaLifecycleAction,
  MediaLifecycleRequest,
  MediaLifecycleState,
} from "@lalin/contracts";
import { isTauri } from "../playback/windowManager";

const MEDIA_START_TIMEOUT_MS = 5_000;
const MEDIA_STATUS_POLL_MS = 100;
let requestSequence = 0;

function nextRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  requestSequence += 1;
  return `media-${Date.now()}-${requestSequence}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "ไม่สามารถเชื่อมต่อ Lalin Cast launcher ได้";
}

function failedState(requestId: string, code: string, message: string): MediaLifecycleState {
  return { state: "failed", requestId, code, message };
}

export async function requestMediaLifecycle(
  action: MediaLifecycleAction,
): Promise<MediaLifecycleState> {
  const request: MediaLifecycleRequest = {
    action,
    requestId: nextRequestId(),
  };

  if (!isTauri()) {
    return failedState(
      request.requestId,
      "MEDIA_NATIVE_ONLY",
      "Lalin Cast launcher ใช้งานได้จาก Lalin Studio desktop เท่านั้น",
    );
  }

  try {
    return await invoke<MediaLifecycleState>("media_lifecycle", {
      action: request.action,
      requestId: request.requestId,
    });
  } catch (error) {
    return failedState(request.requestId, "MEDIA_LAUNCH_FAILED", errorMessage(error));
  }
}

export async function openMedia(): Promise<MediaLifecycleState> {
  const initial = await requestMediaLifecycle("focus");
  if (initial.state !== "starting") return initial;

  const deadline = Date.now() + MEDIA_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, MEDIA_STATUS_POLL_MS));
    const status = await requestMediaLifecycle("status");
    if (status.state === "ready") return status;
    if (status.state === "failed") return status;
    if (status.state === "stopped") {
      return failedState(
        status.requestId,
        "MEDIA_EXITED_EARLY",
        "Lalin Cast ปิดตัวก่อนพร้อมใช้งาน",
      );
    }
  }

  return failedState(
    initial.requestId,
    "MEDIA_START_TIMEOUT",
    "Lalin Cast ใช้เวลาเริ่มต้นนานเกินกำหนด กรุณาตรวจสอบ runtime แล้วลองใหม่",
  );
}

export function closeMedia(): Promise<MediaLifecycleState> {
  return requestMediaLifecycle("close");
}
