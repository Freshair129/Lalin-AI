import { describe, expect, it } from "vitest";
import { runtimeDeviceWarning } from "./runtimeDevices";

describe("runtimeDeviceWarning", () => {
  it("explains an automatic CPU fallback in Thai", () => {
    expect(runtimeDeviceWarning({
      requested: "auto",
      effective: "cpu",
      fallback: true,
      reason: "cuda_unavailable",
    })).toBe("ไม่พบ GPU — กำลังใช้ CPU งานเสียงจะช้าลง");
  });
});
