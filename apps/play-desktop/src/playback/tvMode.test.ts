import { describe, expect, it, vi } from "vitest";
import {
  activateTvFocus,
  createGamepadAdapter,
  isTextEditingTarget,
  mapGamepadButton,
  mapTvKey,
  moveTvFocus,
  tvFocusableElements,
} from "./tvMode";

describe("TV mode input contract", () => {
  it("maps keyboard and standard gamepad buttons to semantic actions", () => {
    expect(mapTvKey({ code: "ArrowUp", key: "ArrowUp" })).toBe("up");
    expect(mapTvKey({ code: "Space", key: " " })).toBe("confirm");
    expect(mapTvKey({ code: "Escape", key: "Escape" })).toBe("back");
    expect(mapTvKey({ code: "Tab", key: "Tab" })).toBeNull();
    expect(mapGamepadButton(12)).toBe("up");
    expect(mapGamepadButton(0)).toBe("confirm");
    expect(mapGamepadButton(1)).toBe("back");
    expect(mapGamepadButton(9)).toBe("menu");
    expect(mapGamepadButton(7)).toBeNull();
  });

  it("moves focus and activates only controls inside the TV root", () => {
    const root = document.createElement("div");
    root.innerHTML = '<button data-tv-focusable="true">One</button><button data-tv-focusable="true">Two</button>';
    document.body.append(root);
    const controls = tvFocusableElements(root);
    controls[0].focus();

    expect(moveTvFocus(root, "down")).toBe(true);
    expect(document.activeElement).toBe(controls[1]);
    expect(moveTvFocus(root, "down")).toBe(true);
    expect(document.activeElement).toBe(controls[0]);

    const click = vi.spyOn(controls[0], "click");
    expect(activateTvFocus(root)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it("does not intercept form editing targets", () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    expect(isTextEditingTarget(input)).toBe(true);
    expect(isTextEditingTarget(div)).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });

  it("edge-triggers gamepad buttons and cancels polling on cleanup", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const handle = nextFrame++;
      frames.set(handle, callback);
      return handle;
    });
    const cancelFrame = vi.fn((handle: number) => frames.delete(handle));
    let pressed = false;
    const button = { get pressed() { return pressed; } } as GamepadButton;
    const gamepad = { index: 0, buttons: [button] } as unknown as Gamepad;
    const actions: string[] = [];
    const cleanup = createGamepadAdapter(
      { onAction: (action) => actions.push(action) },
      { getGamepads: () => [gamepad], requestFrame, cancelFrame },
    );

    const first = [...frames.values()][0];
    first(0);
    pressed = true;
    [...frames.values()][0](0);
    [...frames.values()][0](0);
    expect(actions).toEqual(["confirm"]);

    pressed = false;
    [...frames.values()][0](0);
    pressed = true;
    [...frames.values()][0](0);
    expect(actions).toEqual(["confirm", "confirm"]);

    const frameKeys = [...frames.keys()];
    const activeFrame = frameKeys[frameKeys.length - 1];
    cleanup();
    cleanup();
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(activeFrame);
  });
});
