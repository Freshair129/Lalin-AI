import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "./api";
import { useBatchQueue } from "./useBatchQueue";

vi.mock("./api", () => ({
  tts: { synth: vi.fn() },
  dubbing: { run: vi.fn() },
  mastering: { run: vi.fn() },
  jobs: { get: vi.fn(), watch: vi.fn(() => () => undefined) },
}));

describe("useBatchQueue continuity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(jobs.get).mockReset();
    vi.mocked(jobs.watch).mockClear();
  });

  it("persists queued items for a later reload", async () => {
    const { result } = renderHook(() => useBatchQueue());

    act(() => result.current.enqueue({ kind: "tts", label: "ทดสอบ", params: { text: "สวัสดี" } }));

    await waitFor(() => expect(window.localStorage.getItem("lalin:batch-queue")).not.toBeNull());
    const saved = JSON.parse(window.localStorage.getItem("lalin:batch-queue")!);
    expect(saved[0]).toMatchObject({ kind: "tts", label: "ทดสอบ", status: "pending" });
  });

  it("restores an interrupted backend job as interrupted", async () => {
    window.localStorage.setItem("lalin:batch-queue", JSON.stringify([{
      id: "batch-1", kind: "tts", label: "งานเดิม", params: {},
      status: "running", jobId: "job-1", progress: 0.4,
    }]));
    vi.mocked(jobs.get).mockResolvedValue({
      id: "job-1", kind: "tts", status: "interrupted", progress: 0.4,
      message: "งานหยุดลงเพราะแอปถูกปิดหรือ backend เริ่มใหม่", resource: "gpu",
      created_at: "x", updated_at: "x",
    });

    const { result } = renderHook(() => useBatchQueue());

    await waitFor(() => expect(result.current.items[0].status).toBe("interrupted"));
  });

  it("keeps a backend GPU wait visible as queued", async () => {
    window.localStorage.setItem("lalin:batch-queue", JSON.stringify([{
      id: "batch-2", kind: "tts", label: "รอ GPU", params: {},
      status: "queued", jobId: "job-2", progress: 0,
    }]));
    vi.mocked(jobs.get).mockResolvedValue({
      id: "job-2", kind: "tts", status: "queued", progress: 0,
      message: "รอ GPU: VRAM ว่างยังไม่พอ", resource: "gpu",
      created_at: "x", updated_at: "x",
    });

    const { result } = renderHook(() => useBatchQueue());

    await waitFor(() => expect(result.current.items[0].status).toBe("queued"));
    expect(jobs.get).toHaveBeenCalledWith("job-2");
    expect(jobs.watch).toHaveBeenCalledWith("job-2", expect.any(Function));
  });
});
