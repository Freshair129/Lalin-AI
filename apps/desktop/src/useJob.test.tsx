import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "./api";
import { useJob } from "./useJob";

vi.mock("./api", () => ({
  jobs: {
    get: vi.fn(),
    watch: vi.fn(() => () => undefined),
  },
}));

const mockedGet = vi.mocked(jobs.get);
const mockedWatch = vi.mocked(jobs.watch);

describe("useJob continuity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedGet.mockReset();
    mockedWatch.mockClear();
  });

  it("re-attaches a persisted active job after reload", async () => {
    window.localStorage.setItem("lalin:job:tts", "job-1");
    mockedGet.mockResolvedValue({
      id: "job-1", kind: "tts", status: "queued", progress: 0,
      message: "รอคิว", resource: "gpu", created_at: "x", updated_at: "x",
    });

    const { result } = renderHook(() => useJob("tts"));

    await waitFor(() => expect(result.current.job?.id).toBe("job-1"));
    expect(result.current.busy).toBe(true);
    expect(mockedGet).toHaveBeenCalledWith("job-1");
    expect(mockedWatch).toHaveBeenCalledWith("job-1", expect.any(Function));
  });
});
