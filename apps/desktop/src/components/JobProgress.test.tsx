import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobProgress } from "./JobProgress";

describe("JobProgress", () => {
  it("shows an interrupted job in Thai", () => {
    render(<JobProgress job={{
      id: "j", kind: "tts", status: "interrupted", progress: 0.4,
      message: "งานหยุดลงเพราะแอปถูกปิดหรือ backend เริ่มใหม่",
      resource: "gpu", created_at: "x", updated_at: "x",
    }} />);

    expect(screen.getByText("⚠️ งานถูกขัดจังหวะ")).toBeTruthy();
  });
});
