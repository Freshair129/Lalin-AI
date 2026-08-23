export interface RuntimeDeviceState {
  requested: "auto" | "cpu" | "cuda";
  effective: "cpu" | "cuda" | null;
  fallback: boolean;
  reason: string | null;
  compute_type?: string | null;
}

export function runtimeDeviceWarning(device: RuntimeDeviceState | null | undefined): string | null {
  if (device?.fallback && device.effective === "cpu" && device.reason === "cuda_unavailable") {
    return "ไม่พบ GPU — กำลังใช้ CPU งานเสียงจะช้าลง";
  }
  return null;
}
