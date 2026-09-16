import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

vi.hoisted(() => {
  vi.stubGlobal("__APP_VERSION__", "test");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

// การ import/mount Studio ต้องไม่แตะ owner แม้ยังไม่ได้กด Play
vi.mock("./audioEngine", () => { throw new Error("Studio imported consumer audio engine"); });
vi.mock("./mediaSessionAdapter", () => { throw new Error("Studio imported consumer media session"); });
vi.mock("../hooks/useBackendReadiness", () => ({
  useBackendReadiness: () => ({ state: "offline", online: false, brainName: "", retry: vi.fn() }),
}));
vi.mock("../hooks/useRuntimeActivity", () => ({ useRuntimeActivity: () => null }));
vi.mock("../components/UpdateChecker", () => ({ UpdateChecker: () => null }));
const launch = vi.hoisted(() => vi.fn(async () => false));
vi.mock("./windowManager", () => ({ openOrFocusPlayWindow: launch }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); launch.mockClear(); });

describe("Studio consumer playback ownership", () => {
  it("imports and mounts without constructing an owner; all launchers surface popup failure", async () => {
    render(<App />);
    expect(launch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Open Lalin Play"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("ป๊อปอัป"));
    fireEvent.click(screen.getByTitle("Open Lalin Play (Secondary Window & Media Player)"));
    await waitFor(() => expect(launch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("button", { name: "Lalin Play (Media Player + EQ)…" }));
    await waitFor(() => expect(launch).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
