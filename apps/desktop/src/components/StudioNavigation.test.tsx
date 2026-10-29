import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioNavigation } from "./StudioNavigation";

describe("StudioNavigation", () => {
  beforeEach(() => localStorage.removeItem("lalin:sidebar-expanded"));
  it("collapses to accessible icons and restores labels when expanded", () => {
    const onNavigate = vi.fn();
    render(<StudioNavigation items={[{ id: "arrange", icon: "remix", label: "Arrange" }]} current="arrange" onNavigate={onNavigate} />);
    expect(screen.getByText("Arrange")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.queryByText("Arrange")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    expect(onNavigate).toHaveBeenCalledWith("arrange");
    fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));
    expect(screen.getByText("Arrange")).toBeTruthy();
  });
  it("remembers the collapsed rail after remounting", () => {
    const view = render(<StudioNavigation items={[{ id: "arrange", icon: "remix", label: "Arrange" }]} current="arrange" onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    view.unmount();
    render(<StudioNavigation items={[{ id: "arrange", icon: "remix", label: "Arrange" }]} current="arrange" onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeTruthy();
    expect(screen.queryByText("Arrange")).toBeNull();
  });
});
